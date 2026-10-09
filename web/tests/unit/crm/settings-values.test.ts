import { describe, expect, it } from "vitest";
import { DEFAULT_PROPOSAL_RULES } from "@/domain/proposal/pricing";
import { isDirty, payloadFromValues, validateValues, valuesFromInitial, type SettingsFormValues } from "@/features/crm/settings-values";

const initial: SettingsFormValues = {
  institutionName: "Polo Demo", institutionDocument: "07.158.229/0007-93", logoSource: "preset_cruzeiro", uploadedLogoUrl: null,
  rules: DEFAULT_PROPOSAL_RULES, projectionNote: "Nota", finalMessage: "Fim", pixKey: "pix@polo.test", pixMerchantName: "Polo", pixCity: "Porto Velho",
};

describe("configurações da proposta", () => {
  it("ida e volta: os valores padrão voltam iguais ao salvar sem mexer", () => {
    const values = valuesFromInitial(initial);
    expect(validateValues(values)).toEqual({});
    const payload = payloadFromValues(values);
    expect(payload.rules).toEqual(DEFAULT_PROPOSAL_RULES);
    expect(payload.logoSource).toBe("preset_cruzeiro");
  });

  it("aceita vírgula decimal e recalcula a faixa do segundo reajuste", () => {
    const values = { ...valuesFromInitial(initial), lateTier1Pct: "12,5", readjustUntil: "4", enrollmentFee: "120,50" };
    const { rules } = payloadFromValues(values);
    expect(rules.lateTier1Pct).toBe(12.5);
    expect(rules.enrollmentFeeCents).toBe(12050);
    expect(rules.semesterReadjust).toEqual([{ from: 2, to: 4, pct: 2 }, { from: 5, to: null, pct: 3 }]);
  });

  it("aponta o campo com problema", () => {
    const base = valuesFromInitial(initial);
    expect(validateValues({ ...base, dueDay: "31" }).dueDay).toMatch(/1 a 28/);
    expect(validateValues({ ...base, punctualityPct: "120" }).punctualityPct).toMatch(/0 a 100/);
    expect(validateValues({ ...base, annualMinPct: "11", annualMaxPct: "5" }).annualMaxPct).toMatch(/menor/);
    expect(validateValues({ ...base, institutionName: " " }).institutionName).toBeDefined();
    expect(validateValues({ ...base, pixMerchantName: "" }).pixMerchantName).toMatch(/recebedor/);
    expect(validateValues({ ...base, pixKey: "", pixMerchantName: "", pixCity: "" })).toEqual({});
  });

  it("detecta alterações não salvas", () => {
    const base = valuesFromInitial(initial);
    expect(isDirty(base, { ...base })).toBe(false);
    expect(isDirty(base, { ...base, finalMessage: "Outra" })).toBe(true);
  });
});
