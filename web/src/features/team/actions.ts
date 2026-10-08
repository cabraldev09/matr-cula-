"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireOrganizationManager } from "@/lib/session";
import { prismaUnscoped } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { STAFF_ROLES } from "@/lib/rbac";
import { normalizeWhatsapp } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";
import { isEmailConfigured, sendMail } from "@/services/email/mailer";
import { inviteEmail } from "@/services/email/templates";
import { rateLimit } from "@/services/rate-limit/rate-limit";

const inviteSchema = z.object({
  email: z.string().trim().email("E-mail inválido.").toLowerCase(),
  role: z.enum(["admin", "supervisor", "agent"]),
});

/** Convite por e-mail (quando configurado) ou link para compartilhar. Vale 7 dias e uma única vez. */
export async function inviteMemberAction(input: unknown): Promise<ActionResult<{ link: string | null }>> {
  try {
    const context = await requireOrganizationManager();
    if (!rateLimit(`invite:${context.authUserId}`, { capacity: 10, refillPerMinute: 2 }).allowed) return fail("Aguarde antes de enviar outro convite.");
    const parsed = inviteSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const { data, error } = await (await createClient()).rpc("invite_member", {
      org: context.organization.organizationId,
      invite_email: parsed.data.email,
      invite_role: parsed.data.role,
    });
    if (error) return fail(/owner/.test(error.message) ? "Só o proprietário convida administradores." : "Não foi possível criar o convite.");
    const link = appUrl(`/convite/${(data as { token: string }).token}`);
    let sent = false;
    if (isEmailConfigured()) {
      try {
        await sendMail({
          to: parsed.data.email,
          kind: "INVITE",
          content: inviteEmail({ name: parsed.data.email, login: parsed.data.email, url: link, invitedBy: context.displayName, validDays: 7, institution: context.organization.name }),
        });
        sent = true;
      } catch (err) {
        logger.warn("team.invite_email_failed", { err: err instanceof Error ? err.message : String(err) });
      }
    }
    revalidatePath("/conta/equipe");
    return ok({ link: sent ? null : link }, sent ? "Convite enviado por e-mail." : "Convite criado. Copie o link e envie para a pessoa.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  try {
    await requireOrganizationManager();
    const { error } = await (await createClient()).rpc("revoke_invitation", { invitation_id: z.string().uuid().parse(id) });
    if (error) return fail("Não foi possível revogar.");
    revalidatePath("/conta/equipe");
    return ok(undefined, "Convite revogado.");
  } catch (err) {
    return toActionError(err);
  }
}

export async function setMemberRoleAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    const parsed = z.object({ userId: z.string().uuid(), role: z.enum(["admin", "supervisor", "agent"]) }).safeParse(input);
    if (!parsed.success) return fail("Dados inválidos.");
    const { error } = await (await createClient()).rpc("set_member_role", { org: context.organization.organizationId, member: parsed.data.userId, new_role: parsed.data.role });
    if (error) return fail(/owner/.test(error.message) ? "Só o proprietário altera administradores." : "Você não pode alterar este papel.");
    revalidatePath("/conta/equipe");
    return ok(undefined, "Papel atualizado.");
  } catch (err) {
    return toActionError(err);
  }
}

/** Remove da empresa: perde o acesso na hora; conversas e análises continuam com o histórico de autoria. */
export async function removeMemberAction(userId: string): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    const member = z.string().uuid().parse(userId);
    const { error } = await (await createClient()).rpc("remove_member", { org: context.organization.organizationId, member });
    if (error) return fail("Você não pode remover esta pessoa.");
    await prismaUnscoped.user.updateMany({ where: { organizationId: context.organization.organizationId, authUserId: member }, data: { isActive: false } });
    revalidatePath("/conta/equipe");
    return ok(undefined, "Pessoa removida da empresa.");
  } catch (err) {
    return toActionError(err);
  }
}

const curricularSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(STAFF_ROLES),
  poloCode: z.string().trim().max(20).optional().default(""),
  phone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .default("")
    .refine((v) => !v || normalizeWhatsapp(v) !== null, "Informe o WhatsApp com DDD.")
    .transform((v) => (v ? normalizeWhatsapp(v) : null)),
});

/**
 * Papel na análise curricular (Tutor, Analista, Coordenação…). Proprietários e administradores da
 * empresa são sempre administradores do módulo.
 */
export async function setCurricularProfileAction(input: unknown): Promise<ActionResult> {
  try {
    const context = await requireOrganizationManager();
    if (!context.entitlements?.modules.includes("analise_curricular")) return fail("O módulo de análise curricular não está no plano.");
    const parsed = curricularSchema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
    const organizationId = context.organization.organizationId;
    const membership = await (await createClient())
      .from("memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", parsed.data.userId)
      .eq("active", true)
      .maybeSingle();
    if (!membership.data) return fail("Pessoa não encontrada na equipe.");
    const manager = membership.data.role === "owner" || membership.data.role === "admin";
    if (manager && parsed.data.role !== "ADMIN") return fail("Proprietário e administradores da empresa têm acesso total à análise curricular.");
    const [{ data: authUser }, { data: profile }] = await Promise.all([
      createAdminClient().auth.admin.getUserById(parsed.data.userId),
      createAdminClient().from("profiles").select("display_name").eq("id", parsed.data.userId).maybeSingle(),
    ]);
    const email = authUser.user?.email ?? "";
    const name = (profile?.display_name as string | undefined) ?? email;
    await prismaUnscoped.user.upsert({
      where: { organizationId_authUserId: { organizationId, authUserId: parsed.data.userId } },
      create: { organizationId, authUserId: parsed.data.userId, email, name, role: parsed.data.role, poloCode: parsed.data.poloCode || null, phone: parsed.data.phone },
      update: { role: parsed.data.role, poloCode: parsed.data.poloCode || null, phone: parsed.data.phone, isActive: true },
    });
    revalidatePath("/conta/equipe");
    return ok(undefined, "Perfil da análise curricular atualizado.");
  } catch (err) {
    return toActionError(err);
  }
}
