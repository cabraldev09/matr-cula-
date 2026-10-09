import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSessionContext, getSessionUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { zonedDayKey } from "@/lib/time";
import { money } from "@/domain/proposal/document";
import { DailyBars, HorizontalBars } from "@/features/reports/charts";
import { PeriodFilter } from "@/features/reports/period-filter";
import { resolvePeriod, type ReportPeriod } from "@/features/reports/period";
import { analysisReport, attendanceReport, crmReport, ROW_LIMIT } from "@/features/reports/queries";
import { ReportTabs, type ReportTab } from "@/features/reports/report-tabs";
import { StatCard } from "@/features/reports/stat-card";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d ${hours % 24} h`;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Truncated() {
  return <p className="rounded-lg border border-status-warning/40 bg-status-warning-bg px-3 py-2 text-sm text-status-warning">O período tem mais de {ROW_LIMIT.toLocaleString("pt-BR")} registros. Os números abaixo usam os mais recentes; escolha um período menor para ver tudo.</p>;
}

type Crm = Awaited<ReturnType<typeof crmReport>>;
type Attendance = Awaited<ReturnType<typeof attendanceReport>>;
type Analysis = Awaited<ReturnType<typeof analysisReport>>;

function CrmSection({ crm, period }: { crm: Crm; period: ReportPeriod }) {
  return (
    <>
      {crm.truncated && <Truncated />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Funil de matrículas · {period.label}</h2>
        <Button asChild size="sm" variant="outline"><Link href="/crm">Abrir CRM</Link></Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Leads no período" value={crm.total} hint={`${crm.open} ainda em andamento · ${crm.lost} perdidos`} change={crm.totalChange} />
        <StatCard label="Receberam proposta" value={crm.proposals} hint={`${crm.percentOf(crm.proposals)} dos leads`} />
        <StatCard label="Taxa paga" value={crm.paidLeads} hint={`${crm.percentOf(crm.paidLeads)} dos leads · ${crm.enrolled} matriculados`} />
        <StatCard label="Taxas recebidas" value={money(crm.feesCents / 100)} hint={`${crm.feesCount} pagamento${crm.feesCount === 1 ? "" : "s"} confirmado${crm.feesCount === 1 ? "" : "s"}`} change={crm.feesChange} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Leads por dia"><DailyBars data={crm.series} label="Leads por dia" /></ChartCard>
        <ChartCard title="Leads por etapa atual"><HorizontalBars rows={crm.byStage} label="Leads por etapa atual" /></ChartCard>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Motivos de perda"><HorizontalBars rows={crm.lostReasons.map(([label, value]) => ({ label, value }))} label="Motivos de perda" color="var(--status-danger)" /></ChartCard>
        <ChartCard title="Leads por curso"><HorizontalBars rows={crm.byCourse.map(([label, value]) => ({ label, value }))} label="Leads por curso" /></ChartCard>
        <ChartCard title="Leads por responsável"><HorizontalBars rows={crm.byOwner.map(([label, value]) => ({ label, value }))} label="Leads por responsável" color="var(--chart-4)" /></ChartCard>
      </div>
      <ChartCard title="Leads por origem"><HorizontalBars rows={crm.bySource.map(([label, value]) => ({ label, value }))} label="Leads por origem" color="var(--chart-2)" /></ChartCard>
    </>
  );
}

function AttendanceSection({ attendance, period }: { attendance: Attendance; period: ReportPeriod }) {
  return (
    <>
      {attendance.truncated && <Truncated />}
      <h2 className="text-lg font-semibold">Atendimento · {period.label}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Conversas no período" value={attendance.created} hint={`${attendance.closed} encerradas`} change={attendance.createdChange} />
        <StatCard label="Agora" value={`${attendance.pendingNow} aguardando`} hint={`${attendance.openNow} em atendimento`} />
        <StatCard label="Primeira resposta (mediana)" value={formatDuration(attendance.firstResponse)} hint={`${attendance.answered} conversas respondidas`} />
        <StatCard label="Mensagens" value={attendance.incoming + attendance.outgoing} hint={`${attendance.incoming} recebidas · ${attendance.outgoing} enviadas`} change={attendance.messagesChange} />
      </div>
      <ChartCard title="Conversas novas por dia"><DailyBars data={attendance.series} label="Conversas novas por dia" color="var(--chart-1)" /></ChartCard>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Conversas encerradas por atendente"><HorizontalBars rows={attendance.byAgent.map(([label, value]) => ({ label, value }))} label="Conversas encerradas por atendente" /></ChartCard>
        <ChartCard title="Conversas por departamento"><HorizontalBars rows={attendance.byTeam.map(([label, value]) => ({ label, value }))} label="Conversas por departamento" color="var(--chart-4)" /></ChartCard>
      </div>
    </>
  );
}

function AnalysisSection({ analysis, period, teamWide }: { analysis: Analysis; period: ReportPeriod; teamWide: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Análise curricular {teamWide ? "· toda a equipe" : "· suas análises"} · {period.label}</h2>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/reports/analyses?from=${period.from.toISOString()}&to=${period.to.toISOString()}`}><Download className="size-4" /> Exportar CSV</a>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Análises no período" value={analysis.total} hint={`${analysis.completed} concluídas`} change={analysis.totalChange} />
        <StatCard label="Matrículas" value={analysis.enrolled} hint={`${analysis.notEnrolled} não matriculados`} />
        <StatCard label="Conversão" value={analysis.conversion === null ? "—" : `${analysis.conversion}%`} hint="entre os retornos informados" />
        <StatCard label="Aguardando retorno" value={Math.max(0, analysis.completed - analysis.enrolled - analysis.notEnrolled)} hint="análises concluídas sem retorno" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Análises por curso"><HorizontalBars rows={analysis.byCourse.map(([label, value]) => ({ label, value }))} label="Análises por curso" /></ChartCard>
        <ChartCard title="Análises por unidade"><HorizontalBars rows={analysis.byUnit.map(([label, value]) => ({ label, value }))} label="Análises por unidade" color="var(--chart-4)" /></ChartCard>
      </div>
    </>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!context.organization) redirect("/onboarding");
  const params = await searchParams;
  const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);
  const now = new Date();
  const period = resolvePeriod({ periodo: text(params.periodo), de: text(params.de), ate: text(params.ate) }, now);
  const organizationId = context.organization.organizationId;
  const modules = context.entitlements?.modules ?? [];
  const curricularUser = modules.includes("analise_curricular") ? await getSessionUser() : null;
  const teamWide = curricularUser ? can(curricularUser.role, "academic:all") : false;
  const [crm, attendance, analysis] = await Promise.all([
    modules.includes("crm") ? crmReport(organizationId, period) : Promise.resolve(null),
    modules.includes("atendimento") ? attendanceReport(organizationId, period) : Promise.resolve(null),
    curricularUser && can(curricularUser.role, "analysis:read") ? analysisReport(period, teamWide ? {} : { createdById: curricularUser.id }) : Promise.resolve(null),
  ]);

  const tabs: ReportTab[] = [];
  if (crm) tabs.push({ id: "crm", label: "Funil de matrículas", content: <CrmSection crm={crm} period={period} /> });
  if (attendance) tabs.push({ id: "atendimento", label: "Atendimento", content: <AttendanceSection attendance={attendance} period={period} /> });
  if (analysis) tabs.push({ id: "analise", label: "Análise curricular", content: <AnalysisSection analysis={analysis} period={period} teamWide={teamWide} /> });

  return (
    <>
      <PageHeader
        eyebrow={context.organization.name}
        title="Relatórios"
        description="Funil de matrículas, atendimento e análise curricular, com a variação sobre o período anterior de mesmo tamanho."
        actions={<PeriodFilter active={period.key} fromDay={period.fromDay} toDay={period.toDay} today={zonedDayKey(now)} />}
      />
      {tabs.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum módulo com relatórios no seu plano. <Link href="/conta/plano" className="underline">Ver planos</Link>
        </p>
      ) : (
        <ReportTabs tabs={tabs} />
      )}
    </>
  );
}
