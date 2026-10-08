import "server-only";
import { currentTenant } from "@/lib/tenant";

/** A integração OpenAI é uma por empresa (organizationId é único). */
export async function openAIIntegrationWhere(): Promise<{ organizationId: string }> {
  return { organizationId: await currentTenant() };
}
