export interface ProposalRow {
  id: string;
  number: number;
  public_token: string;
  course_name: string;
  first_monthly_cents: number;
  created_at: string;
}

export interface ChargeRow {
  id: string;
  method: "efi_link" | "pix_manual";
  status: "pending" | "paid" | "canceled";
  amount_cents: number;
  payment_url: string | null;
  pix_payload: string | null;
  created_at: string;
}

export interface Member {
  id: string;
  name: string;
}
