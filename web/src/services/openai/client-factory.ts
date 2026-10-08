import "server-only";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { nodeFetch } from "@/services/openai/node-fetch";
import { OpenAISecretService } from "@/services/openai/credentials";
import { OpenAIIntegrationError, OPENAI_ERROR_MESSAGES } from "@/services/openai/errors";
import { isAiEnabled } from "@/repositories/settings-repository";
import { openAIIntegrationWhere } from "@/services/openai/integration-key";
import { getEnv } from "@/lib/env";
import { consumeQuota, QuotaExceededError } from "@/services/billing/quota";

export interface OpenAIRuntimeConfig {
  extractionModel: string;
  auditModel: string;
  futureExplanationModel: string | null;
}

/** Cria um cliente temporário a partir de uma chave em memória (usado no teste de conexão). */
export function createEphemeralClient(apiKey: string, opts?: { timeoutMs?: number }): OpenAI {
  return new OpenAI({ apiKey, timeout: opts?.timeoutMs ?? 30_000, maxRetries: 0, fetch: nodeFetch });
}

/**
 * OpenAIClientFactory.getOpenAIClient()
 * Descriptografa a chave apenas em memória e instancia o SDK oficial.
 * O plaintext nunca é persistido nem logado.
 */
export async function getOpenAIClient(opts?: { timeoutMs?: number; maxRetries?: number; ignoreAiSwitch?: boolean }): Promise<{
  client: OpenAI;
  config: OpenAIRuntimeConfig;
}> {
  // Chave geral "Usar IA": desligada, nenhum recurso faz chamadas à OpenAI.
  if (!opts?.ignoreAiSwitch && !(await isAiEnabled())) {
    throw new OpenAIIntegrationError("AI_DISABLED", OPENAI_ERROR_MESSAGES.AI_DISABLED);
  }
  let apiKey: string;
  try {
    apiKey = await OpenAISecretService.getApiKeyForServer();
  } catch (err) {
    // Sem chave própria, a empresa usa a chave da plataforma e consome os créditos de IA do plano.
    const platformKey = getEnv().OPENAI_PLATFORM_API_KEY;
    if (!(err instanceof OpenAIIntegrationError) || err.code !== "NOT_CONFIGURED" || !platformKey) throw err;
    try {
      await consumeQuota("ai_credits");
    } catch (quotaError) {
      if (quotaError instanceof QuotaExceededError) throw new OpenAIIntegrationError("PLAN_CREDITS_EXHAUSTED", OPENAI_ERROR_MESSAGES.PLAN_CREDITS_EXHAUSTED);
      throw quotaError;
    }
    apiKey = platformKey;
  }
  const integration = await prisma.openAIIntegration.upsert({
    where: await openAIIntegrationWhere(),
    create: {},
    update: {},
    select: { extractionModel: true, auditModel: true, futureExplanationModel: true },
  });
  const client = new OpenAI({
    apiKey,
    timeout: opts?.timeoutMs ?? 120_000,
    maxRetries: opts?.maxRetries ?? 2,
    fetch: nodeFetch,
  });
  return { client, config: integration };
}
