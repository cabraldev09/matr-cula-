import { describe, expect, it } from "vitest";
import { initialsOf } from "@/components/shared/person-avatar";
import { MODULE_ICONS } from "@/components/icons/modules";
import { BRAND_MARK_PATH } from "@/components/icons/brand-mark";
import { MODULES } from "@/lib/modules";

describe("identidade visual", () => {
  it("tira as iniciais do primeiro e do último nome", () => {
    expect(initialsOf("Maira da Silva Batista")).toBe("MB");
    expect(initialsOf("  juliana  ")).toBe("J");
    expect(initialsOf("5569991110000")).toBe("5");
    expect(initialsOf("Ana-Clara Souza")).toBe("AS");
    expect(initialsOf("")).toBe("?");
  });

  it("tem um ícone para cada módulo vendável", () => {
    expect(Object.keys(MODULE_ICONS).sort()).toEqual(Object.keys(MODULES).sort());
    for (const icon of Object.values(MODULE_ICONS)) expect(typeof icon).toBe("function");
  });

  it("mantém a geometria do símbolo usada no favicon", () => {
    expect(BRAND_MARK_PATH).toMatch(/^M7 31V17\.5L17 27\.5 27 12\.5V31$/);
  });
});
