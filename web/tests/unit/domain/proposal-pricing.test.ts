import { describe, expect, it } from "vitest";
import { firstMonthlyFromScholarship, nextTerm, priceProposal } from "@/domain/proposal/pricing";

/** Valores conferidos nas propostas reais emitidas pelos polos (outubro/2026, início 2026.2). */
const SAMPLES = [
  {
    name: "Biomedicina (8 semestres)",
    input: { grossMonthlyCents: 101470, firstMonthlyCents: 30675, semesters: 8, startTerm: "2026.2" },
    scholarship: 69.77,
    tiers: [306.75, 352.76, 383.44],
    min: [306.75, 343.56, 350.43, 374.96, 382.46, 413.06, 425.45, 459.49],
    max: [306.75, 361.97, 369.2, 417.2, 425.54, 485.12, 499.67, 569.63],
    diff: [null, 18.4, 18.77, 42.24, 43.08, 72.06, 74.23, 110.14],
  },
  {
    name: "ADS (4 semestres)",
    input: { grossMonthlyCents: 75630, firstMonthlyCents: 14528, semesters: 4, startTerm: "2026.2" },
    scholarship: 80.79,
    tiers: [145.28, 167.07, 181.6],
    min: [145.28, 162.71, 165.97, 177.59],
    max: [145.28, 171.43, 174.86, 197.59],
    diff: [null, 8.72, 8.89, 20.01],
  },
  {
    name: "Relações Internacionais (6 semestres)",
    input: { grossMonthlyCents: 101460, firstMonthlyCents: 16493, semesters: 6, startTerm: "2026.2" },
    scholarship: 83.74,
    tiers: [164.93, 189.67, 206.16],
    min: [164.93, 184.72, 188.42, 201.61, 205.64, 222.09],
    max: [164.93, 194.62, 198.51, 224.32, 228.8, 260.83],
    diff: [null, 9.9, 10.09, 22.71, 23.17, 38.75],
  },
  { name: "Nutrição", input: { grossMonthlyCents: 107380, firstMonthlyCents: 28493, semesters: 8, startTerm: "2026.2" }, scholarship: 73.47, tiers: [284.93, 327.67, 356.16] },
  { name: "Gestão Pública", input: { grossMonthlyCents: 75630, firstMonthlyCents: 14243, semesters: 4, startTerm: "2026.2" }, scholarship: 81.17, tiers: [142.43, 163.79, 178.04] },
];

describe("proposta de bolsa", () => {
  for (const sample of SAMPLES) {
    it(`reproduz a proposta de ${sample.name}`, () => {
      const result = priceProposal(sample.input);
      expect(result.scholarshipPct).toBe(sample.scholarship);
      expect([result.untilDue, result.lateTier1, result.lateTier2]).toEqual(sample.tiers);
      expect(result.enrollmentFee).toBe(99);
      if (sample.min) expect(result.projection.map((r) => r.monthlyMin)).toEqual(sample.min);
      if (sample.max) expect(result.projection.map((r) => r.monthlyMax)).toEqual(sample.max);
      if (sample.diff) expect(result.projection.map((r) => r.differencePerMonth)).toEqual(sample.diff);
    });
  }

  it("monta as colunas de ajustes como no modelo", () => {
    const [first, second, third, , , sixth] = priceProposal(SAMPLES[0]!.input).projection;
    expect(first).toMatchObject({ term: "2026.2", scholarshipPct: 25, totalMinPct: null });
    expect(second).toMatchObject({ term: "2027.1", scholarshipPct: 20, scholarshipAdjustPct: 5, semesterReadjustPct: 2, annualMinPct: 5, totalMinPct: 12, annualMaxPct: 11, totalMaxPct: 18 });
    expect(third).toMatchObject({ term: "2027.2", scholarshipAdjustPct: null, semesterReadjustPct: 2, annualMinPct: null, totalMinPct: 2 });
    expect(sixth).toMatchObject({ term: "2029.1", semesterReadjustPct: 3, totalMinPct: 8, totalMaxPct: 14 });
  });

  it("calcula semestres e a primeira mensalidade a partir da bolsa", () => {
    expect(nextTerm("2026.2")).toBe("2027.1");
    expect(nextTerm("2027.1")).toBe("2027.2");
    expect(firstMonthlyFromScholarship(101470, 69.77)).toBe(30674);
    expect(() => priceProposal({ ...SAMPLES[0]!.input, firstMonthlyCents: 200000 })).toThrow();
  });
});
