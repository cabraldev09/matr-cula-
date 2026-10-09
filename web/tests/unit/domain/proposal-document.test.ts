import { describe, expect, it } from "vitest";
import { buildProposalDocument, DEFAULT_PUNCTUALITY_NOTE, formatIsoDay, visibleProjection } from "@/domain/proposal/document";
import { DEFAULT_PROPOSAL_RULES } from "@/domain/proposal/pricing";

const base = {
  institutionName: "Polo Demo", institutionDocument: "", logo: { source: "none" as const, path: null }, courseName: "Biomedicina", modality: "Semipresencial - Graduação",
  semesters: 8, studentName: "Maira", grossMonthlyCents: 101470, firstMonthlyCents: 30675, startTerm: "2026.2", rules: DEFAULT_PROPOSAL_RULES, projectionNote: "", finalMessage: "Fim",
  generatedAt: new Date("2026-10-08T12:00:00Z"),
};

describe("documento da proposta", () => {
  it("sem opções extras fica igual ao modelo (propostas antigas não mudam)", () => {
    const doc = buildProposalDocument(base);
    expect(doc.pricing.untilDue).toBe(306.75);
    expect(doc.pricing.lateTier1).toBe(352.76);
    expect(doc.pricing.lateTier2).toBe(383.44);
    expect("tierOverrides" in doc || "projectionRange" in doc || "punctualityNote" in doc || "firstPaymentDate" in doc).toBe(false);
    expect(visibleProjection(doc)).toHaveLength(8);
  });

  it("aceita valores digitados à mão e ignora os inválidos", () => {
    const doc = buildProposalDocument({ ...base, tierOverrides: { lateTier1: 360, lateTier2: -5, untilDue: Number.NaN } });
    expect(doc.pricing.lateTier1).toBe(360);
    expect(doc.pricing.lateTier2).toBe(383.44);
    expect(doc.pricing.untilDue).toBe(306.75);
  });

  it("mostra só o intervalo de semestres escolhido, sem alterar o cálculo", () => {
    const all = buildProposalDocument(base);
    const some = buildProposalDocument({ ...base, projectionRange: { from: 2, to: 4 } });
    expect(visibleProjection(some).map((r) => r.index)).toEqual([2, 3, 4]);
    expect(visibleProjection(some)[0]).toEqual(all.pricing.projection[1]);
  });

  it("guarda a observação e a data da primeira mensalidade quando informadas", () => {
    const doc = buildProposalDocument({ ...base, punctualityNote: "  Pague em dia.  ", firstPaymentDate: "2026-10-12" });
    expect(doc.punctualityNote).toBe("Pague em dia.");
    expect(formatIsoDay(doc.firstPaymentDate)).toBe("12/10/2026");
    expect(formatIsoDay("lixo")).toBeNull();
    expect(DEFAULT_PUNCTUALITY_NOTE).toMatch(/pontualidade/);
  });
});
