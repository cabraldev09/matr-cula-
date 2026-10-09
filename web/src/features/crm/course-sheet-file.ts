import { sheetToImportText, type SheetConversion } from "@/features/crm/course-sheet";

const MAX_BYTES = 2 * 1024 * 1024;

/** Lê o arquivo escolhido (.xlsx, .csv ou .txt) e devolve as linhas no formato da importação. */
export async function readCourseFile(file: File): Promise<SheetConversion> {
  const name = file.name.toLowerCase();
  if (file.size > MAX_BYTES) return { text: "", notes: ["O arquivo passa de 2 MB. Envie só a tabela de cursos."] };
  if (name.endsWith(".xls")) return { text: "", notes: ["Arquivos .xls antigos não são lidos. Salve a planilha como .xlsx ou .csv e envie de novo."] };
  if (name.endsWith(".xlsx")) {
    try {
      const { default: readXlsxFile } = await import("read-excel-file");
      return sheetToImportText((await readXlsxFile(file)) as unknown as (string | number | null)[][]);
    } catch {
      return { text: "", notes: ["Não consegui abrir essa planilha. Confira se é um arquivo .xlsx válido."] };
    }
  }
  return { text: (await file.text()).replace(/^﻿/, ""), notes: [] };
}
