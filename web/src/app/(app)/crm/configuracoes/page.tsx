import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { loadProposalSettings, proposalLogoUrl } from "@/features/proposals/settings";
import { getPaymentAccountSummary } from "@/services/payments/accounts";
import { ProposalSettings } from "@/features/crm/settings-form";

export const metadata: Metadata = { title: "Proposta e pagamentos" };
export const dynamic = "force-dynamic";

export default async function CrmSettingsPage() {
  const context = await requireContextModule("crm");
  if (!["owner", "admin"].includes(context.organization.role)) redirect("/crm");
  const organizationId = context.organization.organizationId;
  const [settings, account] = await Promise.all([
    loadProposalSettings(await createClient(), organizationId, context.organization.name),
    getPaymentAccountSummary(organizationId),
  ]);
  return (
    <>
      <PageHeader eyebrow="CRM" title="Proposta e pagamentos" description="Como a proposta de bolsa sai para o aluno e como o polo recebe a taxa de matrícula." />
      <ProposalSettings
        initial={{
          institutionName: settings.institutionName,
          institutionDocument: settings.institutionDocument,
          logoSource: settings.logoSource,
          uploadedLogoUrl: settings.logoPath ? proposalLogoUrl({ source: "upload", path: settings.logoPath }) : null,
          rules: settings.rules,
          projectionNote: settings.projectionNote,
          finalMessage: settings.finalMessage,
          pixKey: settings.pixKey ?? "",
          pixMerchantName: settings.pixMerchantName ?? "",
          pixCity: settings.pixCity ?? "",
        }}
        efi={{ configured: account.efiConfigured, clientIdHint: account.clientIdHint, sandbox: account.sandbox, isOwner: context.organization.role === "owner" }}
      />
    </>
  );
}
