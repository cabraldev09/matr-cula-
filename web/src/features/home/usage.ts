import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { startOfCurrentMonth } from "@/lib/time";
import type { Entitlements } from "@/lib/session";

export interface UsageItem {
  label: string;
  used: number;
  limit: number;
}

/** Uso do plano (usuários, canais e análises do mês) contra os limites contratados. Só mostra o que o plano limita. */
export async function loadPlanUsage(organizationId: string, entitlements: Entitlements | null, now: Date): Promise<UsageItem[]> {
  const limits = entitlements?.plan?.limits ?? {};
  const modules = entitlements?.modules ?? [];
  const supabase = await createClient();
  const [members, channels, analyses] = await Promise.all([
    typeof limits.users === "number" ? supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true) : null,
    typeof limits.channels === "number" && modules.includes("atendimento") ? supabase.from("channels").select("id", { count: "exact", head: true }).eq("organization_id", organizationId) : null,
    typeof limits.analyses === "number" && modules.includes("analise_curricular") ? prisma.curricularAnalysis.count({ where: { createdAt: { gte: startOfCurrentMonth(now) } } }) : null,
  ]);
  const items: UsageItem[] = [];
  if (members && limits.users) items.push({ label: "Usuários", used: members.count ?? 0, limit: limits.users });
  if (channels && limits.channels) items.push({ label: "Canais", used: channels.count ?? 0, limit: limits.channels });
  if (analyses !== null && limits.analyses) items.push({ label: "Análises no mês", used: analyses, limit: limits.analyses });
  return items;
}
