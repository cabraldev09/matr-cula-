/**
 * Empresas e usuários descartáveis no Supabase local para os testes de integração.
 * Usa web/.env.local (gerado para o Supabase local, portas 564xx) e recusa outros bancos.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(process.cwd(), ".env.local"), override: true });

export function assertLocalDatabase(): boolean {
  const url = process.env.DATABASE_URL ?? "";
  return /@(127\.0\.0\.1|localhost):56422\//.test(url);
}

export interface TestTenant {
  organizationId: string;
  authUserId: string;
  userId: string;
}

export async function createTenant(role: "ADMIN" | "TUTOR" | "ANALYST" = "ADMIN"): Promise<TestTenant> {
  const { prismaUnscoped } = await import("@/lib/prisma");
  const { createAdminClient } = await import("@/lib/supabase/server");
  const email = `tenant-${randomUUID()}@example.test`;
  const { data, error } = await createAdminClient().auth.admin.createUser({ email, password: `T-${randomUUID()}!`, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("auth user");
  const [organization] = await prismaUnscoped.$queryRaw<{ id: string }[]>`insert into public.organizations(name) values (${`Empresa ${email.slice(7, 15)}`}) returning id::text`;
  const user = await prismaUnscoped.user.create({
    data: { organizationId: organization.id, authUserId: data.user.id, email, name: "Usuário Teste", role },
  });
  return { organizationId: organization.id, authUserId: data.user.id, userId: user.id };
}

export async function dropTenants(tenants: TestTenant[]) {
  const { prismaUnscoped } = await import("@/lib/prisma");
  const { createAdminClient } = await import("@/lib/supabase/server");
  for (const tenant of tenants) {
    await prismaUnscoped.$executeRaw`delete from public.organizations where id = ${tenant.organizationId}::uuid`;
    await createAdminClient().auth.admin.deleteUser(tenant.authUserId);
  }
}
