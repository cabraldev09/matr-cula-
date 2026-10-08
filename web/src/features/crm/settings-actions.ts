"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrganizationManager } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { proposalRulesSchema } from "@/domain/proposal/document";
import { readableError } from "@/features/attendance/errors";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Insere ou atualiza a linha da empresa. Sem upsert: o ON CONFLICT tentaria atualizar organization_id, que a equipe não pode alterar. */
async function writeSettings(supabase: Supabase, organizationId: string, values: Record<string, unknown>) {
  const { data: current, error } = await supabase.from("proposal_settings").select("organization_id").eq("organization_id", organizationId).maybeSingle();
  if (error) return error;
  const result = current
    ? await supabase.from("proposal_settings").update(values).eq("organization_id", organizationId)
    : await supabase.from("proposal_settings").insert({ organization_id: organizationId, ...values });
  return result.error;
}

const settingsSchema = z.object({
  institutionName: z.string().trim().min(2, "Informe o nome da instituição.").max(160),
  institutionDocument: z.string().trim().max(24).regex(/^[0-9./ -]*$/, "CNPJ inválido."),
  logoSource: z.enum(["upload", "preset_cruzeiro", "none"]),
  rules: proposalRulesSchema,
  projectionNote: z.string().trim().max(600),
  finalMessage: z.string().trim().max(600),
  pixKey: z.string().trim().max(77).optional().default(""),
  pixMerchantName: z.string().trim().max(60).optional().default(""),
  pixCity: z.string().trim().max(40).optional().default(""),
});

export async function saveProposalSettingsAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Configurações inválidas.");
    const p = parsed.data;
    const supabase = await createClient();
    const error = await writeSettings(supabase, context.organization.organizationId, {
      institution_name: p.institutionName,
      institution_document: p.institutionDocument,
      logo_source: p.logoSource,
      rules: p.rules,
      projection_note: p.projectionNote,
      final_message: p.finalMessage,
      pix_key: p.pixKey || null,
      pix_merchant_name: p.pixMerchantName || null,
      pix_city: p.pixCity || null,
      updated_at: new Date().toISOString(),
    });
    if (error) return fail(readableError(error));
    revalidatePath("/crm", "layout");
    return ok(undefined, "Configurações da proposta salvas.");
  } catch (err) {
    return toActionError(err);
  }
}

/** Logo própria da proposta: PNG ou JPG (formatos aceitos no PDF), até 1 MB. */
export async function uploadProposalLogoAction(form: FormData): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) return fail("Escolha uma imagem.");
    if (file.size > 1024 * 1024) return fail("A imagem precisa ter até 1 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = await fileTypeFromBuffer(bytes);
    if (!type || !["image/png", "image/jpeg"].includes(type.mime)) return fail("Use PNG ou JPG.");
    const organizationId = context.organization.organizationId;
    const supabase = await createClient();
    const path = `${organizationId}/proposal-logo-${randomUUID()}.${type.ext}`;
    const upload = await supabase.storage.from("branding").upload(path, bytes, { contentType: type.mime, upsert: false });
    if (upload.error) return fail("Não foi possível enviar a imagem.");
    const { data: previous } = await supabase.from("proposal_settings").select("logo_path").eq("organization_id", organizationId).maybeSingle();
    const error = await writeSettings(supabase, organizationId, { logo_source: "upload", logo_path: path, updated_at: new Date().toISOString() });
    if (error) return fail(readableError(error));
    if (previous?.logo_path) await supabase.storage.from("branding").remove([previous.logo_path]);
    revalidatePath("/crm", "layout");
    return ok(undefined, "Logo da proposta atualizada.");
  } catch (err) {
    return toActionError(err);
  }
}
