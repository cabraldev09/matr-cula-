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
}): ProposalDocument {
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
    pricing: priceProposal(
      { grossMonthlyCents: input.grossMonthlyCents, firstMonthlyCents: input.firstMonthlyCents, semesters: input.semesters, startTerm: input.startTerm },
      input.rules,
    ),
    projectionNote: input.projectionNote,
    finalMessage: input.finalMessage,
  };
}

export const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const percent = (value: number | null) => (value === null ? "-" : `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`);
export const percent2 = (value: number) => `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Próximo semestre letivo de ingresso a partir de uma data (jan–jun → .1 corrente; jul–dez → .2). */
export function currentIntakeTerm(date: Date): string {
  return `${date.getFullYear()}.${date.getMonth() < 6 ? 1 : 2}`;
}
