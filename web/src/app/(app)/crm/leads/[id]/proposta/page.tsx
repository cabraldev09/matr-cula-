import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { currentIntakeTerm } from "@/domain/proposal/document";
import type { Course } from "@/features/crm/labels";
import { draftDefaults } from "@/features/crm/proposal-draft";
import { ProposalWorkspace } from "@/features/crm/proposal-workspace";
import { loadProposalSettings, proposalLogoUrl } from "@/features/proposals/settings";

export const metadata: Metadata = { title: "Proposta de bolsa" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadProposalPage({ params }: PageProps<"/crm/leads/[id]/proposta">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const context = await requireContextModule("crm");
  const organizationId = context.organization.organizationId;
  const supabase = await createClient();
  const [{ data: lead }, { data: courses }, settings, { data: latest }] = await Promise.all([
    supabase.from("leads").select("id, course_id, modality, start_term, contacts(name)").eq("organization_id", organizationId).eq("id", id).maybeSingle(),
    supabase.from("courses").select("id, name, modality, semesters, gross_monthly_cents, default_first_monthly_cents, active").eq("organization_id", organizationId).order("name"),
    loadProposalSettings(supabase, organizationId, context.organization.name),
    supabase.from("proposals").select("id, public_token, number").eq("organization_id", organizationId).eq("lead_id", id).order("created_at", { ascending: false }).limit(1),
  ]);
  if (!lead) notFound();
  const courseList = (courses ?? []) as Course[];
  const contact = lead.contacts as unknown as { name: string } | null;
  const initial = draftDefaults({
    studentName: contact?.name ?? "",
    course: courseList.find((c) => c.id === lead.course_id) ?? null,
    modality: lead.modality,
    startTerm: lead.start_term ?? currentIntakeTerm(new Date()),
    rules: settings.rules,
    projectionNote: settings.projectionNote,
    finalMessage: settings.finalMessage,
  });
  const last = latest?.[0];
  const logo = { source: settings.logoSource, path: settings.logoPath };
  return (
    <>
      <PageHeader eyebrow="CRM" title="Proposta de bolsa" description={`Monte, ajuste, salve ou compartilhe a proposta de ${contact?.name ?? "este lead"}. Cada vez que você salvar, nasce uma nova versão numerada.`} />
      <ProposalWorkspace
        leadId={lead.id}
        initial={initial}
        courses={courseList}
        baseRules={settings.rules}
        institution={{ name: settings.institutionName, document: settings.institutionDocument, logo, logoUrl: proposalLogoUrl(logo) }}
        canConfigure={["owner", "admin"].includes(context.organization.role)}
        latest={last ? { id: last.id, token: last.public_token, number: last.number } : null}
      />
    </>
  );
}
