import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildProposalDocument } from "@/domain/proposal/document";
import { DEFAULT_PROPOSAL_RULES } from "@/domain/proposal/pricing";
import { renderProposalPdf } from "@/features/proposals/pdf";

async function pdfText(bytes: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
}

describe("PDF da proposta", () => {
  it("gera a proposta no layout do modelo, com logo e valores", async () => {
    const doc = buildProposalDocument({
      number: 12,
      institutionName: "Universidade Cruzeiro do Sul Virtual",
      institutionDocument: "07.158.229/0007-93",
      logo: { source: "preset_cruzeiro", path: null },
      courseName: "Biomedicina",
      modality: "Semipresencial - Graduação",
      semesters: 8,
      studentName: "Maria Teste",
      grossMonthlyCents: 101470,
      firstMonthlyCents: 30675,
      startTerm: "2026.2",
      rules: DEFAULT_PROPOSAL_RULES,
      projectionNote: "Apresente ao aluno uma faixa de planejamento.",
      finalMessage: "Condições válidas na data de hoje.",
      generatedAt: new Date("2026-10-07T21:06:00Z"),
    });
    const logo = await readFile(path.join(process.cwd(), "public/presets/cruzeiro-do-sul-virtual.png"));
    const bytes = await renderProposalPdf(doc, logo);
    if (process.env.PROPOSAL_PDF_OUT) await writeFile(process.env.PROPOSAL_PDF_OUT, bytes);
    const text = (await pdfText(bytes)).replace(/\s+/g, " ");
    expect(text).toContain("Proposta de Bolsa - Biomedicina");
    expect(text).toContain("Maria Teste");
    expect(text).toContain("CNPJ 07.158.229/0007-93");
    expect(text).toContain("69,77%");
    expect(text).toMatch(/R\$\s?306,75/);
    expect(text).toMatch(/R\$\s?99,00/);
    expect(text).toMatch(/R\$\s?352,76/);
    expect(text).toMatch(/R\$\s?569,63/);
    expect(text).toContain("2030.1");
    expect(text).toContain("Valor total do pedido");
  }, 30_000);
});
