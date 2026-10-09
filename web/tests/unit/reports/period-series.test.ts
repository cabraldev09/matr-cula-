import { describe, expect, it } from "vitest";
import { resolvePeriod } from "@/features/reports/period";
import { bucketByDay, formatChange, lostReasonLabel, pctChange } from "@/features/reports/series";

// Os testes do projeto usam o fuso UTC-4 (tests/setup.ts). 10/10/2026 14:00 nesse fuso.
const NOW = new Date("2026-10-10T18:00:00Z");

describe("período do relatório", () => {
  it("este mês começa no dia 1 à meia-noite do fuso da aplicação e compara com a janela anterior de mesmo tamanho", () => {
    const p = resolvePeriod({}, NOW);
    expect(p.key).toBe("mes");
    expect(p.from.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(p.to).toEqual(NOW);
    expect(p.prevTo).toEqual(p.from);
    expect(p.prevTo.getTime() - p.prevFrom.getTime()).toBe(NOW.getTime() - p.from.getTime());
    expect(p.fromDay).toBe("2026-10-01");
    expect(p.toDay).toBe("2026-10-10");
  });

  it("aceita 30 e 90 dias e período personalizado inclusivo, limitado a hoje", () => {
    expect(resolvePeriod({ periodo: "30d" }, NOW).label).toBe("Últimos 30 dias");
    expect(resolvePeriod({ periodo: "90d" }, NOW).from.getTime()).toBe(NOW.getTime() - 90 * 86_400_000);
    const custom = resolvePeriod({ de: "2026-09-01", ate: "2026-09-30" }, NOW);
    expect(custom.key).toBe("personalizado");
    expect(custom.from.toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(custom.to.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    expect(resolvePeriod({ de: "2026-10-01", ate: "2026-12-31" }, NOW).to).toEqual(NOW);
  });

  it("volta para este mês quando as datas são inválidas ou o intervalo é grande demais", () => {
    expect(resolvePeriod({ de: "2026-02-31", ate: "2026-03-05" }, NOW).key).toBe("mes");
    expect(resolvePeriod({ de: "2026-10-05", ate: "2026-10-01" }, NOW).key).toBe("mes");
    expect(resolvePeriod({ de: "2024-01-01", ate: "2026-10-01" }, NOW).key).toBe("mes");
    expect(resolvePeriod({ periodo: "xyz" }, NOW).key).toBe("mes");
  });
});

describe("séries e variação", () => {
  it("conta por dia civil do fuso da aplicação e preenche os dias vazios", () => {
    const from = new Date("2026-10-08T04:00:00Z");
    const to = new Date("2026-10-11T04:00:00Z");
    // 09/10 02:30Z ainda é 08/10 22:30 no fuso UTC-4.
    const points = bucketByDay(["2026-10-08T05:00:00Z", "2026-10-09T02:30:00Z", "2026-10-10T20:00:00Z", "2026-10-10T21:00:00Z"], from, to);
    expect(points.map((p) => [p.label, p.count])).toEqual([["08/10", 2], ["09/10", 0], ["10/10", 2]]);
  });

  it("calcula e escreve a variação", () => {
    expect(pctChange(12, 10)).toBe(20);
    expect(pctChange(5, 10)).toBe(-50);
    expect(pctChange(3, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
    expect([20, -50, null, 0].map(formatChange)).toEqual(["+20%", "−50%", "novo", "igual"]);
  });

  it("agrupa o motivo de perda sem a observação", () => {
    expect(lostReasonLabel("Preço: achou cara")).toBe("Preço");
    expect(lostReasonLabel("Sem retorno")).toBe("Sem retorno");
    expect(lostReasonLabel(null)).toBe("Sem motivo informado");
  });
});
