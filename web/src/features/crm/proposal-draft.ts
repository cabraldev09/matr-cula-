import { buildProposalDocument, type ProposalDocument } from "@/domain/proposal/document";
import type { ProposalRules } from "@/domain/proposal/pricing";
import type { Course } from "@/features/crm/labels";

/** Tudo que a pessoa edita na tela da proposta. Números como texto, para aceitar vírgula e campo vazio. */
export interface ProposalDraft {
  studentName: string;
  courseId: string;
  courseName: string;
  modality: string;
  semesters: number;
  grossCents: number;
  firstCents: number;
  enrollmentFeeCents: number;
  dueDay: string;
  installments: string;
  startYear: string;
  startSemester: "1" | "2";
  firstTermScholarshipPct: string;
  nextScholarshipPct: string;
  punctualityPct: string;
  lateTier1Pct: string;
  lateTier2Pct: string;
  /** Valores digitados à mão para a 2ª mensalidade em diante, em centavos. */
  tierOverrides: { untilDue?: number; lateTier1?: number; lateTier2?: number };
  firstPaymentDate: string;
  punctualityNote: string;
  projectionNote: string;
  finalMessage: string;
  projectionOn: boolean;
  projectionFrom: string;
  projectionTo: string;
}

export type DraftErrors = Partial<Record<keyof ProposalDraft, string>>;

const text = (value: number) => String(value).replace(".", ",");
const num = (value: string) => Number(value.trim().replace(",", "."));

export function draftDefaults(args: { studentName: string; course: Course | null; modality: string | null; startTerm: string; rules: ProposalRules; projectionNote: string; finalMessage: string }): ProposalDraft {
  const { course, rules } = args;
  const [year = "", semester = "1"] = args.startTerm.split(".");
  return {
    studentName: args.studentName,
    courseId: course?.id ?? "",
    courseName: course?.name ?? "",
    modality: course?.modality ?? args.modality ?? "",
    semesters: course?.semesters ?? 8,
    grossCents: course?.gross_monthly_cents ?? 0,
    firstCents: course?.default_first_monthly_cents ?? 0,
    enrollmentFeeCents: rules.enrollmentFeeCents,
    dueDay: String(rules.dueDay),
    installments: String(rules.firstTermInstallments),
    startYear: year,
    startSemester: semester === "2" ? "2" : "1",
    firstTermScholarshipPct: text(rules.firstTermScholarshipPct),
    nextScholarshipPct: text(rules.nextScholarshipPct),
    punctualityPct: text(rules.punctualityPct),
    lateTier1Pct: text(rules.lateTier1Pct),
    lateTier2Pct: text(rules.lateTier2Pct),
    tierOverrides: {},
    firstPaymentDate: "",
    punctualityNote: "",
    projectionNote: args.projectionNote,
    finalMessage: args.finalMessage,
    projectionOn: false,
    projectionFrom: "1",
    projectionTo: String(course?.semesters ?? 8),
  };
}

/** Bolsa implícita em %, com duas casas: 1 − primeira ÷ bruta. */
export function scholarshipOf(grossCents: number, firstCents: number): number | null {
  return grossCents > 0 && firstCents > 0 ? Math.round((1 - firstCents / grossCents) * 10_000) / 100 : null;
}

/** Percentual de acréscimo que reproduz um valor digitado (para o texto "Perde desconto de X%"). */
export function impliedPct(overrideCents: number, firstCents: number): number {
  return firstCents > 0 ? Math.round((overrideCents / firstCents - 1) * 10_000) / 100 : 0;
}

export const startTermOf = (draft: Pick<ProposalDraft, "startYear" | "startSemester">) => `${draft.startYear.trim()}.${draft.startSemester}`;

/** Regras efetivas desta proposta: as do polo com o que foi mudado na tela. */
export function rulesFromDraft(draft: ProposalDraft, base: ProposalRules): ProposalRules {
  const tier1 = draft.tierOverrides.lateTier1 !== undefined ? impliedPct(draft.tierOverrides.lateTier1, draft.firstCents) : num(draft.lateTier1Pct);
  const tier2 = draft.tierOverrides.lateTier2 !== undefined ? impliedPct(draft.tierOverrides.lateTier2, draft.firstCents) : num(draft.lateTier2Pct);
  return {
    ...base,
    enrollmentFeeCents: draft.enrollmentFeeCents,
    dueDay: num(draft.dueDay),
    firstTermInstallments: num(draft.installments),
    punctualityPct: num(draft.punctualityPct),
    lateTier1Pct: tier1,
    lateTier2Pct: tier2,
    firstTermScholarshipPct: num(draft.firstTermScholarshipPct),
    nextScholarshipPct: num(draft.nextScholarshipPct),
  };
}

