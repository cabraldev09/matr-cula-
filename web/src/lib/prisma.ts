import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "@/lib/env";
import { currentTenant } from "@/lib/tenant";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; scoped?: PrismaClient };

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL }, { schema: "curricular" });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function getBase(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient();
  return globalForPrisma.prisma;
}

const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);

type Row = Record<string, unknown>;

function withOrganization(data: unknown, organizationId: string): unknown {
  if (Array.isArray(data)) return data.map((item) => withOrganization(item, organizationId));
  const row = (data ?? {}) as Row;
  if (row.organizationId !== undefined && row.organizationId !== organizationId) {
    throw new Error("Tentativa de gravar dados em outra empresa.");
  }
  return { ...row, organizationId };
}

/**
 * Todas as consultas recebem o filtro da empresa atual e todas as criações recebem organizationId.
 * Registros filhos criados por escrita aninhada herdam a empresa do pai no banco (trigger
 * private.curricular_tenant_guard), que também rejeita referências entre empresas.
 */
function createScoped(): PrismaClient {
  return getBase().$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          const organizationId = await currentTenant();
          const next = { ...(args as Row) };
          if (WHERE_OPERATIONS.has(operation)) {
            next.where = { ...((next.where as Row) ?? {}), organizationId };
          } else if (operation === "create") {
            next.data = withOrganization(next.data, organizationId);
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            next.data = withOrganization(next.data, organizationId);
          } else if (operation === "upsert") {
            next.where = { ...((next.where as Row) ?? {}), organizationId };
            next.create = withOrganization(next.create, organizationId);
          }
          return query(next as typeof args);
        },
      },
    },
  }) as unknown as PrismaClient;
}

/** Cliente com escopo da empresa atual. Use em todo código de negócio. */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.scoped) globalForPrisma.scoped = createScoped();
    const client = globalForPrisma.scoped;
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/**
 * Cliente sem escopo: apenas para a resolução da sessão e rotinas da plataforma que percorrem
 * empresas explicitamente (sempre filtrando por organizationId no próprio código).
 */
export const prismaUnscoped: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getBase();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
