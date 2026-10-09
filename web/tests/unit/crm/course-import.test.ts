import { describe, expect, it } from "vitest";
import { courseKey, parseCourseImport, parseMoney } from "@/features/crm/course-import";

describe("importação de cursos", () => {
  it("lê valores em reais no formato brasileiro", () => {
    expect(parseMoney("1.014,70")).toBe(101470);
    expect(parseMoney("R$ 306,75")).toBe(30675);
    expect(parseMoney("1014.70")).toBe(101470);
    expect(parseMoney("abc")).toBeNaN();
  });

  it("separa o que será criado, atualizado e recusado, com o motivo de cada recusa", () => {
    const existing = new Set([courseKey("Biomedicina", "Semipresencial - Graduação")]);
    const rows = parseCourseImport(
      [
        "nome;modalidade;semestres;mensalidade;primeira mensalidade",
        "Biomedicina;Semipresencial - Graduação;8;1014,70;306,75",
        "Nutrição;Semipresencial - Graduação;8;1073,80;284,93",
        "",
        "Pedagogia;EAD - Graduação;8;756,30",
        "Direito;EAD - Graduação;30;900,00;300,00",
        "Letras;EAD - Graduação;8;500,00;600,00",
        "nutrição;semipresencial - graduação;8;1000,00;200,00",
      ].join("\n"),
      existing,
    );
    expect(rows.map((r) => [r.line, r.status])).toEqual([[2, "atualiza"], [3, "novo"], [5, "erro"], [6, "erro"], [7, "erro"], [8, "erro"]]);
    expect(rows[2]!.error).toMatch(/Faltam colunas/);
    expect(rows[3]!.error).toMatch(/Semestres/);
    expect(rows[4]!.error).toMatch(/não pode passar/);
    expect(rows[5]!.error).toMatch(/linha 3/);
    expect(rows[1]).toMatchObject({ name: "Nutrição", grossCents: 107380, firstCents: 28493, semesters: 8 });
  });

  it("usa a modalidade padrão quando a coluna vem vazia", () => {
    const [row] = parseCourseImport("Administração;;8;756,30;149,90", new Set());
    expect(row).toMatchObject({ status: "novo", modality: "EAD - Graduação" });
  });
});