export function validateDraft(draft: ProposalDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.studentName.trim().length < 2) errors.studentName = "Informe o nome do aluno.";
  if (draft.courseName.trim().length < 2) errors.courseName = "Escolha o curso ou informe o nome.";
  if (!Number.isInteger(draft.semesters) || draft.semesters < 1 || draft.semesters > 20) errors.semesters = "De 1 a 20 semestres.";
  if (!(draft.grossCents > 0)) errors.grossCents = "Informe a mensalidade bruta.";
  if (!(draft.firstCents > 0)) errors.firstCents = "Informe a primeira mensalidade.";
  else if (draft.grossCents > 0 && draft.firstCents > draft.grossCents) errors.firstCents = "Não pode passar da mensalidade bruta.";
  const year = num(draft.startYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) errors.startYear = "Ano de 4 dígitos, como 2026.";
  const integer = (field: "dueDay" | "installments", min: number, max: number, message: string) => {
    const n = num(draft[field]);
    if (!Number.isInteger(n) || n < min || n > max) errors[field] = message;
  };
  integer("dueDay", 1, 28, "Dia de 1 a 28.");
  integer("installments", 1, 12, "De 1 a 12 parcelas.");
  for (const field of ["firstTermScholarshipPct", "nextScholarshipPct", "punctualityPct", "lateTier1Pct", "lateTier2Pct"] as const) {
    const n = num(draft[field]);
    if (!draft[field].trim() || !Number.isFinite(n) || n < 0 || n > 100) errors[field] = "De 0 a 100%.";
  }
  if (draft.firstPaymentDate && !/^\d{4}-\d{2}-\d{2}$/.test(draft.firstPaymentDate)) errors.firstPaymentDate = "Data inválida.";
  if (draft.projectionOn) {
    const from = num(draft.projectionFrom);
    const to = num(draft.projectionTo);
    if (!Number.isInteger(from) || from < 1 || from > draft.semesters) errors.projectionFrom = `De 1 a ${draft.semesters}.`;
    if (!Number.isInteger(to) || to < 1 || to > draft.semesters) errors.projectionTo = `De 1 a ${draft.semesters}.`;
    else if (!errors.projectionFrom && from > to) errors.projectionTo = "Não pode vir antes do primeiro.";
  }
  if (draft.finalMessage.length > 600) errors.finalMessage = "No máximo 600 letras.";
  if (draft.projectionNote.length > 600) errors.projectionNote = "No máximo 600 letras.";
  if (draft.punctualityNote.length > 400) errors.punctualityNote = "No máximo 400 letras.";
  return errors;
}

const reais = (cents: number | undefined) => (cents === undefined ? undefined : cents / 100);

export function overridesOf(draft: ProposalDraft, base: ProposalRules) {
  return {
    rules: rulesFromDraft(draft, base),
    finalMessage: draft.finalMessage,
    projectionNote: draft.projectionNote,
    punctualityNote: draft.punctualityNote,
    projectionRange: draft.projectionOn ? { from: num(draft.projectionFrom), to: num(draft.projectionTo) } : null,
    firstPaymentDate: draft.firstPaymentDate || null,
    tierOverrides: {
      ...(draft.tierOverrides.untilDue !== undefined ? { untilDue: reais(draft.tierOverrides.untilDue) } : {}),
      ...(draft.tierOverrides.lateTier1 !== undefined ? { lateTier1: reais(draft.tierOverrides.lateTier1) } : {}),
      ...(draft.tierOverrides.lateTier2 !== undefined ? { lateTier2: reais(draft.tierOverrides.lateTier2) } : {}),
    },
  };
}

/** Corpo enviado à ação que salva a proposta. */
export function payloadFromDraft(draft: ProposalDraft, leadId: string, base: ProposalRules) {
  return {
    leadId,
    studentName: draft.studentName.trim(),
    courseName: draft.courseName.trim(),
    modality: draft.modality,
    semesters: draft.semesters,
    grossMonthlyCents: draft.grossCents,
    firstMonthlyCents: draft.firstCents,
    startTerm: startTermOf(draft),
    overrides: overridesOf(draft, base),
  };
}

/** Prévia ao vivo, calculada no navegador pelo mesmo motor do PDF. Null enquanto o rascunho está incompleto. */
export function previewDocument(draft: ProposalDraft, base: ProposalRules, institution: { name: string; document: string; logo: ProposalDocument["logo"] }): ProposalDocument | null {
  if (Object.keys(validateDraft(draft)).length > 0) return null;
  try {
    const o = overridesOf(draft, base);
    return buildProposalDocument({
      institutionName: institution.name,
      institutionDocument: institution.document,
      logo: institution.logo,
      courseName: draft.courseName.trim(),
      modality: draft.modality,
      semesters: draft.semesters,
      studentName: draft.studentName.trim(),
      grossMonthlyCents: draft.grossCents,
      firstMonthlyCents: draft.firstCents,
      startTerm: startTermOf(draft),
      rules: o.rules,
      projectionNote: o.projectionNote,
      finalMessage: o.finalMessage,
      punctualityNote: o.punctualityNote,
      projectionRange: o.projectionRange,
      firstPaymentDate: o.firstPaymentDate,
      tierOverrides: o.tierOverrides,
    });
  } catch {
    return null;
  }
}
