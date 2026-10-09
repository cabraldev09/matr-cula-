import { describe, expect, it } from "vitest";
import { conversionRate, daysInStage, EMPTY_FILTERS, filtersFromParams, matchesFilters, moveBlockedReason, openProposalCents, paramsWithFilters, staleness } from "@/features/crm/board-rules";
import type { Lead } from "@/features/crm/labels";

const NOW = new Date("2026-10-10T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const lead = (patch: Partial<Lead> = {}): Lead => ({
  id: "l1", contact_id: "c1", owner_id: null, source: "whatsapp", stage: "novo", stage_changed_at: daysAgo(0), course_id: null, modality: null, entry_type: null,
  has_previous_studies: null, education_level: null, city: null, start_term: null, best_time: null, incoming_messages: 1, score: 25, temperature: "frio", lost_reason: null,
  notes: "", proposal_id: null, created_at: daysAgo(0), updated_at: daysAgo(0), contacts: { name: "Maira Batista", phone: "5569999990000", email: null }, ...patch,
});

describe("regras do quadro", () => {
  it("não deixa arrastar para etapas que o sistema preenche sozinho", () => {
    expect(moveBlockedReason(lead({ stage: "proposta", proposal_id: "p1" }), "taxa_paga")).toMatch(/pagamento/);
    expect(moveBlockedReason(lead({ stage: "qualificado" }), "matriculado")).toMatch(/taxa/);
    expect(moveBlockedReason(lead({ stage: "taxa_paga" }), "matriculado")).toBeNull();
    expect(moveBlockedReason(lead({ stage: "qualificado" }), "proposta")).toMatch(/proposta/i);
    expect(moveBlockedReason(lead({ stage: "qualificado", proposal_id: "p1" }), "proposta")).toBeNull();
    expect(moveBlockedReason(lead({ stage: "novo" }), "perdido")).toBeNull();
    expect(moveBlockedReason(lead({ stage: "perdido" }), "contato")).toBeNull();
  });

  it("marca lead parado conforme a etapa", () => {
    expect(daysInStage(lead({ stage_changed_at: daysAgo(4) }), NOW)).toBe(4);
    expect(staleness(lead({ stage: "novo", stage_changed_at: daysAgo(0) }), NOW)).toBe("ok");
    expect(staleness(lead({ stage: "novo", stage_changed_at: daysAgo(2) }), NOW)).toBe("warning");
    expect(staleness(lead({ stage: "novo", stage_changed_at: daysAgo(3) }), NOW)).toBe("late");
    expect(staleness(lead({ stage: "proposta", stage_changed_at: daysAgo(2) }), NOW)).toBe("ok");
    expect(staleness(lead({ stage: "proposta", stage_changed_at: daysAgo(5) }), NOW)).toBe("warning");
    expect(staleness(lead({ stage: "proposta", stage_changed_at: daysAgo(9) }), NOW)).toBe("late");
    expect(staleness(lead({ stage: "taxa_paga", stage_changed_at: daysAgo(30) }), NOW)).toBe("ok");
    expect(staleness(lead({ stage: "perdido", stage_changed_at: daysAgo(30) }), NOW)).toBe("ok");
  });

  it("filtra por responsável, origem, temperatura e texto", () => {
    const ctx = { userId: "u1", courseName: (id: string | null) => (id === "c-bio" ? "Biomedicina" : "") };
    const mine = lead({ owner_id: "u1", course_id: "c-bio", temperature: "quente" });
    expect(matchesFilters(mine, { ...EMPTY_FILTERS, owner: "me" }, ctx)).toBe(true);
    expect(matchesFilters(lead(), { ...EMPTY_FILTERS, owner: "me" }, ctx)).toBe(false);
    expect(matchesFilters(lead(), { ...EMPTY_FILTERS, owner: "none" }, ctx)).toBe(true);
    expect(matchesFilters(mine, { ...EMPTY_FILTERS, owner: "u2" }, ctx)).toBe(false);
    expect(matchesFilters(mine, { ...EMPTY_FILTERS, source: "manual" }, ctx)).toBe(false);
    expect(matchesFilters(mine, { ...EMPTY_FILTERS, temperature: "quente", query: "biomed" }, ctx)).toBe(true);
    expect(matchesFilters(mine, { ...EMPTY_FILTERS, query: "9999" }, ctx)).toBe(true);
    expect(matchesFilters(mine, { ...EMPTY_FILTERS, stage: "proposta" }, ctx)).toBe(false);
  });

  it("soma propostas em aberto e calcula a conversão", () => {
    const open = [
      lead({ stage: "proposta", proposals: { number: 1, first_monthly_cents: 30675 } }),
      lead({ stage: "proposta", proposals: { number: 2, first_monthly_cents: 28493 } }),
      lead({ stage: "taxa_paga", proposals: { number: 3, first_monthly_cents: 99999 } }),
    ];
    expect(openProposalCents(open)).toBe(59168);
    expect(conversionRate([])).toBeNull();
    expect(conversionRate([lead({ stage: "taxa_paga" }), lead({ stage: "matriculado" }), lead({ stage: "perdido" }), lead({ stage: "novo" })])).toBe(67);
  });

  it("guarda os filtros na URL e remove os vazios", () => {
    const params = paramsWithFilters(new URLSearchParams("lead=abc"), { temperature: "quente", owner: "me", query: "" });
    expect(params.toString()).toBe("lead=abc&temp=quente&resp=me");
    expect(filtersFromParams(params)).toEqual({ ...EMPTY_FILTERS, temperature: "quente", owner: "me" });
    expect(paramsWithFilters(params, { temperature: "" }).toString()).toBe("lead=abc&resp=me");
  });
});
