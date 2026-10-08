"use server";

import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { prismaUnscoped } from "@/lib/prisma";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/session";
import { appUrl } from "@/lib/app-url";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { PORTAL_ORGANIZATION_COOKIE } from "@/features/auth/constants";

export type LoginState = { error?: string; info?: string } | undefined;

/** Destino interno seguro (evita redirecionamento aberto). */
function safeNext(value: FormDataEntryValue | null, fallback: string): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}

async function limited(key: string): Promise<boolean> {
  const ip = getClientIp(await headers());
  return !rateLimit(`${key}:${ip}`, { capacity: 8, refillPerMinute: 4 }).allowed;
}

const loginSchema = z.object({
  login: z.string().trim().min(1, "Informe seu e-mail.").max(254),
  password: z.string().min(1, "Informe a senha.").max(200),
});

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ login: formData.get("login"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (await limited("login")) return { error: "Muitas tentativas. Aguarde um minuto e tente de novo." };
  const portalSlug = typeof formData.get("portal") === "string" ? String(formData.get("portal")) : null;

  let email = parsed.data.login.toLowerCase();
  let portalOrganizationId: string | null = null;
  if (portalSlug) {
    const { data: organization } = await createAdminClient().from("organizations").select("id").eq("slug", portalSlug).maybeSingle();
    if (!organization) return { error: "Portal não encontrado." };
    portalOrganizationId = organization.id as string;
    if (!email.includes("@")) {
      // Login por RGM: resolve o e-mail da conta do aluno dentro da empresa do portal.
      const enrollment = await prismaUnscoped.studentEnrollment.findFirst({
        where: { organizationId: portalOrganizationId, rgm: parsed.data.login },
        select: { studentUser: { select: { email: true, isActive: true } } },
      });
      if (!enrollment?.studentUser?.isActive) return { error: "E-mail, RGM ou senha inválidos." };
      email = enrollment.studentUser.email;
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    return {
      error: /confirm/i.test(error.message)
        ? "Confirme seu e-mail pelo link que enviamos antes de entrar."
        : portalSlug
          ? "E-mail, RGM ou senha inválidos."
          : "E-mail ou senha inválidos.",
    };
  }
  if (portalOrganizationId) {
    (await cookies()).set(PORTAL_ORGANIZATION_COOKIE, portalOrganizationId, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
    redirect("/portal");
  }
  redirect(safeNext(formData.get("next"), "/inicio"));
}

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
  company: z.string().trim().min(2, "Informe o nome da empresa.").max(120),
  email: z.string().trim().email("E-mail inválido.").toLowerCase(),
  password: z.string().min(10, "A senha precisa ter pelo menos 10 caracteres.").max(200),
});

/** Cadastro self-service: cria a conta e a empresa vazia. O plano é escolhido em seguida. */
export async function signUpAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  if (await limited("signup")) return { error: "Muitas tentativas. Aguarde um minuto e tente de novo." };
  const next = safeNext(formData.get("next"), "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: appUrl(`/auth/confirm?next=${encodeURIComponent(next)}`),
      data: { display_name: parsed.data.name, pending_company: next === "/onboarding" ? parsed.data.company : null },
    },
  });
  if (error) {
    return { error: /registered|exists/i.test(error.message) ? "Este e-mail já tem conta. Entre ou recupere a senha." : "Não foi possível criar a conta." };
  }
  if (!data.session) return { info: "Enviamos um link de confirmação para o seu e-mail. Abra-o para continuar." };
  if (next !== "/onboarding") redirect(next);
  const { error: orgError } = await supabase.rpc("create_organization", { org_name: parsed.data.company, display_name: parsed.data.name });
  if (orgError) redirect("/onboarding");
  redirect("/conta/plano?novo=1");
}

const organizationSchema = z.object({
  company: z.string().trim().min(2, "Informe o nome da empresa.").max(120),
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
});

/** Cria uma empresa adicional (ou a primeira, quando o cadastro exigiu confirmação de e-mail). */
export async function createOrganizationAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = organizationSchema.safeParse({ company: formData.get("company"), name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", { org_name: parsed.data.company, display_name: parsed.data.name });
  if (error) {
    return { error: /limit/i.test(error.message) ? "Você atingiu o limite de empresas por conta." : "Não foi possível criar a empresa." };
  }
  (await cookies()).set(ACTIVE_ORGANIZATION_COOKIE, String(data), { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect("/conta/plano?novo=1");
}

export async function switchOrganizationAction(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("organizationId"));
  if (id.success) {
    (await cookies()).set(ACTIVE_ORGANIZATION_COOKIE, id.data, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  }
  redirect("/inicio");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  store.delete(ACTIVE_ORGANIZATION_COOKIE);
  const portal = store.get(PORTAL_ORGANIZATION_COOKIE)?.value;
  store.delete(PORTAL_ORGANIZATION_COOKIE);
  if (portal) {
    const { data } = await createAdminClient().from("organizations").select("slug").eq("id", portal).maybeSingle();
    if (data?.slug) redirect(`/p/${data.slug}`);
  }
  redirect("/login");
}

export async function portalLogoutAction() {
  await logoutAction();
}

const emailSchema = z.object({ email: z.string().trim().email("E-mail inválido.").toLowerCase() });

/** Envia o link de redefinição pelo Supabase Auth. A resposta não revela se o e-mail existe. */
export async function requestPasswordResetAction(input: unknown): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "E-mail inválido.");
  if (await limited("reset")) return fail("Muitas tentativas. Aguarde um minuto e tente de novo.");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: appUrl("/auth/confirm?next=/definir-senha"),
  });
  return ok(undefined, "Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha.");
}

const passwordSchema = z
  .object({ password: z.string().min(10, "A senha precisa ter pelo menos 10 caracteres.").max(200), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

/** Define a senha da sessão atual (após convite ou link de redefinição). */
export async function setPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Senha inválida.");
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return fail("Link expirado. Solicite um novo.");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return fail(/different|same/i.test(error.message) ? "Escolha uma senha diferente da atual." : "Não foi possível salvar a senha.");
  return ok(undefined, "Senha definida.");
}

const acceptSchema = z.object({ token: z.string().uuid(), name: z.string().trim().min(2, "Informe seu nome.").max(120) });

/** Aceita o convite com a conta logada (o e-mail precisa ser o mesmo do convite). */
export async function acceptInvitationAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = acceptSchema.safeParse({ token: formData.get("token"), name: formData.get("name") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Convite inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { invite_token: parsed.data.token, display_name: parsed.data.name });
  if (error) {
    if (/limit/i.test(error.message)) return { error: "A empresa atingiu o limite de usuários do plano. Avise o administrador." };
    if (/Already a member/i.test(error.message)) return { error: "Você já participa desta empresa." };
    return { error: "Convite inválido, expirado ou enviado para outro e-mail." };
  }
  (await cookies()).set(ACTIVE_ORGANIZATION_COOKIE, String(data), { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  redirect("/inicio");
}
