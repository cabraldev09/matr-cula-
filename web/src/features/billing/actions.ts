"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireOrganizationManager } from "@/lib/session";
import { appUrl } from "@/lib/app-url";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { cancelEfiSubscription, createEfiPlan, createEfiSubscription, EfiRequestError, isEfiConfigured } from "@/services/billing/efi";
import { isValidDocument, onlyDigits } from "@/services/billing/documents";

const profileSchema = z.object({
  payerName: z.string().trim().min(2, "Informe o nome ou razão social.").max(120),
  document: z.string().transform(onlyDigits).refine(isValidDocument, "CPF ou CNPJ inválido."),
  email: z.string().trim().email("E-mail inválido.").toLowerCase(),
  phone: z.string().transform(onlyDigits).refine((v) => /^[0-9]{10,11}$/.test(v), "Telefone com DDD, só números."),
  street: z.string().trim().max(200).optional().default(""),
  number: z.string().trim().max(20).optional().default(""),
  neighborhood: z.string().trim().max(120).optional().default(""),
  zipcode: z.string().transform(onlyDigits).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  state: z.string().trim().toUpperCase().max(2).optional().default(""),
});

/** Dados do pagador. Gravados pelo servidor (a tabela não aceita escrita direta do navegador). */
export async function saveBillingProfileAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const { payerName, document, email, phone, ...address } = parsed.data;
    const { error } = await createAdminClient()
      .from("billing_profiles")
      .upsert({ organization_id: context.organization.organizationId, payer_name: payerName, document, email, phone, address, updated_at: new Date().toISOString() });
    if (error) return fail("Não foi possível salvar os dados de cobrança.");
    revalidatePath("/conta/plano");
    return ok(undefined, "Dados de cobrança salvos.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function startTrialAction(planCode: string): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    const { error } = await (await createClient()).rpc("start_trial", { org: context.organization.organizationId, plan_code: planCode });
    if (error) {
      if (/Trial already used/.test(error.message)) return fail("O período de teste já foi usado nesta empresa.");
      if (/owner/.test(error.message)) return fail("Somente o proprietário da empresa pode escolher o plano.");
      return fail("Este plano não tem período de teste.");
    }
    revalidatePath("/", "layout");
    return ok(undefined, "Período de teste iniciado.");
  } catch (err) {
    return toActionError(err);
  }
}

type PlanRow = { id: string; code: string; name: string; price_cents: number; billing_interval: "month" | "year"; efi_plan_id: number | null; active: boolean; is_public: boolean };

/** O plano da Efí é criado no primeiro checkout (ou pelo painel da plataforma). */
async function ensureEfiPlan(plan: PlanRow): Promise<number> {
  if (plan.efi_plan_id) return plan.efi_plan_id;
  const efiPlanId = await createEfiPlan({ name: plan.name, months: plan.billing_interval === "year" ? 12 : 1 });
  await createAdminClient().from("plans").update({ efi_plan_id: efiPlanId }).eq("id", plan.id).is("efi_plan_id", null);
  return efiPlanId;
}

const checkoutSchema = z.object({
  planCode: z.string().regex(/^[a-z0-9-]{2,40}$/),
  method: z.enum(["boleto", "credit_card"]),
  paymentToken: z.string().min(10).max(200).optional(),
});

export type CheckoutResult = { paymentUrl: string | null; pixCopyPaste: string | null; method: "boleto" | "credit_card" };

/**
 * Contrata ou troca de plano: uma nova assinatura é criada na Efí e a anterior é cancelada, sem
 * cobrança proporcional. Os módulos do novo plano são liberados quando a Efí confirmar o pagamento.
 */
