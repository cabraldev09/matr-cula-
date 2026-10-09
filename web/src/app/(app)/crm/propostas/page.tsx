import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { feeStatus, type ProposalListRow } from "@/features/crm/proposal-list";
import { ProposalsTable } from "@/features/crm/proposals-table";

export const metadata: Metadata = { title: "Propostas" };
export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const context = await requireContextModule("crm");
  const supabase = await createClient();
  const organizationId = context.organization.organizationId;
  const [{ data: proposals }, { data: charges }] = await Promise.all([
    supabase.from("proposals").select("id, number, public_token, lead_id, student_name, course_name, modality, first_monthly_cents, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(500),
    supabase.from("enrollment_charges").select("proposal_id, status").eq("organization_id", organizationId).not("proposal_id", "is", null).limit(2000),
  ]);
  const byProposal = new Map<string, string[]>();
  for (const charge of charges ?? []) byProposal.set(charge.proposal_id as string, [...(byProposal.get(charge.proposal_id as string) ?? []), charge.status as string]);
  const rows: ProposalListRow[] = (proposals ?? []).map((p) => ({ ...p, fee: feeStatus(byProposal.get(p.id) ?? []) })) as ProposalListRow[];
  return (
    <>
      <PageHeader eyebrow="CRM" title="Propostas" description="Todas as propostas de bolsa geradas pela equipe, com link para o aluno, PDF e o lead de origem." />
      <ProposalsTable rows={rows} />
    </>
  );
}
