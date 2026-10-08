import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Contacts } from "@/features/attendance/contacts";

export const metadata: Metadata = { title: "Contatos" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const context = await requireContextModule("atendimento");
  const organizationId = context.organization.organizationId;
  const { data: tags } = await (await createClient()).from("tags").select("id, name, color").eq("organization_id", organizationId).order("name");
  return (
    <>
      <PageHeader eyebrow="Atendimento" title="Contatos" description="Pessoas que falam com a sua empresa. Toque numa etiqueta para marcar ou desmarcar." />
      <Contacts organizationId={organizationId} manager={["owner", "admin"].includes(context.organization.role)} tags={tags ?? []} />
    </>
  );
}
