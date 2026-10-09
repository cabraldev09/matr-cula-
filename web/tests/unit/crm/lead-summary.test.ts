import { describe, expect, it } from "vitest";
import { nextStep } from "@/features/crm/lead-summary";
import { centsFromTyping, formatCentsInput } from "@/features/crm/money-input";
import type { Lead } from "@/features/crm/labels";

const NOW = new Date("2026-10-10T12:00:00Z");
const lead = (patch: Partial<Lead> = {}): Lead => ({
  id: "l1", contact_id: "c1", owner_id: null, source: "whatsapp", stage: "novo", stage_changed_at: NOW.toISOString(), course_id: null, modality: null, entry_type: null,
  has_previous_studies: null, education_level: null, city: null, start_term: null, best_time: null, incoming_messages: 1, score: 25, temperature: "frio", lost_reason: null,
  notes: "", proposal_id: null, created_at: NOW.toISOString(), updated_at: NOW.toISOString(), contacts: null, ...patch,
});

describe("próximo passo do lead", () => {
  it("orienta conforme a etapa", () => {
    expect(nextStep(lead({ stage: "novo" }), NOW).title).toMatch(/qualificar/);
    expect(nextStep(lead({ stage: "qualificado" }), NOW).title).toMatch(/proposta/);
    expect(nextStep(lead({ stage: "qualificado", has_previous_studies: true }), NOW).title).toMatch(/histórico/);
    expect(nextStep(lead({ stage: "taxa_paga" }), NOW).title).toMatch(/matrícula/);
  });

  it("mostra a proposta aberta e há quantos dias foi enviada", () => {
    const sent = lead({ stage: "proposta", stage_changed_at: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(), proposals: { number: 7, first_monthly_cents: 30675 } });
    const step = nextStep(sent, NOW);
    expect(step.hint).toContain("Proposta nº 7");
    expect(step.hint).toMatch(/306,75/);
    expect(step.hint).toContain("há 3 dias");
  });

  it("mostra o motivo da perda", () => {
    expect(nextStep(lead({ stage: "perdido", lost_reason: "Preço" }), NOW).hint).toBe("Motivo: Preço.");
    expect(nextStep(lead({ stage: "perdido" }), NOW).hint).toMatch(/retomar/);
  });
});

describe("campo de moeda", () => {
  it("transforma os dígitos em centavos e formata em reais", () => {
    expect(centsFromTyping("10147")).toBe(10147);
    expect(centsFromTyping("1.014,70")).toBe(101470);
    expect(centsFromTyping("abc")).toBe(0);
    expect(formatCentsInput(101470)).toBe("1.014,70");
    expect(formatCentsInput(0)).toBe("");
  });
});
