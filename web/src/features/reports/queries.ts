import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { loadMembers } from "@/features/attendance/members";
import type { Prisma } from "@/generated/prisma/client";
import { CLOSED_STAGES } from "@/features/crm/board-rules";
import { STAGES } from "@/features/crm/labels";
import type { ReportPeriod } from "@/features/reports/period";
import { bucketByDay, lostReasonLabel, pctChange, type DayPoint } from "@/features/reports/series";

/** Limite de linhas lidas por consulta. Passando disso o relatório avisa que está mostrando só as mais recentes. */
export const ROW_LIMIT = 10_000;

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function topRows(map: Map<string, number>, limit = 8): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

const iso = (date: Date) => date.toISOString();

export async function crmReport(organizationId: string, period: ReportPeriod) {
  const supabase = await createClient();
  const [{ data: leads }, { data: paid }, { count: previousLeads }, { data: previousPaid }, { data: courses }, members] = await Promise.all([
    supabase.from("leads").select("stage, source, course_id, owner_id, lost_reason, created_at").eq("organization_id", organizationId).gte("created_at", iso(period.from)).lt("created_at", iso(period.to)).limit(ROW_LIMIT),
    supabase.from("enrollment_charges").select("amount_cents").eq("organization_id", organizationId).eq("status", "paid").gte("paid_at", iso(period.from)).lt("paid_at", iso(period.to)).limit(ROW_LIMIT),
    supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", iso(period.prevFrom)).lt("created_at", iso(period.prevTo)),
    supabase.from("enrollment_charges").select("amount_cents").eq("organization_id", organizationId).eq("status", "paid").gte("paid_at", iso(period.prevFrom)).lt("paid_at", iso(period.prevTo)).limit(ROW_LIMIT),
    supabase.from("courses").select("id, name").eq("organization_id", organizationId),
    loadMembersSafe(organizationId),
  ]);
  const rows = leads ?? [];
  const courseNames = new Map((courses ?? []).map((c) => [c.id as string, c.name as string]));
  const memberNames = new Map(members.map((m) => [m.id, m.name]));
  const byStage = new Map<string, number>();
  const byCourse = new Map<string, number>();
  const bySource = new Map<string, number>();
  const byOwner = new Map<string, number>();
  const lostReasons = new Map<string, number>();
  for (const lead of rows) {
    byStage.set(lead.stage, (byStage.get(lead.stage) ?? 0) + 1);
    const course = lead.course_id ? (courseNames.get(lead.course_id) ?? "Curso removido") : "Curso não informado";
    byCourse.set(course, (byCourse.get(course) ?? 0) + 1);
    const source = lead.source === "whatsapp" ? "WhatsApp" : "Cadastro manual";
    bySource.set(source, (bySource.get(source) ?? 0) + 1);
    const owner = lead.owner_id ? (memberNames.get(lead.owner_id) ?? "Equipe") : "Sem responsável";
    byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
    if (lead.stage === "perdido") {
      const reason = lostReasonLabel(lead.lost_reason);
      lostReasons.set(reason, (lostReasons.get(reason) ?? 0) + 1);
    }
  }
  const reachedProposal = rows.filter((l) => ["proposta", "taxa_paga", "matriculado"].includes(l.stage)).length;
  const paidLeads = rows.filter((l) => l.stage === "taxa_paga" || l.stage === "matriculado").length;
  const feesCents = (paid ?? []).reduce((sum, c) => sum + (c.amount_cents as number), 0);
  const previousFeesCents = (previousPaid ?? []).reduce((sum, c) => sum + (c.amount_cents as number), 0);
  return {
    total: rows.length,
    truncated: rows.length >= ROW_LIMIT,
    totalChange: pctChange(rows.length, previousLeads ?? 0),
    proposals: reachedProposal,
    paidLeads,
    enrolled: rows.filter((l) => l.stage === "matriculado").length,
    lost: rows.filter((l) => l.stage === "perdido").length,
    open: rows.filter((l) => !CLOSED_STAGES.includes(l.stage)).length,
    feesCents,
    feesCount: (paid ?? []).length,
    feesChange: pctChange(feesCents, previousFeesCents),
    percentOf: (part: number) => (rows.length ? `${Math.round((part / rows.length) * 100)}%` : "—"),
    series: bucketByDay(rows.map((l) => l.created_at as string), period.from, period.to),
    byStage: STAGES.map((s) => ({ label: s.label, value: byStage.get(s.key) ?? 0, color: s.color })),
    byCourse: topRows(byCourse),
    bySource: topRows(bySource),
    byOwner: topRows(byOwner),
    lostReasons: topRows(lostReasons),
  };
}

async function loadMembersSafe(organizationId: string) {
  try {
    return await loadMembers(await createClient(), organizationId);
  } catch {
    return [];
  }
}

