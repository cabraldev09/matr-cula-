"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPlatformAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { MODULES } from "@/lib/modules";
import { logger } from "@/lib/logger";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { createEfiPlan, EfiRequestError, isEfiConfigured } from "@/services/billing/efi";

const moduleCodes = Object.keys(MODULES) as [keyof typeof MODULES, ...(keyof typeof MODULES)[]];
const limit = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().int().min(0).max(1_000_000).optional());

const planSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, "Código: letras minúsculas, números e hífen."),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  interval: z.enum(["month", "year"]),
  modules: z.array(z.enum(moduleCodes)).min(1, "Escolha pelo menos um módulo."),
  trialDays: z.coerce.number().int().min(0).max(90),
  isPublic: z.boolean(),
  active: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  limits: z.object({ users: limit, channels: limit, analyses: limit, ai_credits: limit }),
});

/** Cria ou edita um plano. Mudança de preço/intervalo cria um novo plano na Efí para as próximas assinaturas. */
export async function savePlanAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await assertPlatformAdmin();
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados do plano inválidos.");
    const p = parsed.data;
    const admin = createAdminClient();
    const limits = Object.fromEntries(Object.entries(p.limits).filter(([, v]) => v !== undefined));
    const row = {
      code: p.code,
      name: p.name,
      description: p.description,
      price_cents: p.priceCents,
      billing_interval: p.interval,
      modules: p.modules,
      limits,
      trial_days: p.trialDays,
      is_public: p.isPublic,
      active: p.active,
      sort_order: p.sortOrder,
      updated_at: new Date().toISOString(),
    };
    let id = p.id;
    if (id) {
      const { data: before } = await admin.from("plans").select("price_cents, billing_interval, name").eq("id", id).single();
      const billingChanged = before && (before.price_cents !== p.priceCents || before.billing_interval !== p.interval || before.name !== p.name);
      const { error } = await admin.from("plans").update({ ...row, ...(billingChanged ? { efi_plan_id: null } : {}) }).eq("id", id);
      if (error) return fail(/duplicate/.test(error.message) ? "Já existe um plano com este código." : "Não foi possível salvar o plano.");
    } else {
      const { data, error } = await admin.from("plans").insert(row).select("id").single();
      if (error || !data) return fail(/duplicate/.test(error?.message ?? "") ? "Já existe um plano com este código." : "Não foi possível criar o plano.");
      id = data.id as string;
    }
    revalidatePath("/admin/planos");
    revalidatePath("/conta/plano");
    return ok({ id: id! }, "Plano salvo.");
  } catch (err) {
    return toActionError(err);
  }
}

/** Cria o plano correspondente na Efí agora (senão é criado no primeiro checkout). */
export async function syncPlanWithEfiAction(planId: string): Promise<ActionResult> {
  try {
    await assertPlatformAdmin();
    if (!isEfiConfigured()) return fail("Configure as credenciais da Efí primeiro.");
    const admin = createAdminClient();
    const { data: plan } = await admin.from("plans").select("*").eq("id", z.string().uuid().parse(planId)).single();
    if (!plan) return fail("Plano não encontrado.");
    if (plan.efi_plan_id) return ok(undefined, "Plano já sincronizado.");
    const efiPlanId = await createEfiPlan({ name: plan.name, months: plan.billing_interval === "year" ? 12 : 1 });
    await admin.from("plans").update({ efi_plan_id: efiPlanId }).eq("id", plan.id);
    revalidatePath("/admin/planos");
    return ok(undefined, "Plano criado na Efí.");
  } catch (err) {
    if (err instanceof EfiRequestError) return fail(`Efí: ${err.detail}`);
    return toActionError(err);
  }
}

const subscriptionSchema = z.object({
  organizationId: z.string().uuid(),
  planId: z.string().uuid(),
  status: z.enum(["incomplete", "trialing", "active", "past_due", "canceled", "suspended"]),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Ajuste manual (cortesia, venda fora da Efí, correção). Fica registrado como pagamento manual. */
export async function setSubscriptionAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await assertPlatformAdmin();
    const parsed = subscriptionSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const { organizationId, planId, status, periodEnd } = parsed.data;
    const admin = createAdminClient();
    const { data: current } = await admin.from("subscriptions").select("payment_method, trial_used").eq("organization_id", organizationId).maybeSingle();
    const { error } = await admin.from("subscriptions").upsert({
      organization_id: organizationId,
      plan_id: planId,
      pending_plan_id: null,
      status,
      current_period_end: new Date(`${periodEnd}T23:59:59-03:00`).toISOString(),
      payment_method: current?.payment_method ?? "manual",
      trial_used: current?.trial_used ?? status === "trialing",
      updated_at: new Date().toISOString(),
    });
    if (error) return fail("Não foi possível salvar a assinatura.");
    logger.info("platform.subscription_set", { by: context.authUserId, organizationId, planId, status, periodEnd });
    revalidatePath(`/admin/empresas/${organizationId}`);
    return ok(undefined, "Assinatura atualizada.");
  } catch (err) {
    return toActionError(err);
  }
}

const addonSchema = z.object({
  organizationId: z.string().uuid(),
  module: z.enum(moduleCodes),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  note: z.string().trim().max(200).default(""),
});

export async function grantAddonAction(input: unknown): Promise<ActionResult> {
  try {
    await assertPlatformAdmin();
    const parsed = addonSchema.safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const { organizationId, module, expiresAt, note } = parsed.data;
    const { error } = await createAdminClient().from("organization_addons").upsert({
      organization_id: organizationId,
      module,
      expires_at: expiresAt ? new Date(`${expiresAt}T23:59:59-03:00`).toISOString() : null,
      note,
    });
    if (error) return fail("Não foi possível liberar o módulo.");
    revalidatePath(`/admin/empresas/${organizationId}`);
    return ok(undefined, "Módulo liberado.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function revokeAddonAction(input: unknown): Promise<ActionResult> {
  try {
    await assertPlatformAdmin();
    const parsed = z.object({ organizationId: z.string().uuid(), module: z.enum(moduleCodes) }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    await createAdminClient().from("organization_addons").delete().eq("organization_id", parsed.data.organizationId).eq("module", parsed.data.module);
    revalidatePath(`/admin/empresas/${parsed.data.organizationId}`);
    return ok(undefined, "Módulo removido.");
  } catch (err) {
    return toActionError(err);
  }
}
