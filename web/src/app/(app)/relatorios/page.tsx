import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSessionContext, getSessionUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { startOfCurrentMonth } from "@/lib/time";
import { loadMembers } from "@/features/attendance/members";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

const PERIODS = [
  ["mes", "Este mês"],
  ["30d", "Últimos 30 dias"],
  ["90d", "Últimos 90 dias"],
] as const;

function periodStart(period: string, now: Date): Date {
  if (period === "30d") return new Date(now.getTime() - 30 * 86_400_000);
  if (period === "90d") return new Date(now.getTime() - 90 * 86_400_000);
  return startOfCurrentMonth(now);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-1 p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Ranking({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map(([label, value]) => (
              <li key={label} className="space-y-1">
                <span className="flex justify-between gap-2"><span className="truncate">{label}</span><span className="tabular-nums">{value}</span></span>
                <span className="block h-1.5 rounded-full bg-muted"><span className="block h-1.5 rounded-full bg-brand-cyan" style={{ width: `${(value / max) * 100}%` }} /></span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function top(map: Map<string, number>, limit = 8): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

async function attendanceReport(organizationId: string, from: Date) {
  const supabase = await createClient();
  const since = from.toISOString();
  const [{ data: conversations }, { count: openNow }, { count: pendingNow }, { data: messages }, members, { data: teams }] = await Promise.all([
    supabase.from("conversations").select("id, status, assigned_to, team_id, created_at, updated_at").eq("organization_id", organizationId).gte("created_at", since).limit(5000),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "open"),
    supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
    supabase.from("messages").select("conversation_id, direction, created_at").eq("organization_id", organizationId).gte("created_at", since).order("created_at").limit(20000),
    loadMembers(supabase, organizationId),
    supabase.from("teams").select("id, name").eq("organization_id", organizationId),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const teamNames = new Map((teams ?? []).map((t) => [t.id as string, t.name as string]));
  const rows = conversations ?? [];
  const byAgent = new Map<string, number>();
  const byTeam = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "closed" && row.assigned_to) byAgent.set(names.get(row.assigned_to) ?? "Atendente", (byAgent.get(names.get(row.assigned_to) ?? "Atendente") ?? 0) + 1);
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
    closed: rows.filter((r) => r.status === "closed").length,
    openNow: openNow ?? 0,
    pendingNow: pendingNow ?? 0,
    incoming,
    outgoing,
    firstResponse: median([...firstReply.values()]),
    answered: firstReply.size,
    byAgent: top(byAgent),
    byTeam: top(byTeam),
  };
}

async function analysisReport(from: Date, scope: Prisma.CurricularAnalysisWhereInput) {
  const where: Prisma.CurricularAnalysisWhereInput = { ...scope, createdAt: { gte: from } };
  const [total, completed, enrolled, notEnrolled, byCourse, byUnit] = await Promise.all([
    prisma.curricularAnalysis.count({ where }),
    prisma.curricularAnalysis.count({ where: { ...where, status: "COMPLETED" } }),
    prisma.curricularAnalysis.count({ where: { ...where, enrollmentStatus: "ENROLLED" } }),
    prisma.curricularAnalysis.count({ where: { ...where, enrollmentStatus: "NOT_ENROLLED" } }),
    prisma.curricularAnalysis.groupBy({ by: ["courseName"], where: { ...where, courseName: { not: null } }, _count: { _all: true } }),
    prisma.curricularAnalysis.groupBy({ by: ["poloName"], where: { ...where, poloName: { not: null } }, _count: { _all: true } }),
  ]);
  const toMap = (rows: { _count: { _all: number } }[], key: (row: never) => string | null) =>
    new Map(rows.map((row) => [key(row as never) ?? "—", row._count._all]));
  return {
    total,
    completed,
    enrolled,
    notEnrolled,
    conversion: enrolled + notEnrolled ? Math.round((enrolled / (enrolled + notEnrolled)) * 100) : null,
    byCourse: top(toMap(byCourse, (r: { courseName: string | null }) => r.courseName)),
    byUnit: top(toMap(byUnit, (r: { poloName: string | null }) => r.poloName)),
  };
}

export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!context.organization) redirect("/onboarding");
  const params = await searchParams;
  const period = typeof params.periodo === "string" && PERIODS.some(([value]) => value === params.periodo) ? params.periodo : "mes";
  const from = periodStart(period, new Date());
  const modules = context.entitlements?.modules ?? [];
  const curricularUser = modules.includes("analise_curricular") ? await getSessionUser() : null;
  const teamWide = curricularUser ? can(curricularUser.role, "academic:all") : false;
  const [attendance, analysis] = await Promise.all([
    modules.includes("atendimento") ? attendanceReport(context.organization.organizationId, from) : Promise.resolve(null),
    curricularUser && can(curricularUser.role, "analysis:read") ? analysisReport(from, teamWide ? {} : { createdById: curricularUser.id }) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={context.organization.name}
        title="Relatórios"
        description="Gestão do atendimento e da análise curricular no mesmo lugar."
        actions={
          <form className="flex gap-2">
            <select name="periodo" defaultValue={period} className="h-9 rounded-md border bg-card px-2 text-sm" aria-label="Período">
              {PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <Button type="submit" variant="outline" size="sm">Aplicar</Button>
          </form>
        }
      />
      {!attendance && !analysis && (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum módulo com relatórios no seu plano. <Link href="/conta/plano" className="underline">Ver planos</Link>
        </p>
      )}
      {attendance && (
        <section className="mb-10 space-y-4">
          <h2 className="text-lg font-semibold">Atendimento</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Conversas no período" value={attendance.created} hint={`${attendance.closed} encerradas`} />
            <Stat label="Agora" value={`${attendance.pendingNow} aguardando`} hint={`${attendance.openNow} em atendimento`} />
            <Stat label="Primeira resposta (mediana)" value={formatDuration(attendance.firstResponse)} hint={`${attendance.answered} conversas respondidas`} />
            <Stat label="Mensagens" value={attendance.incoming + attendance.outgoing} hint={`${attendance.incoming} recebidas · ${attendance.outgoing} enviadas`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking title="Conversas encerradas por atendente" rows={attendance.byAgent} empty="Nenhuma conversa encerrada no período." />
            <Ranking title="Conversas por departamento" rows={attendance.byTeam} empty="Nenhuma conversa no período." />
          </div>
        </section>
      )}
      {analysis && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Análise curricular {teamWide ? "· toda a equipe" : "· suas análises"}</h2>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/reports/analyses?from=${from.toISOString()}`}><Download className="size-4" /> Exportar CSV</a>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Análises no período" value={analysis.total} hint={`${analysis.completed} concluídas`} />
            <Stat label="Matrículas" value={analysis.enrolled} hint={`${analysis.notEnrolled} não matriculados`} />
            <Stat label="Conversão" value={analysis.conversion === null ? "—" : `${analysis.conversion}%`} hint="entre os retornos informados" />
            <Stat label="Aguardando retorno" value={Math.max(0, analysis.completed - analysis.enrolled - analysis.notEnrolled)} hint="análises concluídas sem retorno" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranking title="Análises por curso" rows={analysis.byCourse} empty="Nenhuma análise no período." />
            <Ranking title="Análises por unidade" rows={analysis.byUnit} empty="Cadastre as unidades em Análise: geral." />
          </div>
        </section>
      )}
    </>
  );
}
