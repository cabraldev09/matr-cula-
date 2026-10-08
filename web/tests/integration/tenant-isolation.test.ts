/**
 * Integração: isolamento entre empresas na análise curricular (Prisma com escopo + travas no banco).
 * Roda contra o Supabase local; é pulado se o banco não estiver acessível.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDatabase, createTenant, dropTenants, type TestTenant } from "./tenant-fixture";

let ready = false;
const tenants: TestTenant[] = [];
let a: TestTenant;
let b: TestTenant;
let prismaMod: typeof import("@/lib/prisma");
let tenantMod: typeof import("@/lib/tenant");

beforeAll(async () => {
  if (!assertLocalDatabase()) return;
  try {
    prismaMod = await import("@/lib/prisma");
    tenantMod = await import("@/lib/tenant");
    await prismaMod.prismaUnscoped.$queryRaw`SELECT 1`;
    a = await createTenant();
    b = await createTenant();
    tenants.push(a, b);
    ready = true;
  } catch (err) {
    console.warn("Supabase local indisponível; testes de isolamento pulados.", err);
  }
});

afterAll(async () => {
  if (tenants.length) await dropTenants(tenants);
});

async function createAnalysis(tenant: TestTenant) {
  const { getActiveRuleSet } = await import("@/repositories/rules-repository");
  return tenantMod.withTenant(tenant.organizationId, async () => {
    const rules = await getActiveRuleSet();
    return prismaMod.prisma.curricularAnalysis.create({
      data: {
        createdById: tenant.userId,
        ruleSetVersionId: rules.id,
        engineVersion: "test",
        startTerm: "2026.2",
        studentName: "Aluno Teste",
        subjects: {
          create: [{ rowHash: "h1", name: "DISCIPLINA", workload: 80, period: 1, status: "PENDING", sourcePage: 1, sourceRow: 1, sortIndex: 0 }],
        },
      },
      include: { subjects: true },
    });
  });
}

describe("isolamento entre empresas", () => {
  it("cada empresa recebe as próprias regras e registros filhos herdam a empresa", async ({ skip }) => {
    if (!ready) skip();
    const analysis = await createAnalysis(a);
    expect(analysis.organizationId).toBe(a.organizationId);
    expect(analysis.subjects[0]!.organizationId).toBe(a.organizationId);
    const rulesB = await tenantMod.withTenant(b.organizationId, async () => (await import("@/repositories/rules-repository")).getActiveRuleSet());
    expect(rulesB.id).not.toBe(analysis.ruleSetVersionId);
  });

  it("outra empresa não lê, altera nem apaga", async ({ skip }) => {
    if (!ready) skip();
    const analysis = await createAnalysis(a);
    await tenantMod.withTenant(b.organizationId, async () => {
      const { prisma } = prismaMod;
      expect(await prisma.curricularAnalysis.findUnique({ where: { id: analysis.id } })).toBeNull();
      expect(await prisma.curricularAnalysis.count()).toBe(0);
      expect(await prisma.analyzedSubject.findFirst({ where: { analysisId: analysis.id } })).toBeNull();
      await expect(prisma.curricularAnalysis.update({ where: { id: analysis.id }, data: { studentName: "Invasor" } })).rejects.toThrow();
      expect((await prisma.curricularAnalysis.deleteMany({ where: { id: analysis.id } })).count).toBe(0);
      expect((await prisma.analyzedSubject.updateMany({ where: { analysisId: analysis.id }, data: { name: "X" } })).count).toBe(0);
    });
    const still = await tenantMod.withTenant(a.organizationId, () => prismaMod.prisma.curricularAnalysis.findUniqueOrThrow({ where: { id: analysis.id } }));
    expect(still.studentName).toBe("Aluno Teste");
  });

  it("o banco rejeita referências a registros de outra empresa", async ({ skip }) => {
    if (!ready) skip();
    const analysis = await createAnalysis(a);
    await tenantMod.withTenant(b.organizationId, async () => {
      const { prisma } = prismaMod;
      // Usuário de B apontando para as regras de A.
      await expect(
        prisma.curricularAnalysis.create({ data: { createdById: b.userId, ruleSetVersionId: analysis.ruleSetVersionId, engineVersion: "x", startTerm: "2026.2" } }),
      ).rejects.toThrow(/Cross-organization/);
      // Disciplina gravada em B para uma análise de A.
      await expect(
        prisma.analyzedSubject.create({ data: { analysisId: analysis.id, rowHash: "x", name: "X", workload: 1, period: 1, status: "PENDING", sourcePage: 1, sourceRow: 1, sortIndex: 0 } }),
      ).rejects.toThrow(/Cross-organization/);
    });
    // Mesmo sem o filtro do cliente, o banco não deixa mudar a empresa de um registro.
    await expect(
      prismaMod.prismaUnscoped.curricularAnalysis.update({ where: { id: analysis.id }, data: { organizationId: b.organizationId } }),
    ).rejects.toThrow(/cannot change/);
  });

  it("sem empresa definida, nenhuma consulta é executada", async ({ skip }) => {
    if (!ready) skip();
    await expect(prismaMod.prisma.curricularAnalysis.findMany()).rejects.toThrow(/sem empresa/);
  });

  it("arquivos ficam sob o prefixo da empresa e não são lidos por outra", async ({ skip }) => {
    if (!ready) skip();
    process.env.STORAGE_DRIVER = "local";
    process.env.STORAGE_DIR = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "tenant-storage-"));
    const { getStorage } = await import("@/services/storage/storage");
    const stored = await tenantMod.withTenant(a.organizationId, () => getStorage().save(Buffer.from("%PDF-1.4"), { extension: "pdf" }));
    expect(stored.key.startsWith(`${a.organizationId}/`)).toBe(true);
    await expect(tenantMod.withTenant(b.organizationId, () => getStorage().read(stored.key))).rejects.toThrow(/outra empresa/);
    expect((await tenantMod.withTenant(a.organizationId, () => getStorage().read(stored.key))).toString()).toBe("%PDF-1.4");
  });

  it("a cota mensal de análises do plano é respeitada", async ({ skip }) => {
    if (!ready) skip();
    const { prismaUnscoped } = prismaMod;
    const code = `quota-${a.organizationId.slice(0, 8)}`;
    await prismaUnscoped.$executeRaw`insert into public.plans(code, name, price_cents, modules, limits) values (${code}, 'Cota teste', 100, array['analise_curricular'], '{"analyses": 1}')`;
    await prismaUnscoped.$executeRaw`insert into public.subscriptions(organization_id, plan_id, status, current_period_end)
      select ${a.organizationId}::uuid, id, 'active', now() + interval '30 days' from public.plans where code = ${code}`;
    try {
      const { consumeQuota, QuotaExceededError } = await import("@/services/billing/quota");
      await tenantMod.withTenant(a.organizationId, () => consumeQuota("analyses"));
      await expect(tenantMod.withTenant(a.organizationId, () => consumeQuota("analyses"))).rejects.toBeInstanceOf(QuotaExceededError);
      // Outra empresa (sem plano limitado) não é afetada.
      await tenantMod.withTenant(b.organizationId, () => consumeQuota("analyses"));
    } finally {
      await prismaUnscoped.$executeRaw`delete from public.subscriptions where organization_id = ${a.organizationId}::uuid`;
      await prismaUnscoped.$executeRaw`delete from public.plans where code = ${code}`;
    }
  });
});
