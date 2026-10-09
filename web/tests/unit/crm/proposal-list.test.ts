import { describe, expect, it } from "vitest";
import { feeStatus, filterProposals, summarize, type ProposalListRow } from "@/features/crm/proposal-list";

const row = (patch: Partial<ProposalListRow>): ProposalListRow => ({
  id: "p", number: 1, public_token: "t", lead_id: "l", student_name: "Maira da Silva", course_name: "Biomedicina", modality: "Semipresencial - Graduação",
  first_monthly_cents: 30675, created_at: "2026-10-08T12:00:00Z", fee: "none", ...patch,
});

describe("lista de propostas", () => {
  const rows = [
    row({ id: "a", number: 1, fee: "paid" }),
    row({ id: "b", number: 2, student_name: "João Pereira", course_name: "Nutrição", first_monthly_cents: 28493, fee: "pending" }),
    row({ id: "c", number: 3, student_name: "Ana Souza", course_name: "Administração", first_monthly_cents: 14990 }),
  ];

  it("resume a situação da taxa pelas cobranças", () => {
    expect(feeStatus(["canceled", "paid"])).toBe("paid");
    expect(feeStatus(["pending", "canceled"])).toBe("pending");
    expect(feeStatus(["canceled"])).toBe("none");
    expect(feeStatus([])).toBe("none");
  });

  it("busca sem acento nem caixa, por aluno, curso ou número", () => {
    expect(filterProposals(rows, "joao", "").map((r) => r.id)).toEqual(["b"]);
    expect(filterProposals(rows, "NUTRICAO", "").map((r) => r.id)).toEqual(["b"]);
    expect(filterProposals(rows, "3", "").map((r) => r.id)).toEqual(["c"]);
    expect(filterProposals(rows, "", "").length).toBe(3);
  });

  it("filtra pela situação da taxa e soma os valores visíveis", () => {
    expect(filterProposals(rows, "", "paid").map((r) => r.id)).toEqual(["a"]);
    expect(filterProposals(rows, "maira", "pending")).toEqual([]);
    expect(summarize(rows)).toEqual({ count: 3, monthlyCents: 74158, paid: 1, pending: 1 });
  });
});
