import "server-only";
import { prismaUnscoped } from "@/lib/prisma";
import { currentTenant } from "@/lib/tenant";

export class QuotaExceededError extends Error {
  constructor(public readonly metric: string) {
    super(
      metric === "analyses"
        ? "A empresa atingiu o limite de análises do plano neste mês. Faça upgrade em Plano e faturas."
        : metric === "ai_credits"
          ? "Os créditos de IA do plano acabaram neste mês. Cadastre uma chave OpenAI própria ou faça upgrade."
          : "A empresa atingiu um limite do plano.",
    );
    this.name = "QuotaExceededError";
  }
}

/**
 * Consome uma cota mensal do plano da empresa atual (atômico no banco: requisições simultâneas não
 * ultrapassam o limite). Sem limite no plano, apenas contabiliza.
 */
export async function consumeQuota(metric: "analyses" | "ai_credits", amount = 1): Promise<void> {
  const organizationId = await currentTenant();
  try {
    await prismaUnscoped.$queryRaw`select private.consume_quota(${organizationId}::uuid, ${metric}, ${amount}::integer)`;
  } catch (err) {
    if (err instanceof Error && /Quota exceeded/.test(err.message)) throw new QuotaExceededError(metric);
    throw err;
  }
}
