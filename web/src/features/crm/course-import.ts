/** "1.014,70" ou "1014.70" → centavos. NaN quando não é número. */
export function parseMoney(value: string): number {
  const text = value.trim().replace(/[R$\s]/g, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : NaN;
}

export const courseKey = (name: string, modality: string) => `${name.trim().toLowerCase()}|${modality.trim().toLowerCase()}`;

export interface ImportRow {
  line: number;
  name: string;
  modality: string;
  semesters: number;
  grossCents: number;
  firstCents: number;
  /** novo: será criado; atualiza: já existe e será atualizado; erro: não entra. */
  status: "novo" | "atualiza" | "erro";
  error?: string;
}

export const IMPORT_FORMAT = "nome;modalidade;semestres;mensalidade;primeira mensalidade";
export const IMPORT_TEMPLATE = `${IMPORT_FORMAT}\nBiomedicina;Semipresencial - Graduação;8;1014,70;306,75\nAdministração;EAD - Graduação;8;756,30;149,90\n`;

/** Lê as linhas coladas ou do CSV e diz, linha por linha, o que será criado, atualizado ou recusado. */
export function parseCourseImport(text: string, existing: ReadonlySet<string>): ImportRow[] {
  const seen = new Map<string, number>();
  const rows: ImportRow[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    if (!raw.trim()) return;
    const cells = raw.split(/;|\t/).map((cell) => cell.trim());
    if (/^(nome|curso)$/i.test(cells[0] ?? "")) return;
    const line = index + 1;
    const [name = "", modalityCell = "", semestersCell = "", grossCell = "", firstCell = ""] = cells;
    const modality = modalityCell || "EAD - Graduação";
    const row: ImportRow = { line, name, modality, semesters: Number(semestersCell), grossCents: parseMoney(grossCell), firstCents: parseMoney(firstCell), status: "novo" };
    const fail = (error: string) => rows.push({ ...row, status: "erro", error });
    if (cells.length < 5) return fail(`Faltam colunas. Use: ${IMPORT_FORMAT}.`);
    if (name.length < 2 || name.length > 160) return fail("O nome do curso precisa ter de 2 a 160 letras.");
    if (!Number.isInteger(row.semesters) || row.semesters < 1 || row.semesters > 20) return fail("Semestres precisa ser um número de 1 a 20.");
    if (!(row.grossCents > 0)) return fail("A mensalidade bruta precisa ser um valor maior que zero.");
    if (!(row.firstCents > 0)) return fail("A primeira mensalidade precisa ser um valor maior que zero.");
    if (row.firstCents > row.grossCents) return fail("A primeira mensalidade não pode passar da mensalidade bruta.");
    const key = courseKey(name, modality);
    const earlier = seen.get(key);
    if (earlier) return fail(`Curso repetido na planilha (já está na linha ${earlier}).`);
    seen.set(key, line);
    rows.push({ ...row, status: existing.has(key) ? "atualiza" : "novo" });
  });
  return rows;
}