export async function attendanceReport(organizationId: string, period: ReportPeriod) {
  const supabase = await createClient();
  const [{ data: conversations }, { count: previousCount }, { count: openNow }, { count: pendingNow }, { data: messages }, { count: previousMessages }, members, { data: teams }] = await Promise.all([
    supabase.from("conversations").select("id, status, assigned_to, team_id, created_at").eq("organization_id", organizationId).gte("created_at", iso(period.from)).lt("created_at", iso(period.to)).limit(ROW_LIMIT),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", iso(period.prevFrom)).lt("created_at", iso(period.prevTo)),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "open"),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    supabase.from("messages").select("conversation_id, direction, created_at").eq("organization_id", organizationId).gte("created_at", iso(period.from)).lt("created_at", iso(period.to)).order("created_at").limit(ROW_LIMIT * 2),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).gte("created_at", iso(period.prevFrom)).lt("created_at", iso(period.prevTo)),
    loadMembersSafe(organizationId),
    supabase.from("teams").select("id, name").eq("organization_id", organizationId),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const teamNames = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const rows = conversations ?? [];
  const byAgent = new Map<string, number>();
  const byTeam = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "closed" && row.assigned_to) {
      const agent = names.get(row.assigned_to) ?? "Atendente";
      byAgent.set(agent, (byAgent.get(agent) ?? 0) + 1);
    }
    const team = row.team_id ? (teamNames.get(row.team_id) ?? "Departamento") : "Sem departamento";
    byTeam.set(team, (byTeam.get(team) ?? 0) + 1);
  }
  // Primeira resposta: da primeira mensagem do cliente até a primeira mensagem da equipe na mesma conversa.
  const firstIncoming = new Map<string, number>();
  const firstReply = new Map<string, number>();
  let incoming = 0;
  let outgoing = 0;
  for (const message of messages ?? []) {
    const at = new Date(message.created_at).getTime();
    if (message.direction === "incoming") {
      incoming += 1;
      if (!firstIncoming.has(message.conversation_id)) firstIncoming.set(message.conversation_id, at);
    } else {
      outgoing += 1;
      const start = firstIncoming.get(message.conversation_id);
      if (start !== undefined && !firstReply.has(message.conversation_id) && at >= start) firstReply.set(message.conversation_id, at - start);
    }
  }
  return {
    created: rows.length,
    truncated: rows.length >= ROW_LIMIT,
    createdChange: pctChange(rows.length, previousCount ?? 0),
    closed: rows.filter((r) => r.status === "closed").length,
    openNow: openNow ?? 0,
    pendingNow: pendingNow ?? 0,
    incoming,
    outgoing,
    messagesChange: pctChange(incoming + outgoing, previousMessages ?? 0),
    firstResponse: median([...firstReply.values()]),
    answered: firstReply.size,
    series: bucketByDay(rows.map((r) => r.created_at as string), period.from, period.to) as DayPoint[],
    byAgent: topRows(byAgent),
    byTeam: topRows(byTeam),
  };
}

export async function analysisReport(period: ReportPeriod, scope: Prisma.CurricularAnalysisWhereInput) {
  const range = { gte: period.from, lt: period.to };
  const where: Prisma.CurricularAnalysisWhereInput = { ...scope, createdAt: range };
  const [total, previousTotal, completed, enrolled, notEnrolled, byCourse, byUnit] = await Promise.all([
    prisma.curricularAnalysis.count({ where }),
    prisma.curricularAnalysis.count({ where: { ...scope, createdAt: { gte: period.prevFrom, lt: period.prevTo } } }),
    prisma.curricularAnalysis.count({ where: { ...where, status: "COMPLETED" } }),
    prisma.curricularAnalysis.count({ where: { ...where, enrollmentStatus: "ENROLLED" } }),
    prisma.curricularAnalysis.count({ where: { ...where, enrollmentStatus: "NOT_ENROLLED" } }),
    prisma.curricularAnalysis.groupBy({ by: ["courseName"], where: { ...where, courseName: { not: null } }, _count: { _all: true } }),
    prisma.curricularAnalysis.groupBy({ by: ["poloName"], where: { ...where, poloName: { not: null } }, _count: { _all: true } }),
  ]);
  const toMap = (rows: { _count: { _all: number } }[], key: (row: never) => string | null) => new Map(rows.map((row) => [key(row as never) ?? "—", row._count._all]));
  return {
    total,
    totalChange: pctChange(total, previousTotal),
    completed,
    enrolled,
    notEnrolled,
    conversion: enrolled + notEnrolled ? Math.round((enrolled / (enrolled + notEnrolled)) * 100) : null,
    byCourse: topRows(toMap(byCourse, (r: { courseName: string | null }) => r.courseName)),
    byUnit: topRows(toMap(byUnit, (r: { poloName: string | null }) => r.poloName)),
  };
}
