import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Inbox } from "@/features/attendance/inbox";
import { loadMembers } from "@/features/attendance/members";

export const metadata: Metadata = { title: "Conversas" };
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const context = await requireContextModule("atendimento");
  const organizationId = context.organization.organizationId;
  const supabase = await createClient();
  const [members, { data: teams }] = await Promise.all([
    loadMembers(supabase, organizationId),
    supabase.from("teams").select("id, name").eq("organization_id", organizationId).order("name"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Atendimento" title="Conversas" description="Assuma, responda e encerre os atendimentos da equipe. A lista atualiza sozinha." />
      <Inbox
        organizationId={organizationId}
        userId={context.authUserId}
        supervisor={["owner", "admin", "supervisor"].includes(context.organization.role)}
        members={Object.fromEntries(members.map((m) => [m.id, m.name]))}
        teams={teams ?? []}
      />
    </>
  );
}
