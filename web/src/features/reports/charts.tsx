"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DayPoint } from "@/features/reports/series";

const AXIS = { fontSize: 11, fill: "var(--status-neutral)" } as const;

function Figure({ label, summary, children, empty, height }: { label: string; summary: string; children: React.ReactNode; empty: boolean; height: number }) {
  return (
    <figure aria-label={label} className="m-0">
      {empty ? (
        <div className="grid place-items-center rounded-xl border border-dashed text-sm text-muted-foreground" style={{ height }}>Sem dados no período.</div>
      ) : (
        <div style={{ height }}>{children}</div>
      )}
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}

/** Barras por dia. Com muitos dias, os rótulos do eixo ficam espaçados sozinhos. */
export function DailyBars({ data, label, color = "var(--chart-2)" }: { data: DayPoint[]; label: string; color?: string }) {
  const total = data.reduce((sum, point) => sum + point.count, 0);
  const peak = data.reduce((best, point) => (point.count > best.count ? point : best), data[0] ?? { label: "", count: 0, day: "" });
  return (
    <Figure label={label} height={220} empty={total === 0} summary={`${label}: ${total} no total, com o pico de ${peak.count} em ${peak.label}.`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--brand-navy-50)" }} formatter={(value) => [String(value), label]} labelFormatter={(text) => String(text)} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
          <Bar dataKey="count" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </Figure>
  );
}

export interface BarRow {
  label: string;
  value: number;
  color?: string;
}

/** Barras horizontais com o nome à esquerda. Serve para o funil por etapa, motivos de perda e rankings. */
export function HorizontalBars({ rows, label, color = "var(--chart-1)", suffix = "" }: { rows: BarRow[]; label: string; color?: string; suffix?: string }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const height = Math.max(120, rows.length * 34 + 16);
  return (
    <Figure label={label} height={height} empty={total === 0} summary={`${label}: ${rows.map((row) => `${row.label} ${row.value}${suffix}`).join(", ")}.`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 0 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={132} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--brand-navy-50)" }} formatter={(value) => [`${value}${suffix}`, label]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20} label={{ position: "right", fontSize: 11, fill: "var(--foreground)" }}>
            {rows.map((row) => <Cell key={row.label} fill={row.color ?? color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Figure>
  );
}
