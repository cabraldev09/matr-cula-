"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getSessionContext, requireOrganizationManager, UnauthorizedError, ModuleUnavailableError } from "@/lib/session";
import { appUrl } from "@/lib/app-url";
import { logger } from "@/lib/logger";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { buildProposalDocument, money } from "@/domain/proposal/document";
import { loadProposalSettings } from "@/features/proposals/settings";
import { buildPixPayload } from "@/services/payments/pix";
import { createEfiPaymentLink, EfiRequestError, testEfiCredentials } from "@/services/billing/efi";
import { ensurePaymentAccount, getOrganizationEfiCredentials, removeEfiCredentials, saveEfiCredentials } from "@/services/payments/accounts";
import { readableError } from "@/features/attendance/errors";

/** Membro ativo de uma empresa com o CRM no plano. */
async function requireCrm() {
  const context = await getSessionContext();
  if (!context?.organization) throw new UnauthorizedError();
  if (!context.entitlements?.modules.includes("crm")) throw new ModuleUnavailableError("crm");
  return context as typeof context & { organization: NonNullable<typeof context.organization> };
}

const termSchema = z.string().regex(/^\d{4}\.[12]$/, "Semestre de início inválido (ex.: 2026.2).");
const centsSchema = z.coerce.number().int().positive();

const proposalSchema = z.object({
  leadId: z.string().uuid().nullable().optional(),
  studentName: z.string().trim().min(2, "Informe o nome do aluno.").max(160),
  courseName: z.string().trim().min(2, "Informe o curso.").max(160),
  modality: z.string().trim().max(80).default(""),
  semesters: z.coerce.number().int().min(1).max(20),
  grossMonthlyCents: centsSchema,
  firstMonthlyCents: centsSchema,
  startTerm: termSchema,
});

export async function createProposalAction(input: unknown): Promise<ActionResult<{ id: string; token: string; url: string }>> {
  try {
    const context = await requireCrm();
    const parsed = proposalSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados da proposta inválidos.");
    const p = parsed.data;
    if (p.firstMonthlyCents > p.grossMonthlyCents) return fail("A primeira mensalidade não pode ser maior que a mensalidade bruta.");
    const supabase = await createClient();
    const organizationId = context.organization.organizationId;
    const settings = await loadProposalSettings(supabase, organizationId, context.organization.name);
    const document = buildProposalDocument({
      institutionName: settings.institutionName,
      institutionDocument: settings.institutionDocument,
      logo: { source: settings.logoSource, path: settings.logoPath },
      courseName: p.courseName,
      modality: p.modality,
      semesters: p.semesters,
      studentName: p.studentName,
      grossMonthlyCents: p.grossMonthlyCents,
      firstMonthlyCents: p.firstMonthlyCents,
      startTerm: p.startTerm,
      rules: settings.rules,
      projectionNote: settings.projectionNote,
      finalMessage: settings.finalMessage,
    });
    const { data, error } = await supabase
      .from("proposals")
      .insert({
        organization_id: organizationId,
        lead_id: p.leadId ?? null,
        student_name: p.studentName,
        course_name: p.courseName,
        modality: p.modality,
        semesters: p.semesters,
        gross_monthly_cents: p.grossMonthlyCents,
        first_monthly_cents: p.firstMonthlyCents,
        enrollment_fee_cents: settings.rules.enrollmentFeeCents,
        start_term: p.startTerm,
        snapshot: document,
        created_by: context.authUserId,
      })
      .select("id, public_token, number")
      .single();
    if (error || !data) return fail(readableError(error));
    revalidatePath("/crm");
    return ok({ id: data.id, token: data.public_token, url: appUrl(`/proposta/${data.public_token}`) }, `Proposta nº ${data.number} criada.`);
  } catch (err) {
    return toActionError(err);
  }
}

const chargeSchema = z.object({ leadId: z.string().uuid(), proposalId: z.string().uuid().nullable().optional(), method: z.enum(["efi_link", "pix_manual"]) });

export type ChargeResult = { id: string; method: "efi_link" | "pix_manual"; paymentUrl: string | null; pixPayload: string | null; amountCents: number };

