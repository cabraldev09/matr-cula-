import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prismaUnscoped } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { can, type Permission } from "@/lib/rbac";
import { isModuleCode, type ModuleCode } from "@/lib/modules";
import type { Role } from "@/generated/prisma/enums";
import { PORTAL_ORGANIZATION_COOKIE } from "@/features/auth/constants";

export const ACTIVE_ORGANIZATION_COOKIE = "mp_org";

export type MemberRole = "owner" | "admin" | "supervisor" | "agent";

export interface OrganizationMembership {
  organizationId: string;
  name: string;
  slug: string;
  role: MemberRole;
  timezone: string;
  logoPath: string | null;
  brandColor: string;
}

export interface Entitlements {
  access: "full" | "read_only" | "none";
  modules: ModuleCode[];
  status: "trialing" | "active" | "past_due" | "canceled" | "suspended" | null;
  plan: { id: string; code: string; name: string; price_cents: number; billing_interval: string; limits: Record<string, number> } | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingPlanId: string | null;
  trialUsed: boolean;
}

export interface SessionContext {
  authUserId: string;
  email: string;
  displayName: string;
  memberships: OrganizationMembership[];
  /** Empresa ativa (cookie mp_org validado contra as associações), ou null se ainda não há empresa. */
  organization: OrganizationMembership | null;
  entitlements: Entitlements | null;
  isPlatformAdmin: boolean;
}

/** Usuário da análise curricular dentro da empresa ativa. */
export interface SessionUser {
  id: string;
  authUserId: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  memberRole: MemberRole | null;
  modules: ModuleCode[];
}

