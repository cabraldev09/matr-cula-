import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { QuickAnswersSettings, TagsSettings, TeamsSettings } from "@/features/attendance/settings";
import { loadMembers } from "@/features/attendance/members";

export const metadata: Metadata = { title: "Departamentos e respostas" };
export const dynamic = "force-dynamic";

export default async function AttendanceSettingsPage() {
  const context = await requireContextModule("atendimento");
  if (!["owner", "admin"].includes(context.organization.role)) redirect("/atendimento");
  const organizationId = context.organization.organizationId;
  const supabase = await createClient();
  const [{ data: teams }, { data: teamMembers }, { data: answers }, { data: tags }, members] = await Promise.all([
    supabase.from("teams").select("id, name, color, greeting_message").eq("organization_id", organizationId).order("name"),
    supabase.from("team_members").select("team_id, user_id").eq("organization_id", organizationId),
    supabase.from("quick_answers").select("id, shortcut, body").eq("organization_id", organizationId).order("shortcut"),
    supabase.from("tags").select("id, name, color").eq("organization_id", organizationId).order("name"),
    loadMembers(supabase, organizationId),
  ]);
  return (
    <>
      <PageHeader eyebrow="Atendimento" title="Departamentos e respostas" description="Organize a equipe em departamentos e padronize as respostas." />
      <div className="grid gap-6 xl:grid-cols-2">
        <TeamsSettings organizationId={organizationId} teams={teams ?? []} members={members} teamMembers={teamMembers ?? []} />
        <div className="grid gap-6">
          <QuickAnswersSettings organizationId={organizationId} answers={answers ?? []} />
          <TagsSettings organizationId={organizationId} tags={tags ?? []} />
        </div>
      </div>
    </>
  );
}
