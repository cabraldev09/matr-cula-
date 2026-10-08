import "server-only";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ProposalDocument } from "@/domain/proposal/document";

export interface StoredProposal {
  id: string;
  organizationId: string;
  number: number;
  token: string;
  status: string;
  document: ProposalDocument;
}

function toStored(row: { id: string; organization_id: string; number: number; public_token: string; status: string; snapshot: ProposalDocument }): StoredProposal {
  return { id: row.id, organizationId: row.organization_id, number: row.number, token: row.public_token, status: row.status, document: { ...row.snapshot, number: row.number } };
}

/** Proposta pelo link público (token aleatório de 144 bits). */
export async function loadProposalByToken(token: string): Promise<StoredProposal | null> {
  if (!/^[0-9a-f]{36}$/.test(token)) return null;
  const { data } = await createAdminClient().from("proposals").select("id, organization_id, number, public_token, status, snapshot").eq("public_token", token).neq("status", "cancelada").maybeSingle();
  return data ? toStored(data) : null;
}

/** Proposta para a equipe (o RLS limita à empresa do usuário). */
export async function loadProposalForMember(id: string): Promise<StoredProposal | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await (await createClient()).from("proposals").select("id, organization_id, number, public_token, status, snapshot").eq("id", id).maybeSingle();
  return data ? toStored(data) : null;
}

/** Cobrança pendente mais recente da proposta (para o botão de pagamento da página pública). */
export async function loadOpenCharge(proposalId: string) {
  const { data } = await createAdminClient()
    .from("enrollment_charges")
    .select("id, method, status, payment_url, pix_payload, amount_cents")
    .eq("proposal_id", proposalId)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
