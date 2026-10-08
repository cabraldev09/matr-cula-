"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrganizationManager } from "@/lib/session";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { TIME_ZONES } from "@/features/organization/time-zones";


const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa.").max(120),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  timezone: z.enum(TIME_ZONES.map(([value]) => value) as [string, ...string[]]),
  emailDomain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => v.replace(/^@/, ""))
    .refine((v) => v === "" || /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v), "Domínio inválido (ex.: suaescola.com.br).")
    .transform((v) => v || null),
});

export async function updateOrganizationAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const { error } = await (await createClient())
      .from("organizations")
      .update({ name: parsed.data.name, brand_color: parsed.data.brandColor, timezone: parsed.data.timezone, email_domain: parsed.data.emailDomain })
      .eq("id", context.organization.organizationId);
    if (error) return fail("Não foi possível salvar.");
    revalidatePath("/", "layout");
    return ok(undefined, "Dados da empresa salvos.");
  } catch (err) {
    return toActionError(err);
  }
}

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Logo própria (marca branca): PNG, JPG ou WebP até 1 MB, conferido pelo conteúdo do arquivo. */
export async function uploadLogoAction(form: FormData): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    const file = form.get("logo");
    if (!(file instanceof File) || file.size === 0) return fail("Escolha uma imagem.");
    if (file.size > 1024 * 1024) return fail("A imagem precisa ter até 1 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = await fileTypeFromBuffer(bytes);
    const extension = type ? LOGO_TYPES[type.mime] : undefined;
    if (!type || !extension) return fail("Use uma imagem PNG, JPG ou WebP.");
    const organizationId = context.organization.organizationId;
    const supabase = await createClient();
    const path = `${organizationId}/logo-${randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("branding").upload(path, bytes, { contentType: type.mime, upsert: false });
    if (error) return fail("Não foi possível enviar a imagem.");
    const previous = context.organization.logoPath;
    const { error: updateError } = await supabase.from("organizations").update({ logo_path: path }).eq("id", organizationId);
    if (updateError) return fail("Não foi possível salvar a logo.");
    if (previous) await supabase.storage.from("branding").remove([previous]);
    revalidatePath("/", "layout");
    return ok(undefined, "Logo atualizada.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function removeLogoAction(): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    const supabase = await createClient();
    const previous = context.organization.logoPath;
    await supabase.from("organizations").update({ logo_path: null }).eq("id", context.organization.organizationId);
    if (previous) await supabase.storage.from("branding").remove([previous]);
    revalidatePath("/", "layout");
    return ok(undefined, "Logo removida.");
  } catch (err) {
    return toActionError(err);
  }
}
