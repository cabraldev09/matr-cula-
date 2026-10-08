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

export function withTenant<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ organizationId }, fn);
}

export async function currentTenant(): Promise<string> {
  const explicit = storage.getStore()?.organizationId;
  if (explicit) return explicit;
  // Import dinâmico: a sessão também usa o Prisma. Fora de uma requisição (scripts), não há empresa.
  const resolved = await import("@/lib/session").then((m) => m.resolveRequestTenant()).catch(() => null);
  if (!resolved) throw new TenantRequiredError();
  return resolved;
}
