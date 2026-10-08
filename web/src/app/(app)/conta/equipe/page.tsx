import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionContext } from "@/lib/session";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { prismaUnscoped } from "@/lib/prisma";
import { withTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";
import { MEMBER_ROLE_DESCRIPTIONS, MEMBER_ROLE_LABELS } from "@/lib/member-roles";
import { getSystemSettings } from "@/repositories/settings-repository";
import { InviteForm, MemberRow, RevokeInvitationButton, type TeamMember } from "@/features/team/team-manager";

export const metadata: Metadata = { title: "Equipe" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!context.organization) redirect("/onboarding");
  const organization = context.organization;
  if (organization.role !== "owner" && organization.role !== "admin") redirect("/inicio?forbidden=1");
  const organizationId = organization.organizationId;
  const supabase = await createClient();
  const curricular = Boolean(context.entitlements?.modules.includes("analise_curricular"));
  const [{ data: memberships }, { data: invitations }, curricularUsers, settings] = await Promise.all([
    supabase.from("memberships").select("user_id, role").eq("organization_id", organizationId).eq("active", true).order("created_at"),
    supabase.from("invitations").select("id, email, role, expires_at").eq("organization_id", organizationId).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    curricular ? prismaUnscoped.user.findMany({ where: { organizationId, role: { not: "STUDENT" } }, select: { authUserId: true, role: true, poloCode: true, phone: true } }) : Promise.resolve([]),
    curricular ? withTenant(organizationId, () => getSystemSettings()) : Promise.resolve(null),
  ]);
  const ids = (memberships ?? []).map((m) => m.user_id as string);
  const admin = createAdminClient();
  const [{ data: profiles }, authUsers] = await Promise.all([
    ids.length ? supabase.from("profiles").select("id, display_name").in("id", ids) : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    Promise.all(ids.map((id) => admin.auth.admin.getUserById(id).then((r) => r.data.user))),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  const emails = new Map(authUsers.filter(Boolean).map((u) => [u!.id, u!.email ?? ""]));
  const curricularByUser = new Map(curricularUsers.map((u) => [u.authUserId, u]));
  const members: TeamMember[] = (memberships ?? []).map((m) => ({
    userId: m.user_id,
    name: names.get(m.user_id) ?? emails.get(m.user_id) ?? "Pessoa",
    email: emails.get(m.user_id) ?? "",
    role: m.role,
    curricularRole: curricularByUser.get(m.user_id)?.role ?? null,
    poloCode: curricularByUser.get(m.user_id)?.poloCode ?? null,
    phone: curricularByUser.get(m.user_id)?.phone ?? null,
    self: m.user_id === context.authUserId,
  }));
  const limit = context.entitlements?.plan?.limits?.users;
  const isOwner = organization.role === "owner";

  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        title="Equipe"
        description={`Pessoas com acesso a ${organization.name}${limit ? ` · ${members.length} de ${limit} usuários do plano` : ""}.`}
      />
      <div className="grid gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Convidar pessoa</CardTitle>
            <CardDescription>
              {Object.entries(MEMBER_ROLE_DESCRIPTIONS).map(([role, text]) => `${MEMBER_ROLE_LABELS[role as keyof typeof MEMBER_ROLE_LABELS]}: ${text}`).join(" ")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm isOwner={isOwner} />
            {(invitations ?? []).length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">Convites pendentes</p>
                <ul className="divide-y rounded-md border text-sm">
                  {(invitations ?? []).map((invitation) => (
                    <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span>{invitation.email} · {MEMBER_ROLE_LABELS[invitation.role as keyof typeof MEMBER_ROLE_LABELS]}</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        vence em {formatDate(invitation.expires_at)}
                        <RevokeInvitationButton id={invitation.id} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Pessoas</CardTitle>
            {curricular && <CardDescription>Na análise curricular, cada pessoa tem também um perfil (tutor, analista…) e a unidade em que atende.</CardDescription>}
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {members.map((member) => (
                <MemberRow key={member.userId} member={member} isOwner={isOwner} curricular={curricular} polos={settings?.polos ?? []} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
