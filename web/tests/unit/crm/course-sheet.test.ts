import { describe, expect, it } from "vitest";
import { parseCourseImport } from "@/features/crm/course-import";
import { detectColumns, sheetToImportText } from "@/features/crm/course-sheet";

describe("planilha de cursos", () => {
  it("lê o cabeçalho em qualquer ordem de colunas e com acentos", () => {
    expect(detectColumns(["Mensalidade bruta", "Curso", "Primeira mensalidade", "Semestres", "Modalidade"])).toEqual({ gross: 0, name: 1, first: 2, semesters: 3, modality: 4 });
    expect(detectColumns(["Nome do Curso", "Formato", "Duração (semestres)", "Valor", "Bolsa (%)"])).toMatchObject({ name: 0, modality: 1, semesters: 2, gross: 3, scholarship: 4 });
    expect(detectColumns(["Biomedicina", "Semipresencial", 8, 1014.7, 306.75])).toBeNull();
  });

  it("converte uma planilha com números e deixa pronta para a prévia da importação", () => {
    const { text, notes } = sheetToImportText([
      ["Curso", "Modalidade", "Semestres", "Mensalidade bruta", "Primeira mensalidade"],
      ["Biomedicina", "Semipresencial - Graduação", 8, 1014.7, 306.75],
      [],
      ["Administração", "EAD - Graduação", 8, "756,30", "149,90"],
    ]);
    expect(notes).toEqual([]);
    expect(text).toBe("Biomedicina;Semipresencial - Graduação;8;1014,70;306,75\nAdministração;EAD - Graduação;8;756,30;149,90");
    const rows = parseCourseImport(text, new Set());
    expect(rows.map((r) => [r.name, r.status, r.grossCents, r.firstCents])).toEqual([["Biomedicina", "novo", 101470, 30675], ["Administração", "novo", 75630, 14990]]);
  });

  it("calcula a primeira mensalidade pela bolsa quando só ela existe", () => {
    const { text, notes } = sheetToImportText([
      ["Curso", "Mensalidade", "Bolsa"],
      ["Nutrição", 1073.8, 0.7],
      ["Pedagogia", "756,30", "60"],
    ]);
    expect(notes).toContain("A primeira mensalidade foi calculada pela bolsa (%).");
    expect(notes).toContain("Sem coluna de semestres: usei 8.");
    expect(text.split("\n")).toEqual(["Nutrição;;8;1073,80;322,14", "Pedagogia;;8;756,30;302,52"]);
  });

  it("sem cabeçalho usa a ordem do modelo, e planilha vazia avisa", () => {
    const { text, notes } = sheetToImportText([["Biomedicina", "Semipresencial - Graduação", 8, 1014.7, 306.75]]);
    expect(text).toBe("Biomedicina;Semipresencial - Graduação;8;1014,70;306,75");
    expect(notes[0]).toMatch(/Não achei cabeçalho/);
    expect(sheetToImportText([[], ["", null]]).notes).toEqual(["A planilha está vazia."]);
  });
});
