import { startOfCurrentMonth, startOfZonedDay, zonedDayKey } from "@/lib/time";

export type PeriodKey = "mes" | "30d" | "90d" | "personalizado";

export const PERIOD_OPTIONS: readonly (readonly [Exclude<PeriodKey, "personalizado">, string])[] = [
  ["mes", "Este mês"],
  ["30d", "Últimos 30 dias"],
  ["90d", "Últimos 90 dias"],
];

export interface ReportPeriod {
  key: PeriodKey;
  /** Início inclusivo e fim exclusivo do período. */
  from: Date;
  to: Date;
  /** Janela de mesmo tamanho imediatamente antes, para comparar. */
  prevFrom: Date;
  prevTo: Date;
  label: string;
  /** "AAAA-MM-DD" do primeiro e do último dia, para os campos de data. */
  fromDay: string;
  toDay: string;
}

const DAY = 86_400_000;
const MAX_DAYS = 366;

function build(key: PeriodKey, from: Date, to: Date, label: string): ReportPeriod {
  const length = to.getTime() - from.getTime();
  return { key, from, to, prevFrom: new Date(from.getTime() - length), prevTo: from, label, fromDay: zonedDayKey(from), toDay: zonedDayKey(new Date(to.getTime() - 1)) };
}

/** Lê ?periodo=, ?de= e ?ate=. Qualquer valor inválido volta para "este mês". */
export function resolvePeriod(params: { periodo?: string; de?: string; ate?: string }, now: Date): ReportPeriod {
  if (params.de && params.ate) {
    const start = startOfZonedDay(params.de);
    const lastDay = startOfZonedDay(params.ate);
    if (start && lastDay && lastDay >= start) {
      const end = new Date(Math.min(lastDay.getTime() + DAY, now.getTime()));
      if (end > start && end.getTime() - start.getTime() <= MAX_DAYS * DAY) return build("personalizado", start, end, "Período escolhido");
    }
  }
  if (params.periodo === "30d") return build("30d", new Date(now.getTime() - 30 * DAY), now, "Últimos 30 dias");
  if (params.periodo === "90d") return build("90d", new Date(now.getTime() - 90 * DAY), now, "Últimos 90 dias");
  return build("mes", startOfCurrentMonth(now), now, "Este mês");
}
