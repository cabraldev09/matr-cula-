import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CrmBoard } from "@/features/crm/board";
import type { Course } from "@/features/crm/labels";
import { loadMembers } from "@/features/attendance/members";
import { loadProposalSettings } from "@/features/proposals/settings";
import { getPaymentAccountSummary } from "@/services/payments/accounts";
import { currentIntakeTerm } from "@/domain/proposal/document";

export const metadata: Metadata = { title: "Funil de matrículas" };
export const dynamic = "force-dynamic";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { lead } = await searchParams;
  const context = await requireContextModule("crm");
  const organizationId = context.organization.organizationId;
  const supabase = await createClient();
  const [members, { data: courses }, settings, account] = await Promise.all([
    loadMembers(supabase, organizationId),
    supabase.from("courses").select("id, name, modality, semesters, gross_monthly_cents, default_first_monthly_cents, active").eq("organization_id", organizationId).order("name"),
    loadProposalSettings(supabase, organizationId, context.organization.name),
    getPaymentAccountSummary(organizationId),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Funil de matrículas"
        description="Quem chama no WhatsApp entra aqui na hora. Qualifique, envie a proposta de bolsa e cobre a taxa de matrícula sem sair do funil."
      />
      <CrmBoard
        organizationId={organizationId}
        userId={context.authUserId}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
        courses={(courses ?? []) as Course[]}
        enrollmentFeeCents={settings.rules.enrollmentFeeCents}
        efiConfigured={account.efiConfigured}
        pixConfigured={Boolean(settings.pixKey)}
        defaultStartTerm={currentIntakeTerm(new Date())}
        initialLeadId={lead && /^[0-9a-f-]{36}$/.test(lead) ? lead : null}
      />
    </>
  );
}