export class ForbiddenError extends Error {
  constructor(message = "Você não tem permissão para esta ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Sessão inválida. Faça login novamente.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ModuleUnavailableError extends ForbiddenError {
  constructor(public readonly module: ModuleCode) {
    super("Este recurso não está incluído no plano da sua empresa.");
    this.name = "ModuleUnavailableError";
  }
}

type MembershipRow = {
  organization_id: string;
  role: MemberRole;
  organizations: { name: string; slug: string; timezone: string; logo_path: string | null; brand_color: string } | null;
};

/** Identidade, empresas e direitos da requisição atual. Memoizado por requisição. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const authUserId = typeof claims?.sub === "string" ? claims.sub : null;
  if (!authUserId) return null;
  const email = typeof claims?.email === "string" ? claims.email : "";

  const [{ data: rows }, { data: profile }, { data: isPlatformAdmin }] = await Promise.all([
    supabase
      .from("memberships")
      .select("organization_id, role, organizations(name, slug, timezone, logo_path, brand_color)")
      .eq("user_id", authUserId)
      .eq("active", true)
      .order("created_at"),
    supabase.from("profiles").select("display_name").eq("id", authUserId).maybeSingle(),
    supabase.rpc("am_platform_admin"),
  ]);
  const memberships: OrganizationMembership[] = ((rows ?? []) as unknown as MembershipRow[])
    .filter((row) => row.organizations)
    .map((row) => ({
      organizationId: row.organization_id,
      name: row.organizations!.name,
      slug: row.organizations!.slug,
      role: row.role,
      timezone: row.organizations!.timezone,
      logoPath: row.organizations!.logo_path,
      brandColor: row.organizations!.brand_color,
    }));

  const preferred = (await cookies()).get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  const organization = memberships.find((m) => m.organizationId === preferred) ?? memberships[0] ?? null;

  let entitlements: Entitlements | null = null;
  if (organization) {
    const { data } = await supabase.rpc("my_entitlements", { org: organization.organizationId });
    if (data) {
      entitlements = {
        access: data.access,
        modules: ((data.modules as string[]) ?? []).filter(isModuleCode),
        status: data.status ?? null,
        plan: data.plan ?? null,
        currentPeriodEnd: data.current_period_end ?? null,
        cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
        pendingPlanId: data.pending_plan_id ?? null,
        trialUsed: Boolean(data.trial_used),
      };
    }
  }

  return {
    authUserId,
    email,
    displayName: (profile as { display_name?: string } | null)?.display_name ?? email.split("@")[0] ?? "Usuário",
    memberships,
    organization,
    entitlements,
    isPlatformAdmin: Boolean(isPlatformAdmin),
  };
});

/** Empresa da requisição atual, usada pelo cliente Prisma com escopo. */
export async function resolveRequestTenant(): Promise<string | null> {
  const context = await getSessionContext();
  if (context?.organization) return context.organization.organizationId;
  return (await getStudentUser())?.organizationId ?? null;
}

async function organizationHasModule(organizationId: string, module: ModuleCode): Promise<boolean> {
  const rows = await prismaUnscoped.$queryRaw<{ allowed: boolean }[]>`select private.has_module(${organizationId}::uuid, ${module}) as allowed`;
  return Boolean(rows[0]?.allowed);
}

/**
 * Aluno no portal: não é membro da equipe; tem um perfil STUDENT na empresa cujo portal usou para
 * entrar (cookie definido no login). O portal exige o módulo portal_aluno no plano da empresa.
 */
const getStudentUser = cache(async (): Promise<SessionUser | null> => {
  const context = await getSessionContext();
  const organizationId = (await cookies()).get(PORTAL_ORGANIZATION_COOKIE)?.value;
  if (!context || !organizationId || !/^[0-9a-f-]{36}$/.test(organizationId)) return null;
  const user = await prismaUnscoped.user.findUnique({
    where: { organizationId_authUserId: { organizationId, authUserId: context.authUserId } },
  });
  if (!user || user.role !== "STUDENT" || !user.isActive) return null;
  if (!(await organizationHasModule(organizationId, "portal_aluno"))) return null;
  await touchActivity(user.id, user.lastActiveAt, !user.lastLoginAt);
  return {
    id: user.id,
    authUserId: context.authUserId,
    email: user.email,
    name: user.name,
    role: "STUDENT",
    organizationId,
    organizationName: "",
    memberRole: null,
    modules: ["portal_aluno"],
  };
});

export function hasModule(context: SessionContext | null, module: ModuleCode): boolean {
  return Boolean(context?.entitlements?.modules.includes(module));
}

const ACTIVITY_INTERVAL_MS = 5 * 60 * 1000;

/** Registra atividade (no máximo uma escrita a cada 5 minutos); o primeiro acesso marca lastLoginAt. */
async function touchActivity(userId: string, lastActiveAt: Date | null, firstLogin = false) {
  if (!firstLogin && lastActiveAt && Date.now() - lastActiveAt.getTime() < ACTIVITY_INTERVAL_MS) return;
  const now = new Date();
  await prismaUnscoped.user.update({
    where: { id: userId },
    data: { lastActiveAt: now, ...(firstLogin || !lastActiveAt || Date.now() - lastActiveAt.getTime() > 8 * 3600_000 ? { lastLoginAt: now } : {}) },
  });
}

/** Papel padrão na análise curricular conforme o papel na empresa. */
function defaultCurricularRole(role: MemberRole): Role {
  if (role === "owner" || role === "admin") return "ADMIN";
  if (role === "supervisor") return "ACADEMIC_COORDINATOR";
  return "ANALYST";
}

/**
 * Perfil do usuário na análise curricular da empresa ativa, criado no primeiro acesso.
 * Proprietários e administradores da empresa são sempre ADMIN do módulo; o papel dos demais é
 * definido pela empresa em Configurações → Usuários.
 */
const getCurricularUser = cache(async (): Promise<SessionUser | null> => {
  const context = await getSessionContext();
  const organization = context?.organization;
  if (!context || !organization) return null;
  const organizationId = organization.organizationId;
  const manager = organization.role === "owner" || organization.role === "admin";
  let user = await prismaUnscoped.user.findUnique({
    where: { organizationId_authUserId: { organizationId, authUserId: context.authUserId } },
  });
  if (!user) {
    user = await prismaUnscoped.user.upsert({
      where: { organizationId_authUserId: { organizationId, authUserId: context.authUserId } },
      create: {
        organizationId,
        authUserId: context.authUserId,
        email: context.email,
        name: context.displayName,
        role: defaultCurricularRole(organization.role),
      },
      update: {},
    });
  } else if (
    (manager && user.role !== "ADMIN") ||
    (!manager && user.role === "ADMIN") ||
    user.role === "STUDENT" ||
    !user.isActive ||
    user.email !== context.email
  ) {
    user = await prismaUnscoped.user.update({
      where: { id: user.id },
      data: {
        role: manager ? "ADMIN" : user.role === "ADMIN" || user.role === "STUDENT" ? defaultCurricularRole(organization.role) : user.role,
        isActive: true,
        email: context.email,
      },
    });
  }
  await touchActivity(user.id, user.lastActiveAt, !user.lastLoginAt);
  return {
    id: user.id,
    authUserId: context.authUserId,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId,
    organizationName: organization.name,
    memberRole: organization.role,
    modules: context.entitlements?.modules ?? [],
  };
});

export async function getSessionUser(options: { allowStudent?: boolean } = {}): Promise<SessionUser | null> {
  const member = await getCurricularUser();
  if (member) return member;
  return options.allowStudent ? getStudentUser() : null;
}

/** Para páginas: exige login e uma empresa ativa. */
export async function requireUser(): Promise<SessionUser> {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!context.organization) redirect("/onboarding");
  const user = await getCurricularUser();
  if (!user) redirect("/login");
  return user;
}

