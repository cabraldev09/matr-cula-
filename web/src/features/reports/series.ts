import { zonedDayKey } from "@/lib/time";

export interface DayPoint {
  /** "AAAA-MM-DD" */
  day: string;
  /** "dd/MM" */
  label: string;
  count: number;
}

const DAY = 86_400_000;

/** Conta registros por dia civil (no fuso da aplicação), incluindo os dias sem nada. */
export function bucketByDay(timestamps: readonly string[], from: Date, to: Date): DayPoint[] {
  const counts = new Map<string, number>();
  for (const stamp of timestamps) {
    const key = zonedDayKey(new Date(stamp));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const points: DayPoint[] = [];
  // O fim do período é exclusivo: o último dia é o que contém "to - 1 ms".
  const lastKey = zonedDayKey(new Date(to.getTime() - 1));
  for (let t = from.getTime(); points.length < 400; t += DAY) {
    const key = zonedDayKey(new Date(t));
    if (key > lastKey) break;
    if (points.at(-1)?.day === key) continue;
    const [, month, day] = key.split("-");
    points.push({ day: key, label: `${day}/${month}`, count: counts.get(key) ?? 0 });
  }
  return points;
}

/** Variação em relação ao período anterior, em %. Null quando não há base para comparar. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatChange(change: number | null): string {
  if (change === null) return "novo";
  if (change === 0) return "igual";
  return `${change > 0 ? "+" : "−"}${Math.abs(change)}%`;
}

/** Motivo de perda sem a observação digitada ("Preço: achou cara" → "Preço"). */
export function lostReasonLabel(reason: string | null | undefined): string {
  const head = (reason ?? "").split(":")[0]?.trim();
  return head || "Sem motivo informado";
}
