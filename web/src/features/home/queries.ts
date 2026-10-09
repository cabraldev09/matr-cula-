import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { startOfCurrentMonth } from "@/lib/time";
import type { Entitlements } from "@/lib/session";
import { buildPriorities, nearLimitItems, trialDaysLeft, type Priority } from "@/features/home/priorities";

const DAY = 86_400_000;

export interface LeadRow {
  id: string;
  stage: string;
  temperature: string;
  score: number;
  stage_changed_at: string;
  contacts: { name: string } | null;
  courses: { name: string } | null;
}

export interface WorkPanel {
  priorities: Priority[];
  hotLeads: LeadRow[];
  staleLeads: LeadRow[];
  usage: { label: string; used: number; limit: number }[];
  counts: { activeLeads: number | null; openConversations: number | null; analysesThisMonth: number | null };
  scope: "equipe" | "meus";
}

const LEAD_COLUMNS = "id, stage, temperature, score, stage_changed_at, contacts(name), courses(name)";

/**
 * Tudo que o painel do Início precisa em uma rodada de consultas. Gestores veem a empresa toda;
 * os demais veem o que é seu (leads com eles) e a fila geral de conversas.
 */
export async function loadWorkPanel(args: { organizationId: string; userId: string; manager: boolean; modules: string[]; entitlements: Entitlements | null; now: Date }): Promise<WorkPanel> {
  const { organizationId, userId, manager, modules, entitlements, now } = args;
  const supabase = await createClient();
  const hasCrm = modules.includes("crm");
  const hasChat = modules.includes("atendimento");
  const hasAnalysis = modules.includes("analise_curricular");
  const open = "(matriculado,perdido,taxa_paga)";
  const staleBefore = new Date(now.getTime() - 3 * DAY).toISOString();
  const proposalBefore = new Date(now.getTime() - 5 * DAY).toISOString();
  // Gestores veem a empresa toda; os demais, só os leads que são seus.
  const leadRows = () => {
    const query = supabase.from("leads").select(LEAD_COLUMNS).eq("organization_id", organizationId);
    return manager ? query : query.eq("owner_id", userId);
  };
  const leadCount = () => {
    const query = supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId);
    return manager ? query : query.eq("owner_id", userId);
  };

  const [hot, stale, proposals, activeLeads, pending, oldestPending, openConversations, analyses, members, channels] = await Promise.all([
    hasCrm ? leadRows().eq("temperature", "quente").not("stage", "in", open).order("score", { ascending: false }).limit(5) : null,
    hasCrm ? leadRows().not("stage", "in", open).lt("stage_changed_at", staleBefore).order("stage_changed_at").limit(5) : null,
    hasCrm ? leadCount().eq("stage", "proposta").lt("stage_changed_at", proposalBefore) : null,
    hasCrm ? leadCount().not("stage", "in", "(matriculado,perdido)") : null,
    hasChat ? supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending") : null,
    hasChat ? supabase.from("conversations").select("created_at").eq("organization_id", organizationId).eq("status", "pending").order("created_at").limit(1) : null,
    hasChat ? supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).neq("status", "closed") : null,
    hasAnalysis ? prisma.curricularAnalysis.count({ where: { createdAt: { gte: startOfCurrentMonth(now) } } }) : null,
    manager ? supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true) : null,
    manager && hasChat ? supabase.from("channels").select("id", { count: "exact", head: true }).eq("organization_id", organizationId) : null,
  ]);

  const limits = entitlements?.plan?.limits ?? {};
  const usageMap: Record<string, number> = { users: members?.count ?? 0, channels: channels?.count ?? 0, analyses: analyses ?? 0 };
  const usage = manager
    ? ([["users", "Usuários"], ["channels", "Canais"], ["analyses", "Análises no mês"]] as const)
        .filter(([key]) => typeof limits[key] === "number" && limits[key]! > 0 && (key !== "analyses" || hasAnalysis) && (key !== "channels" || hasChat))
        .map(([key, label]) => ({ label, used: usageMap[key] ?? 0, limit: limits[key]! }))
    : [];
  const oldest = (oldestPending?.data?.[0]?.created_at as string | undefined) ?? null;
  const counts = {
    pendingConversations: pending?.count ?? 0,
    oldestPendingMs: oldest ? now.getTime() - new Date(oldest).getTime() : null,
    staleLeads: (stale?.data ?? []).length,
    hotLeads: (hot?.data ?? []).length,
    proposalsWaiting: proposals?.count ?? 0,
    trialDaysLeft: trialDaysLeft(entitlements?.status, entitlements?.currentPeriodEnd, now),
    nearLimit: manager ? nearLimitItems(usageMap, limits) : [],
  };
  return {
    priorities: buildPriorities(counts, { manager }),
    hotLeads: (hot?.data ?? []) as unknown as LeadRow[],
    staleLeads: (stale?.data ?? []) as unknown as LeadRow[],
    usage,
    counts: { activeLeads: activeLeads?.count ?? null, openConversations: openConversations?.count ?? null, analysesThisMonth: analyses },
    scope: manager ? "equipe" : "meus",
  };
}
