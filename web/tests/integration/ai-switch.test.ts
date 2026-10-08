/**
 * Integração: a chave geral "Usar IA" (SystemSetting aiEnabled) bloqueia o cliente OpenAI.
 * Pulado automaticamente se o banco não estiver acessível.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertLocalDatabase, createTenant, dropTenants, type TestTenant } from "./tenant-fixture";

let dbOk = false;
let prismaMod: typeof import("@/lib/prisma");
let tenant: TestTenant | null = null;

beforeAll(async () => {
  if (!assertLocalDatabase()) return;
  try {
    prismaMod = await import("@/lib/prisma");
    await prismaMod.prismaUnscoped.$queryRaw`SELECT 1`;
    tenant = await createTenant();
    (globalThis as { __TEST_TENANT__?: string }).__TEST_TENANT__ = tenant.organizationId;
    dbOk = true;
  } catch {
    dbOk = false;
  }
});

afterAll(async () => {
  if (tenant) await dropTenants([tenant]);
});

describe("chave geral da IA", () => {
  it("padrão é desligada; desligada, getOpenAIClient falha com AI_DISABLED antes de tocar na chave", async (ctx) => {
    if (!dbOk) return ctx.skip();
    const { setSystemSetting, isAiEnabled, getSystemSettings } = await import("@/repositories/settings-repository");
    const { getOpenAIClient } = await import("@/services/openai/client-factory");

    await prismaMod.prisma.systemSetting.deleteMany({ where: { key: "aiEnabled" } });
    expect(await isAiEnabled()).toBe(false);
    await expect(getOpenAIClient()).rejects.toMatchObject({ code: "AI_DISABLED" });

    await setSystemSetting("aiEnabled", true);
    expect(await isAiEnabled()).toBe(true);
    expect((await getSystemSettings()).aiEnabled).toBe(true);

    await setSystemSetting("aiEnabled", false);
    expect(await isAiEnabled()).toBe(false);
  });
});
