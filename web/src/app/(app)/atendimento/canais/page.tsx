import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { Channels, type Channel } from "@/features/attendance/channels";

export const metadata: Metadata = { title: "Canais" };
export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const context = await requireContextModule("atendimento");
  const organizationId = context.organization.organizationId;
  const supabase = await createClient();
  const [{ data: channels }, { data: teams }] = await Promise.all([
    supabase.from("channels").select("id, name, provider, phone_number_id, enabled, default_team_id").eq("organization_id", organizationId).order("created_at"),
    supabase.from("teams").select("id, name").eq("organization_id", organizationId).order("name"),
  ]);
  return (
    <>
      <PageHeader eyebrow="Atendimento" title="Canais" description="Números e canais pelos quais os clientes falam com a empresa." />
      <Channels
        organizationId={organizationId}
        manager={["owner", "admin"].includes(context.organization.role)}
        channels={(channels ?? []) as Channel[]}
        teams={teams ?? []}
        limit={context.entitlements?.plan?.limits?.channels ?? null}
      />
    </>
  );
}