/** Para páginas: exige que o módulo esteja no plano; senão leva à página de planos. */
export async function requirePageModule(module: ModuleCode): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.modules.includes(module)) redirect(`/conta/plano?modulo=${module}`);
  return user;
}

/** Permissões da análise curricular dependem do módulo contratado. */
function permissionModule(permission: Permission): ModuleCode | null {
  if (permission === "students:manage") return "portal_aluno";
  if (permission === "users:manage" || permission === "privacy:manage" || permission === "audit:read") return null;
  return "analise_curricular";
}

/** Para páginas: redireciona se não tiver a permissão ou o módulo. */
export async function requirePagePermission(permission: Permission): Promise<SessionUser> {
  const required = permissionModule(permission);
  const user = required ? await requirePageModule(required) : await requireUser();
  if (!can(user.role, permission)) redirect("/inicio?forbidden=1");
  return user;
}

/** Para server actions / route handlers: lança erro em vez de redirecionar. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  const required = permissionModule(permission);
  if (required && !user.modules.includes(required)) throw new ModuleUnavailableError(required);
  if (!can(user.role, permission)) throw new ForbiddenError();
  return user;
}

export async function requireModule(module: ModuleCode): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  if (!user.modules.includes(module)) throw new ModuleUnavailableError(module);
  return user;
}

/** Administração da empresa (dono/administrador), independente de módulo. */
export async function requireOrganizationManager(): Promise<SessionContext & { organization: OrganizationMembership }> {
  const context = await getSessionContext();
  if (!context) throw new UnauthorizedError();
  if (!context.organization || (context.organization.role !== "owner" && context.organization.role !== "admin")) {
    throw new ForbiddenError();
  }
  return context as SessionContext & { organization: OrganizationMembership };
}

/** Painel da plataforma (revenda): apenas usuários em private.platform_admins. */
export async function requirePlatformAdmin(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!context.isPlatformAdmin) redirect("/inicio?forbidden=1");
  return context;
}

export async function assertPlatformAdmin(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) throw new UnauthorizedError();
  if (!context.isPlatformAdmin) throw new ForbiddenError();
  return context;
}
