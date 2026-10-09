import { describe, expect, it } from "vitest";
import { buildPriorities, nearLimitItems, trialDaysLeft, type PanelCounts } from "@/features/home/priorities";

const none: PanelCounts = { pendingConversations: 0, oldestPendingMs: null, staleLeads: 0, hotLeads: 0, proposalsWaiting: 0, trialDaysLeft: null, nearLimit: [] };
const NOW = new Date("2026-10-10T12:00:00Z");

describe("prioridades do início", () => {
  it("fica vazia quando está tudo em dia", () => {
    expect(buildPriorities(none, { manager: true })).toEqual([]);
  });

  it("ordena o mais urgente primeiro e marca fila antiga como crítica", () => {
    const list = buildPriorities({ ...none, hotLeads: 2, staleLeads: 1, pendingConversations: 3, oldestPendingMs: 40 * 60_000 }, { manager: false });
    expect(list.map((p) => p.key)).toEqual(["fila", "parados", "quentes"]);
    expect(list[0]).toMatchObject({ tone: "danger", title: "3 conversas esperando atendimento" });
    expect(list[0]!.detail).toContain("40 min");
  });

  it("fila recente é só um aviso, no singular quando é uma", () => {
    const [item] = buildPriorities({ ...none, pendingConversations: 1, oldestPendingMs: 2 * 60_000 }, { manager: false });
    expect(item).toMatchObject({ tone: "warning", title: "1 conversa esperando atendimento" });
  });

  it("avisos de plano só aparecem para quem gerencia", () => {
    const counts = { ...none, trialDaysLeft: 2, nearLimit: ["usuários 4 de 5"] };
    expect(buildPriorities(counts, { manager: false })).toEqual([]);
    const list = buildPriorities(counts, { manager: true });
    expect(list.map((p) => p.key)).toEqual(["teste", "limite"]);
    expect(list[0]!.title).toBe("Seu teste grátis termina em 2 dias");
    expect(buildPriorities({ ...none, trialDaysLeft: 0 }, { manager: true })[0]!.title).toBe("Seu teste grátis termina hoje");
    expect(buildPriorities({ ...none, trialDaysLeft: 5 }, { manager: true })).toEqual([]);
  });

  it("calcula limites perto de estourar e dias de teste", () => {
    expect(nearLimitItems({ users: 4, channels: 1, analyses: 100 }, { users: 5, channels: 3, analyses: 300 })).toEqual(["usuários 4 de 5"]);
    expect(nearLimitItems({ users: 5 }, {})).toEqual([]);
    expect(trialDaysLeft("trialing", "2026-10-12T12:00:00Z", NOW)).toBe(2);
    expect(trialDaysLeft("trialing", "2026-10-09T12:00:00Z", NOW)).toBe(0);
    expect(trialDaysLeft("active", "2026-10-12T12:00:00Z", NOW)).toBeNull();
  });
});
