import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { ChatIcon, FunnelIcon, NewAnalysisIcon, TemperatureIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { STAGES, TEMPERATURE } from "@/features/crm/labels";
import { daysInStage } from "@/features/crm/board-rules";
import type { Priority, PriorityTone } from "@/features/home/priorities";
import type { LeadRow, WorkPanel } from "@/features/home/queries";
import { cn } from "@/lib/utils";

const TONE: Record<PriorityTone, string> = {
  danger: "border-status-danger/40 bg-status-danger-bg text-status-danger",
  warning: "border-status-warning/40 bg-status-warning-bg text-status-warning",
  info: "border-brand-cyan/30 bg-brand-cyan-50 text-brand-cyan-700",
};

export function PriorityList({ priorities }: { priorities: Priority[] }) {
  if (priorities.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-status-success/30 bg-status-success-bg p-4 text-status-success">
        <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Tudo em dia</p>
          <p className="text-sm opacity-90">Ninguém esperando atendimento e nenhum lead parado agora.</p>
        </div>
      </div>
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {priorities.map((item) => (
        <li key={item.key}>
          <Link href={item.href} className={cn("group flex h-full items-start justify-between gap-3 rounded-2xl border p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan", TONE[item.tone])}>
            <span>
              <span className="block font-semibold">{item.title}</span>
              <span className="mt-0.5 block text-sm text-foreground/75">{item.detail}</span>
            </span>
            <ArrowRight className="mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function LeadList({ title, hint, leads, now, empty }: { title: string; hint: string; leads: LeadRow[]; now: Date; empty: string }) {
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y">
            {leads.map((lead) => {
              const stage = STAGES.find((s) => s.key === lead.stage);
              const temperature = TEMPERATURE[lead.temperature as keyof typeof TEMPERATURE];
              const days = daysInStage({ stage_changed_at: lead.stage_changed_at }, now);
              return (
                <li key={lead.id}>
                  <Link href={`/crm?lead=${lead.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
                    <PersonAvatar name={lead.contacts?.name ?? "Lead"} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{lead.contacts?.name ?? "Lead"}</span>
                      <span className="block truncate text-xs text-muted-foreground">{lead.courses?.name ?? "Curso não informado"} · {stage?.label ?? lead.stage} há {days === 0 ? "menos de 1 dia" : `${days} d`}</span>
                    </span>
                    {temperature && (
                      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", temperature.className)}>
                        <TemperatureIcon level={lead.temperature as "quente" | "morno" | "frio"} className="size-3.5" /> {lead.score}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function PlanUsage({ usage }: { usage: WorkPanel["usage"] }) {
  if (usage.length === 0) return null;
  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Uso do plano</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        {usage.map((item) => {
          const percent = Math.min(100, Math.round((item.used / item.limit) * 100));
          return (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between text-sm">
                <span>{item.label}</span>
                <span className="tabular-nums text-muted-foreground">{item.used} de {item.limit}</span>
              </div>
              <Progress value={percent} aria-label={`${item.label}: ${percent}% do limite`} className={percent >= 80 ? "[&>div]:bg-status-warning" : undefined} />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const ACTIONS = [
  { module: "crm", href: "/crm", label: "Ver o funil", icon: FunnelIcon },
  { module: "atendimento", href: "/atendimento", label: "Abrir conversas", icon: ChatIcon },
  { module: "analise_curricular", href: "/analyses/new", label: "Nova análise", icon: NewAnalysisIcon },
] as const;

export function QuickActions({ modules }: { modules: string[] }) {
  const items = ACTIONS.filter((a) => modules.includes(a.module));
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-sm transition-colors hover:border-brand-cyan/50 hover:text-brand-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan">
          <Icon className="size-4 text-brand-navy" /> {label}
        </Link>
      ))}
    </div>
  );
}