export async function checkoutAction(input: unknown): Promise<ActionResult<CheckoutResult>> {
  try {
    const context = await requireOrganizationManager();
    if (context.organization.role !== "owner") return fail("Somente o proprietário da empresa contrata ou troca o plano.");
    const parsed = checkoutSchema.safeParse(input);
    if (!parsed.success) return fail("Dados de contratação inválidos.");
    if (parsed.data.method === "credit_card" && !parsed.data.paymentToken) return fail("Confira os dados do cartão.");
    if (!isEfiConfigured() || !getEnv().EFI_WEBHOOK_SECRET) {
      return fail("A cobrança automática ainda não foi configurada pela plataforma. Fale com o suporte.");
    }
    const organizationId = context.organization.organizationId;
    const admin = createAdminClient();
    const [{ data: plan }, { data: profile }, { data: current }] = await Promise.all([
      admin.from("plans").select("id, code, name, price_cents, billing_interval, efi_plan_id, active, is_public").eq("code", parsed.data.planCode).maybeSingle(),
      admin.from("billing_profiles").select("*").eq("organization_id", organizationId).maybeSingle(),
      admin.from("subscriptions").select("*").eq("organization_id", organizationId).maybeSingle(),
    ]);
    if (!plan || !plan.active || !plan.is_public) return fail("Plano indisponível.");
    if (!profile) return fail("Preencha os dados de cobrança antes de contratar.");
    if (current?.plan_id === plan.id && !current.pending_plan_id && ["active", "trialing"].includes(current.status) && current.efi_subscription_id) {
      return fail("Este já é o plano atual da empresa.");
    }
    const address = profile.address as Record<string, string>;
    if (parsed.data.method === "credit_card" && !(address.street && address.number && address.zipcode && address.city && address.state && address.neighborhood)) {
      return fail("Para pagar com cartão, preencha o endereço de cobrança completo.");
    }

    const efiPlanId = await ensureEfiPlan(plan as PlanRow);
    const created = await createEfiSubscription({
      efiPlanId,
      itemName: `Plano ${plan.name}`,
      valueCents: plan.price_cents,
      customer: { name: profile.payer_name, document: profile.document, email: profile.email, phone: profile.phone },
      method: parsed.data.method,
      paymentToken: parsed.data.paymentToken,
      billingAddress:
        parsed.data.method === "credit_card"
          ? { street: address.street, number: address.number, neighborhood: address.neighborhood, zipcode: address.zipcode, city: address.city, state: address.state }
          : undefined,
      customId: organizationId,
      notificationUrl: appUrl(`/api/webhooks/efi?secret=${encodeURIComponent(getEnv().EFI_WEBHOOK_SECRET!)}`),
    });

    // Quem já tem acesso mantém o plano atual; o novo plano entra quando a Efí confirmar o pagamento
    // (billing_apply_event aplica pending_plan_id), para que uma troca sem pagamento não libere módulos.
    const keepsAccess = current && ["active", "trialing", "past_due"].includes(current.status) && new Date(current.current_period_end) > new Date();
    const now = new Date().toISOString();
    const { error } = await admin.from("subscriptions").upsert({
      organization_id: organizationId,
      plan_id: keepsAccess ? current.plan_id : plan.id,
      pending_plan_id: keepsAccess ? plan.id : null,
      status: keepsAccess ? current.status : "incomplete",
      payment_method: parsed.data.method,
      current_period_start: keepsAccess ? current.current_period_start : now,
      current_period_end: keepsAccess ? current.current_period_end : now,
      cancel_at_period_end: false,
      trial_used: current?.trial_used ?? false,
      efi_subscription_id: created.subscriptionId,
      updated_at: now,
    });
    if (error) throw new Error(`subscription upsert: ${error.message}`);
    if (created.chargeId) {
      await admin.from("invoices").upsert(
        {
          organization_id: organizationId,
          plan_id: plan.id,
          amount_cents: plan.price_cents,
          status: "pending",
          method: parsed.data.method,
          description: `Assinatura ${plan.name}`,
          period_start: now,
          period_end: new Date(Date.now() + (plan.billing_interval === "year" ? 365 : 30) * 86_400_000).toISOString(),
          due_at: created.dueDate ? new Date(`${created.dueDate}T23:59:59-03:00`).toISOString() : now,
          efi_charge_id: created.chargeId,
          payment_url: created.paymentUrl,
          pix_copy_paste: created.pixCopyPaste,
        },
        { onConflict: "efi_charge_id" },
      );
    }
    if (current?.efi_subscription_id && current.efi_subscription_id !== created.subscriptionId) {
      await cancelEfiSubscription(current.efi_subscription_id).catch((err) =>
        logger.warn("billing.previous_cancel_failed", { organizationId, err: err instanceof Error ? err.message : String(err) }),
      );
    }
    revalidatePath("/", "layout");
    return ok(
      { paymentUrl: created.paymentUrl, pixCopyPaste: created.pixCopyPaste, method: parsed.data.method },
      parsed.data.method === "credit_card" ? "Pagamento enviado. Os módulos são liberados assim que a Efí confirmar." : "Cobrança gerada. Pague o boleto ou o Pix para liberar o plano.",
    );
  } catch (err) {
    if (err instanceof EfiRequestError) return fail(`A Efí recusou a operação: ${err.detail}`);
    return toActionError(err, "Não foi possível concluir a contratação.");
  }
}

/** Cancela a renovação: o acesso continua até o fim do período já pago. */
export async function cancelSubscriptionAction(): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    if (context.organization.role !== "owner") return fail("Somente o proprietário da empresa cancela o plano.");
    const admin = createAdminClient();
    const { data: current } = await admin.from("subscriptions").select("*").eq("organization_id", context.organization.organizationId).maybeSingle();
    if (!current || current.status === "canceled") return fail("Não há assinatura ativa para cancelar.");
    if (current.efi_subscription_id && isEfiConfigured()) await cancelEfiSubscription(current.efi_subscription_id);
    await admin
      .from("subscriptions")
      .update({ status: "canceled", cancel_at_period_end: true, updated_at: new Date().toISOString() })
      .eq("organization_id", context.organization.organizationId);
    revalidatePath("/", "layout");
    return ok(undefined, "Renovação cancelada. O acesso continua até o fim do período pago.");
  } catch (err) {
    if (err instanceof EfiRequestError) return fail(`A Efí recusou o cancelamento: ${err.detail}`);
    return toActionError(err);
  }
}
