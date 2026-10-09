import { z } from "zod";
import { DEFAULT_PROPOSAL_RULES, priceProposal, type ProposalPricing, type ProposalRules } from "@/domain/proposal/pricing";

const pct = z.coerce.number().min(0).max(100);

/** Regras salvas pelo polo (jsonb). Campos ausentes ou inválidos voltam ao padrão do modelo. */
export const proposalRulesSchema = z.object({
  enrollmentFeeCents: z.coerce.number().int().min(0).max(10_000_000),
  dueDay: z.coerce.number().int().min(1).max(28),
  firstTermInstallments: z.coerce.number().int().min(1).max(12),
  punctualityPct: pct,
  lateTier1Pct: pct,
  lateTier2Pct: pct,
  firstTermScholarshipPct: pct,
  nextScholarshipPct: pct,
  scholarshipStepPct: pct,
  semesterReadjust: z
    .array(z.object({ from: z.coerce.number().int().min(2).max(20), to: z.coerce.number().int().min(2).max(20).nullable(), pct }))
    .max(10),
  annualMinPct: pct,
  annualMaxPct: pct,
});

export function parseProposalRules(value: unknown): ProposalRules {
  const merged = { ...DEFAULT_PROPOSAL_RULES, ...((value && typeof value === "object" ? value : {}) as Record<string, unknown>) };
  const parsed = proposalRulesSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_PROPOSAL_RULES;
}

export type LogoSource = "upload" | "preset_cruzeiro" | "none";

export const DEFAULT_PUNCTUALITY_NOTE = "Observação: o desconto de pontualidade já está considerado nos valores com bolsa. O benefício é fixo e não acumulativo.";

/** Valores da 2ª mensalidade em diante digitados à mão (em reais), no lugar dos calculados pelas regras. */
export interface TierOverrides {
  untilDue?: number;
  lateTier1?: number;
  lateTier2?: number;
}

export interface ProposalDocument {
  number: number | null;
  institutionName: string;
  institutionDocument: string;
  logo: { source: LogoSource; path: string | null };
  courseName: string;
  modality: string;
  semesters: number;
  studentName: string;
  generatedAt: string;
  startTerm: string;
  rules: ProposalRules;
  pricing: ProposalPricing;
  projectionNote: string;
  finalMessage: string;
  /** Campos opcionais: propostas antigas não têm e continuam abrindo igual. */
  punctualityNote?: string;
  /** Mostra só os semestres de `from` a `to` na projeção (a proposta calcula todos). */
  projectionRange?: { from: number; to: number } | null;
  /** Data (AAAA-MM-DD) do vencimento da primeira mensalidade. */
  firstPaymentDate?: string | null;
  tierOverrides?: TierOverrides;
}

export function buildProposalDocument(input: {
  number?: number | null;
  institutionName: string;
  institutionDocument: string;
  logo: { source: LogoSource; path: string | null };
  courseName: string;
  modality: string;
  semesters: number;
  studentName: string;
  grossMonthlyCents: number;
  firstMonthlyCents: number;
  startTerm: string;
  rules: ProposalRules;
  projectionNote: string;
  finalMessage: string;
  generatedAt?: Date;
  punctualityNote?: string;
  projectionRange?: { from: number; to: number } | null;
  firstPaymentDate?: string | null;
  tierOverrides?: TierOverrides;
}): ProposalDocument {
  const pricing = priceProposal(
    { grossMonthlyCents: input.grossMonthlyCents, firstMonthlyCents: input.firstMonthlyCents, semesters: input.semesters, startTerm: input.startTerm },
    input.rules,
  );
  const overrides = input.tierOverrides ?? {};
  const manual = (value: number | undefined, fallback: number) => (value !== undefined && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : fallback);
  return {
    number: input.number ?? null,
    institutionName: input.institutionName,
    institutionDocument: input.institutionDocument,
    logo: input.logo,
    courseName: input.courseName,
    modality: input.modality,
    semesters: input.semesters,
    studentName: input.studentName,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    startTerm: input.startTerm,
    rules: input.rules,
    pricing: { ...pricing, untilDue: manual(overrides.untilDue, pricing.untilDue), lateTier1: manual(overrides.lateTier1, pricing.lateTier1), lateTier2: manual(overrides.lateTier2, pricing.lateTier2) },
    projectionNote: input.projectionNote,
    finalMessage: input.finalMessage,
    ...(input.punctualityNote?.trim() ? { punctualityNote: input.punctualityNote.trim() } : {}),
    ...(input.projectionRange ? { projectionRange: input.projectionRange } : {}),
    ...(input.firstPaymentDate ? { firstPaymentDate: input.firstPaymentDate } : {}),
    ...(Object.keys(overrides).length ? { tierOverrides: overrides } : {}),
  };
}

/** Linhas da projeção que a proposta mostra: todas, ou só o intervalo escolhido. */
export function visibleProjection(doc: Pick<ProposalDocument, "pricing" | "projectionRange">) {
  const range = doc.projectionRange;
  return range ? doc.pricing.projection.filter((row) => row.index >= range.from && row.index <= range.to) : doc.pricing.projection;
}

/** "2026-10-12" → "12/10/2026". */
export function formatIsoDay(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

export const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const percent = (value: number | null) => (value === null ? "-" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`);
export const percent2 = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Próximo semestre letivo de ingresso a partir de uma data (jan–jun → .1 corrente; jul–dez → .2). */
export function currentIntakeTerm(date: Date): string {
  return `${date.getFullYear()}.${date.getMonth() < 6 ? 1 : 2}`;
}
