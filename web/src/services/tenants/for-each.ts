import "server-only";
import { prismaUnscoped } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant";
import { logger } from "@/lib/logger";
import type { ModuleCode } from "@/lib/modules";

/**
 * Executa uma rotina agendada em cada empresa com o módulo contratado, uma de cada vez e com o
 * escopo da empresa. A falha de uma empresa não interrompe as demais.
 */
export async function forEachOrganization<T>(module: ModuleCode, run: (organizationId: string) => Promise<T>) {
  const rows = await prismaUnscoped.$queryRaw<{ id: string }[]>`
    select o.id::text as id from public.organizations o where private.has_module(o.id, ${module}) order by o.created_at`;
  const results: Array<{ organizationId: string; ok: boolean; result?: T }> = [];
  for (const { id } of rows) {
    try {
      results.push({ organizationId: id, ok: true, result: await withTenant(id, () => run(id)) });
    } catch (err) {
      logger.error("tenant.job_failed", { organizationId: id, err: err instanceof Error ? err.message.slice(0, 300) : String(err) });
      results.push({ organizationId: id, ok: false });
    }
  }
  return { organizations: results.length, failed: results.filter((r) => !r.ok).length, results };
}
