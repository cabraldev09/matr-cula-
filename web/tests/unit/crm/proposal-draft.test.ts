import { describe, expect, it } from "vitest";
import { DEFAULT_PROPOSAL_RULES } from "@/domain/proposal/pricing";
import type { Course } from "@/features/crm/labels";
import { draftDefaults, impliedPct, payloadFromDraft, previewDocument, rulesFromDraft, scholarshipOf, startTermOf, validateDraft } from "@/features/crm/proposal-draft";

const course: Course = { id: "c1", name: "Biomedicina", modality: "Semipresencial - Graduação", semesters: 8, gross_monthly_cents: 101470, default_first_monthly_cents: 30675, active: true };
const institution = { name: "Polo Demo", document: "", logo: { source: "none" as const, path: null } };
const draft = () => draftDefaults({ studentName: "Maira da Silva", course, modality: null, startTerm: "2026.2", rules: DEFAULT_PROPOSAL_RULES, projectionNote: "Nota", finalMessage: "Fim" });

describe("rascunho da proposta", () => {
  it("começa com o curso do lead e as regras do polo, e reproduz o modelo da Biomedicina", () => {
    const d = draft();
    expect(d).toMatchObject({ courseName: "Biomedicina", semesters: 8, grossCents: 101470, firstCents: 30675, startYear: "2026", startSemester: "2", dueDay: "10", installments: "3" });
    expect(validateDraft(d)).toEqual({});
    expect(startTermOf(d)).toBe("2026.2");
    expect(scholarshipOf(d.grossCents, d.firstCents)).toBe(69.77);
    const doc = previewDocument(d, DEFAULT_PROPOSAL_RULES, institution)!;
    expect(doc.pricing.untilDue).toBe(306.75);
    expect(doc.pricing.lateTier1).toBe(352.76);
    expect(doc.pricing.lateTier2).toBe(383.44);
    expect(doc.pricing.projection).toHaveLength(8);
  });

  it("alterações de bolsa, dia e parcelas entram nas regras e mudam a projeção", () => {
    const d = { ...draft(), firstTermScholarshipPct: "30", nextScholarshipPct: "25", dueDay: "15", installments: "6" };
    const rules = rulesFromDraft(d, DEFAULT_PROPOSAL_RULES);
    expect(rules).toMatchObject({ firstTermScholarshipPct: 30, nextScholarshipPct: 25, dueDay: 15, firstTermInstallments: 6 });
    const doc = previewDocument(d, DEFAULT_PROPOSAL_RULES, institution)!;
    expect(doc.pricing.projection[0]!.scholarshipPct).toBe(30);
    expect(doc.pricing.projection[1]!.scholarshipPct).toBe(25);
  });

  it("valor digitado à mão vale exatamente e o texto mostra o percentual equivalente", () => {
    const d = { ...draft(), tierOverrides: { lateTier1: 36000 } };
    expect(impliedPct(36000, 30675)).toBe(17.36);
    expect(rulesFromDraft(d, DEFAULT_PROPOSAL_RULES).lateTier1Pct).toBe(17.36);
    const doc = previewDocument(d, DEFAULT_PROPOSAL_RULES, institution)!;
    expect(doc.pricing.lateTier1).toBe(360);
    expect(doc.pricing.lateTier2).toBe(383.44);
  });

  it("aponta cada campo inválido", () => {
    const d = draft();
    expect(validateDraft({ ...d, firstCents: 200000 }).firstCents).toMatch(/bruta/);
    expect(validateDraft({ ...d, grossCents: 0 }).grossCents).toBeDefined();
    expect(validateDraft({ ...d, startYear: "26" }).startYear).toMatch(/4 dígitos/);
    expect(validateDraft({ ...d, dueDay: "40" }).dueDay).toMatch(/1 a 28/);
    expect(validateDraft({ ...d, lateTier2Pct: "150" }).lateTier2Pct).toMatch(/0 a 100/);
    expect(validateDraft({ ...d, projectionOn: true, projectionFrom: "5", projectionTo: "2" }).projectionTo).toMatch(/antes/);
    expect(validateDraft({ ...d, projectionOn: true, projectionFrom: "1", projectionTo: "12" }).projectionTo).toMatch(/1 a 8/);
    expect(validateDraft({ ...d, courseName: " " }).courseName).toBeDefined();
    expect(previewDocument({ ...d, firstCents: 0 }, DEFAULT_PROPOSAL_RULES, institution)).toBeNull();
  });

  it("monta o corpo para salvar com o intervalo da projeção e a data", () => {
    const d = { ...draft(), projectionOn: true, projectionFrom: "2", projectionTo: "4", firstPaymentDate: "2026-10-12", tierOverrides: { lateTier2: 40000 } };
    const payload = payloadFromDraft(d, "lead-1", DEFAULT_PROPOSAL_RULES);
    expect(payload).toMatchObject({ leadId: "lead-1", studentName: "Maira da Silva", startTerm: "2026.2", grossMonthlyCents: 101470, firstMonthlyCents: 30675 });
    expect(payload.overrides.projectionRange).toEqual({ from: 2, to: 4 });
    expect(payload.overrides.firstPaymentDate).toBe("2026-10-12");
    expect(payload.overrides.tierOverrides).toEqual({ lateTier2: 400 });
    expect(payloadFromDraft(draft(), "lead-1", DEFAULT_PROPOSAL_RULES).overrides.projectionRange).toBeNull();
  });
});
