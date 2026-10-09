export type FeeStatus = "paid" | "pending" | "none";

export interface ProposalListRow {
  id: string;
  number: number;
  public_token: string;
  lead_id: string | null;
  student_name: string;
  course_name: string;
  modality: string;
  first_monthly_cents: number;
  created_at: string;
  fee: FeeStatus;
}

export const FEE_LABELS: Record<FeeStatus, string> = { paid: "Taxa paga", pending: "Cobrança em aberto", none: "Sem cobrança" };

/** Situação da taxa de uma proposta a partir das cobranças ligadas a ela. */
export function feeStatus(chargeStatuses: readonly string[]): FeeStatus {
  if (chargeStatuses.includes("paid")) return "paid";
  if (chargeStatuses.includes("pending")) return "pending";
  return "none";
}

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterProposals(rows: readonly ProposalListRow[], query: string, fee: FeeStatus | ""): ProposalListRow[] {
  const needle = normalize(query.trim());
  return rows.filter((row) => {
    if (fee && row.fee !== fee) return false;
    if (!needle) return true;
    return normalize(`${row.number} ${row.student_name} ${row.course_name} ${row.modality}`).includes(needle);
  });
}

export function summarize(rows: readonly ProposalListRow[]) {
  return {
    count: rows.length,
    monthlyCents: rows.reduce((sum, row) => sum + row.first_monthly_cents, 0),
    paid: rows.filter((row) => row.fee === "paid").length,
    pending: rows.filter((row) => row.fee === "pending").length,
  };
}
