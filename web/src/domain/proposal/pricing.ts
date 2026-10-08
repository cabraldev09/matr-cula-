/**
 * Motor da proposta de bolsa (puro, sem banco). Reproduz as propostas comerciais usadas pelos polos:
 * bolsa aplicada, faixas de pontualidade e projeção semestral em dois cenários de reajuste anual.
 * Os valores são encadeados sem arredondamento intermediário; o arredondamento é só na exibição.
 */

export interface SemesterReadjust {
  /** Primeiro semestre (1 = semestre de ingresso) em que a regra vale. */
  from: number;
  /** Último semestre da regra (null = até o fim do curso). */
  to: number | null;
  pct: number;
}

export interface ProposalRules {
  enrollmentFeeCents: number;
  dueDay: number;
  firstTermInstallments: number;
  /** Desconto de pontualidade já incluído na primeira mensalidade (exibido no texto). */
  punctualityPct: number;
  /** Acréscimo sobre a primeira mensalidade ao pagar entre o vencimento e o dia 25. */
  lateTier1Pct: number;
  /** Acréscimo sobre a primeira mensalidade após o dia 25. */
  lateTier2Pct: number;
  firstTermScholarshipPct: number;
  nextScholarshipPct: number;
  /** Ajuste de bolsa aplicado no 2º semestre (diferença entre as bolsas). */
  scholarshipStepPct: number;
  semesterReadjust: SemesterReadjust[];
  annualMinPct: number;
  annualMaxPct: number;
}

/** Regras das propostas modelo (taxa R$ 99, dia 10, pontualidade 25%, reajustes 2%/3%, anual 5%/11%). */
export const DEFAULT_PROPOSAL_RULES: ProposalRules = {
  enrollmentFeeCents: 9900,
  dueDay: 10,
  firstTermInstallments: 3,
  punctualityPct: 25,
  lateTier1Pct: 15,
  lateTier2Pct: 25,
  firstTermScholarshipPct: 25,
  nextScholarshipPct: 20,
  scholarshipStepPct: 5,
  semesterReadjust: [
    { from: 2, to: 5, pct: 2 },
    { from: 6, to: null, pct: 3 },
  ],
  annualMinPct: 5,
  annualMaxPct: 11,
};

export interface ProposalInput {
  grossMonthlyCents: number;
  firstMonthlyCents: number;
  semesters: number;
  /** Semestre letivo de início, ex.: "2026.2". */
  startTerm: string;
}

export interface ProjectionRow {
  index: number;
  term: string;
  scholarshipPct: number;
  scholarshipAdjustPct: number | null;
  semesterReadjustPct: number | null;
  annualMinPct: number | null;
  totalMinPct: number | null;
  monthlyMin: number;
  annualMaxPct: number | null;
  totalMaxPct: number | null;
  monthlyMax: number;
  differencePerMonth: number | null;
}

export interface ProposalPricing {
  grossMonthly: number;
  firstMonthly: number;
  scholarshipPct: number;
  enrollmentFee: number;
  untilDue: number;
  lateTier1: number;
  lateTier2: number;
  projection: ProjectionRow[];
}

/** Arredonda reais para centavos (meio para cima, tolerante a ruído de ponto flutuante). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundPct(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function nextTerm(term: string): string {
  const match = /^(\d{4})\.([12])$/.exec(term);
  if (!match) throw new Error(`Semestre inválido: ${term}`);
  const year = Number(match[1]);
  return match[2] === "1" ? `${year}.2` : `${year + 1}.1`;
}

function readjustFor(index: number, rules: ProposalRules): number | null {
  if (index < 2) return null;
  const rule = rules.semesterReadjust.find((r) => index >= r.from && (r.to === null || index <= r.to));
  return rule ? rule.pct : null;
}

export function priceProposal(input: ProposalInput, rules: ProposalRules = DEFAULT_PROPOSAL_RULES): ProposalPricing {
  if (input.grossMonthlyCents <= 0 || input.firstMonthlyCents <= 0) throw new Error("Valores da proposta devem ser positivos.");
  if (input.firstMonthlyCents > input.grossMonthlyCents) throw new Error("A primeira mensalidade não pode ser maior que a mensalidade bruta.");
  if (!Number.isInteger(input.semesters) || input.semesters < 1 || input.semesters > 20) throw new Error("Quantidade de semestres inválida.");
  const gross = input.grossMonthlyCents / 100;
  const first = input.firstMonthlyCents / 100;

  const projection: ProjectionRow[] = [];
  let term = input.startTerm;
  let min = first;
  let max = first;
  for (let index = 1; index <= input.semesters; index += 1) {
    if (index > 1) term = nextTerm(term);
    if (index === 1) {
      projection.push({
        index,
        term,
        scholarshipPct: rules.firstTermScholarshipPct,
        scholarshipAdjustPct: null,
        semesterReadjustPct: null,
        annualMinPct: null,
        totalMinPct: null,
        monthlyMin: roundMoney(min),
        annualMaxPct: null,
        totalMaxPct: null,
        monthlyMax: roundMoney(max),
        differencePerMonth: null,
      });
      continue;
    }
    const scholarshipAdjust = index === 2 && rules.scholarshipStepPct > 0 ? rules.scholarshipStepPct : null;
    const readjust = readjustFor(index, rules);
    const annualTerm = term.endsWith(".1");
    const annualMin = annualTerm ? rules.annualMinPct : null;
    const annualMax = annualTerm ? rules.annualMaxPct : null;
    const totalMin = (scholarshipAdjust ?? 0) + (readjust ?? 0) + (annualMin ?? 0);
    const totalMax = (scholarshipAdjust ?? 0) + (readjust ?? 0) + (annualMax ?? 0);
    min *= 1 + totalMin / 100;
    max *= 1 + totalMax / 100;
    projection.push({
      index,
      term,
      scholarshipPct: rules.nextScholarshipPct,
      scholarshipAdjustPct: scholarshipAdjust,
      semesterReadjustPct: readjust,
      annualMinPct: annualMin,
      totalMinPct: totalMin,
      monthlyMin: roundMoney(min),
      annualMaxPct: annualMax,
      totalMaxPct: totalMax,
      monthlyMax: roundMoney(max),
      differencePerMonth: roundMoney(max - min),
    });
  }

  return {
    grossMonthly: gross,
    firstMonthly: first,
    scholarshipPct: roundPct((1 - first / gross) * 100),
    enrollmentFee: rules.enrollmentFeeCents / 100,
    untilDue: roundMoney(first),
    lateTier1: roundMoney(first * (1 + rules.lateTier1Pct / 100)),
    lateTier2: roundMoney(first * (1 + rules.lateTier2Pct / 100)),
    projection,
  };
}

/** Primeira mensalidade a partir da bolsa desejada (para o consultor que pensa em %). */
export function firstMonthlyFromScholarship(grossMonthlyCents: number, scholarshipPct: number): number {
  return Math.round(grossMonthlyCents * (1 - scholarshipPct / 100));
}