/** Cobra a taxa de matrícula na conta do polo: link Efí (confirmação automática) ou Pix copia-e-cola. */
export async function createEnrollmentChargeAction(input: unknown): Promise<ActionResult<ChargeResult>> {
  try {
    const context = await requireCrm();
    const parsed = chargeSchema.safeParse(input);
    if (!parsed.success) return fail("Dados da cobrança inválidos.");
    const organizationId = context.organization.organizationId;
    const supabase = await createClient();
    const settings = await loadProposalSettings(supabase, organizationId, context.organization.name);
    const amountCents = settings.rules.enrollmentFeeCents;
    if (amountCents <= 0) return fail("Defina o valor da taxa de matrícula nas configurações da proposta.");
    const { data: lead } = await supabase.from("leads").select("id, contacts(name, email)").eq("organization_id", organizationId).eq("id", parsed.data.leadId).maybeSingle();
    if (!lead) return fail("Lead não encontrado.");
    const contact = (lead as unknown as { contacts: { name: string; email: string | null } | null }).contacts;

    if (parsed.data.method === "pix_manual") {
      if (!settings.pixKey) return fail("Cadastre a chave Pix do polo em CRM → Proposta e pagamentos.");
      const txid = `TAXA${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
      const pixPayload = buildPixPayload({
        key: settings.pixKey,
        merchantName: settings.pixMerchantName || settings.institutionName || context.organization.name,
        merchantCity: settings.pixCity || "BRASIL",
        amountCents,
        txid,
        description: "Taxa de matricula",
      });
      const { data, error } = await supabase
        .from("enrollment_charges")
        .insert({ organization_id: organizationId, lead_id: lead.id, proposal_id: parsed.data.proposalId ?? null, amount_cents: amountCents, method: "pix_manual", pix_payload: pixPayload })
        .select("id")
        .single();
      if (error || !data) return fail(readableError(error));
      revalidatePath("/crm");
      return ok({ id: data.id, method: "pix_manual", paymentUrl: null, pixPayload, amountCents }, "Pix gerado. Envie ao aluno e confirme quando receber.");
    }

    const credentials = await getOrganizationEfiCredentials(organizationId);
    if (!credentials) return fail("Cadastre as credenciais Efí do polo em CRM → Proposta e pagamentos, ou use Pix.");
    const secret = await ensurePaymentAccount(organizationId);
    const admin = createAdminClient();
    // A cobrança Efí só é gravada pelo servidor (o navegador não cria cobranças confirmáveis pelo provedor).
    const { data: charge, error } = await admin
      .from("enrollment_charges")
      .insert({ organization_id: organizationId, lead_id: lead.id, proposal_id: parsed.data.proposalId ?? null, amount_cents: amountCents, method: "efi_link" })
      .select("id")
      .single();
    if (error || !charge) return fail("Não foi possível registrar a cobrança.");
    try {
      const link = await createEfiPaymentLink(credentials, {
        itemName: "Taxa de matrícula",
        valueCents: amountCents,
        customId: charge.id,
        notificationUrl: appUrl(`/api/webhooks/efi-polo/${organizationId}?secret=${secret}`),
        email: contact?.email ?? null,
        expireAt: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        message: `Taxa de matrícula ${settings.institutionName}`.slice(0, 80),
      });
      await admin.from("enrollment_charges").update({ efi_charge_id: link.chargeId, payment_url: link.paymentUrl }).eq("id", charge.id);
      revalidatePath("/crm");
      return ok({ id: charge.id, method: "efi_link", paymentUrl: link.paymentUrl, pixPayload: null, amountCents }, "Link de pagamento gerado.");
    } catch (err) {
      await admin.from("enrollment_charges").update({ status: "canceled" }).eq("id", charge.id);
      if (err instanceof EfiRequestError) return fail(`A Efí recusou a cobrança: ${err.detail}`);
      throw err;
    }
  } catch (err) {
    return toActionError(err);
  }
}

export async function confirmChargeAction(chargeId: string): Promise<ActionResult> {
  try {
    await requireCrm();
    const { data, error } = await (await createClient()).rpc("confirm_enrollment_charge", { charge: z.string().uuid().parse(chargeId) });
    if (error) return fail(readableError(error));
    revalidatePath("/crm");
    return ok(undefined, data ? "Pagamento confirmado. Lead movido para Taxa paga." : "Esta cobrança já estava confirmada.");
  } catch (err) {
    return toActionError(err);
  }
}

/** Envia a proposta (e o link da taxa, se houver) pela conversa aberta do lead. */
export async function sendProposalWhatsappAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requireCrm();
    const parsed = z.object({ proposalId: z.string().uuid(), paymentUrl: z.string().url().nullable().optional(), pixPayload: z.string().max(512).nullable().optional() }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const supabase = await createClient();
    const organizationId = context.organization.organizationId;
    const { data: proposal } = await supabase.from("proposals").select("id, public_token, student_name, course_name, first_monthly_cents, leads!proposals_organization_id_lead_id_fkey(contact_id)").eq("organization_id", organizationId).eq("id", parsed.data.proposalId).maybeSingle();
    const contactId = (proposal as unknown as { leads: { contact_id: string } | null } | null)?.leads?.contact_id;
    if (!proposal || !contactId) return fail("Proposta sem lead vinculado.");
    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, status, assigned_to")
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .not("channel_id", "is", null)
      .neq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!conversation) return fail("O lead não tem conversa aberta no WhatsApp. Copie o link e envie manualmente.");
    if (conversation.status !== "open") return fail("Assuma a conversa em Atendimento antes de enviar.");
    const first = proposal.student_name.split(" ")[0];
    const lines = [
      `Olá, ${first}! Preparei sua proposta de bolsa para ${proposal.course_name}: a primeira mensalidade fica em ${money(proposal.first_monthly_cents / 100)}.`,
      `Veja todos os detalhes: ${appUrl(`/proposta/${proposal.public_token}`)}`,
    ];
    if (parsed.data.paymentUrl) lines.push(`Para garantir sua vaga, pague a taxa de matrícula aqui: ${parsed.data.paymentUrl}`);
    if (parsed.data.pixPayload) lines.push(`Para garantir sua vaga, pague a taxa de matrícula pelo Pix copia e cola:\n${parsed.data.pixPayload}`);
    const { error } = await supabase.rpc("queue_message", { conversation: conversation.id, message_body: lines.join("\n\n"), idempotency_key: randomUUID() });
    if (error) return fail(readableError(error));
    return ok(undefined, "Proposta enviada no WhatsApp.");
  } catch (err) {
    return toActionError(err);
  }
}

const efiSchema = z.object({ clientId: z.string().trim().min(10).max(200), clientSecret: z.string().trim().min(10).max(200), sandbox: z.boolean() });

/** Conta Efí do polo: confere a autenticação antes de salvar; o segredo fica cifrado. */
export async function saveEfiAccountAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    if (context.organization.role !== "owner") return fail("Somente o proprietário cadastra a conta de recebimento.");
    const parsed = efiSchema.safeParse(input);
    if (!parsed.success) return fail("Informe Client ID e Client Secret da aplicação Efí.");
    try {
      await testEfiCredentials(parsed.data);
    } catch (err) {
      return fail(err instanceof EfiRequestError ? `A Efí recusou as credenciais: ${err.detail}` : "Não foi possível falar com a Efí agora.");
    }
    await saveEfiCredentials(context.organization.organizationId, parsed.data);
    logger.info("crm.efi_account_saved", { organizationId: context.organization.organizationId, sandbox: parsed.data.sandbox });
    revalidatePath("/crm/configuracoes");
    return ok(undefined, "Conta Efí conectada.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function removeEfiAccountAction(): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    if (context.organization.role !== "owner") return fail("Somente o proprietário remove a conta de recebimento.");
    await removeEfiCredentials(context.organization.organizationId);
    revalidatePath("/crm/configuracoes");
    return ok(undefined, "Conta Efí desconectada.");
  } catch (err) {
    return toActionError(err);
  }
}
