import { IMPORT_FORMAT, parseMoney } from "@/features/crm/course-import";

type Cell = string | number | boolean | Date | null | undefined;
export type SheetColumn = "name" | "modality" | "semesters" | "gross" | "first" | "scholarship";

const normalize = (value: Cell) => String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9% ]+/g, " ").replace(/\s+/g, " ").trim();

/** Palavras do cabeçalho que identificam cada coluna. A ordem importa: a 1ª que casar vale. */
const HEADERS: [SheetColumn, RegExp][] = [
  ["first", /primeira|1a mensalidade|com bolsa|valor final|mensalidade liquida/],
  ["scholarship", /bolsa|desconto/],
  ["gross", /bruta|cheia|valor|preco|mensalidade/],
  ["semesters", /semestre|duracao|periodo/],
  ["modality", /modalidade|formato/],
  ["name", /curso|nome/],
];

function columnOf(header: Cell): SheetColumn | null {
  const text = normalize(header);
  if (!text) return null;
  return HEADERS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}

/** Descobre quais colunas existem pelo cabeçalho. Sem cabeçalho reconhecível, usa a ordem padrão do modelo. */
export function detectColumns(row: readonly Cell[]): Partial<Record<SheetColumn, number>> | null {
  const found: Partial<Record<SheetColumn, number>> = {};
  row.forEach((cell, index) => {
    const column = columnOf(cell);
    if (column && found[column] === undefined) found[column] = index;
  });
  return Object.keys(found).length >= 3 && found.name !== undefined ? found : null;
}

const DEFAULT_ORDER: Record<SheetColumn, number> = { name: 0, modality: 1, semesters: 2, gross: 3, first: 4, scholarship: -1 };

function moneyCell(cell: Cell): string {
  if (typeof cell === "number") return cell.toFixed(2).replace(".", ",");
  return String(cell ?? "").trim();
}

function percentOf(cell: Cell): number | null {
  const n = typeof cell === "number" ? cell : Number(String(cell ?? "").replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  // Célula formatada como porcentagem vem como fração (0,6977); digitada como 69,77 vem como 69,77.
  return typeof cell === "number" && n <= 1 ? n * 100 : n;
}

export interface SheetConversion {
  /** Linhas no formato do modelo, prontas para a prévia da importação. */
  text: string;
  /** Avisos sobre como a planilha foi lida (colunas não encontradas, bolsa usada no lugar do valor). */
  notes: string[];
}

/** Converte a tabela lida da planilha para as linhas do modelo (`nome;modalidade;semestres;mensalidade;primeira mensalidade`). */
export function sheetToImportText(matrix: readonly (readonly Cell[])[]): SheetConversion {
  const rows = matrix.filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
  const notes: string[] = [];
  if (rows.length === 0) return { text: "", notes: ["A planilha está vazia."] };
  const detected = detectColumns(rows[0]!);
  const body = detected ? rows.slice(1) : rows;
  const cols: Partial<Record<SheetColumn, number>> = detected ?? DEFAULT_ORDER;
  if (!detected) notes.push(`Não achei cabeçalho: usei a ordem ${IMPORT_FORMAT}.`);
  else {
    if (cols.gross === undefined) notes.push("Não achei a coluna da mensalidade bruta.");
    if (cols.first === undefined && cols.scholarship === undefined) notes.push("Não achei a coluna da primeira mensalidade nem a da bolsa (%).");
    if (cols.first === undefined && cols.scholarship !== undefined) notes.push("A primeira mensalidade foi calculada pela bolsa (%).");
    if (cols.semesters === undefined) notes.push("Sem coluna de semestres: usei 8.");
    if (cols.modality === undefined) notes.push("Sem coluna de modalidade: usei EAD - Graduação.");
  }
  const at = (row: readonly Cell[], column: SheetColumn): Cell => {
    const index = cols[column];
    return index === undefined || index < 0 ? undefined : row[index];
  };
  const lines = body.map((row) => {
    const gross = moneyCell(at(row, "gross"));
    let first = moneyCell(at(row, "first"));
    if (!first) {
      const pct = percentOf(at(row, "scholarship"));
      const grossCents = parseMoney(gross);
      if (pct !== null && pct < 100 && grossCents > 0) first = (Math.round(grossCents * (1 - pct / 100)) / 100).toFixed(2).replace(".", ",");
    }
    const semesters = at(row, "semesters");
    return [String(at(row, "name") ?? "").trim(), String(at(row, "modality") ?? "").trim(), semesters === undefined || semesters === "" ? "8" : String(semesters).trim(), gross, first].join(";");
  });
  return { text: lines.join("\n"), notes };
}
