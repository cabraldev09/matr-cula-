import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Empresa (organization) em que o código atual opera. Em requisições, vem da sessão; em tarefas em
 * segundo plano (pipeline, cron), é definida explicitamente com withTenant().
 */
const storage = new AsyncLocalStorage<{ organizationId: string }>();

export class TenantRequiredError extends Error {
  constructor() {
    super("Operação sem empresa definida.");
    this.name = "TenantRequiredError";
  }
}

/**
 * Executa `fn` no escopo da empresa. O resultado é aguardado dentro do contexto: consultas do Prisma
 * são preguiçosas e só rodam quando aguardadas, então devolvê-las sem `await` sairia do escopo.
 */
export function withTenant<T>(organizationId: string, fn: () => PromiseLike<T> | T): Promise<T> {
  return storage.run({ organizationId }, async () => await fn());
}

export async function currentTenant(): Promise<string> {
  const explicit = storage.getStore()?.organizationId;
  if (explicit) return explicit;
  // Testes de integração usam uma empresa descartável global (nunca ativo fora de NODE_ENV=test).
  if (process.env.NODE_ENV === "test") {
    const testTenant = (globalThis as { __TEST_TENANT__?: string }).__TEST_TENANT__;
    if (testTenant) return testTenant;
  }
  // Import dinâmico: a sessão também usa o Prisma. Fora de uma requisição (scripts), não há empresa.
  const resolved = await import("@/lib/session").then((m) => m.resolveRequestTenant()).catch(() => null);
  if (!resolved) throw new TenantRequiredError();
  return resolved;
}
