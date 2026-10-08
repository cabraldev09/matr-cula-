import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { formatCurrencyBRL, formatDate } from "@/lib/utils";
import { MEMBER_ROLE_LABELS } from "@/lib/member-roles";
import type { MemberRole } from "@/lib/session";
import { AdminNav } from "@/features/platform/admin-nav";
import { AddonForm, RevokeAddonButton, SubscriptionForm } from "@/features/platform/organization-forms";
import { SUBSCRIPTION_LABELS } from "@/features/platform/labels";

export const metadata: Metadata = { title: "Empresa" };
export const dynamic = "force-dynamic";

export default async function PlatformOrganizationPage({ params }: PageProps<"/admin/empresas/[id]">) {
  await requirePlatformAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const admin = createAdminClient();
  const [{ data: organization }, { data: subscription }, { data: plans }, { data: modules }, { data: addons }, { data: members }, { data: invoices }, { data: profile }] = await Promise.all([
    admin.from("organizations").select("*").eq("id", id).maybeSingle(),
    admin.from("subscriptions").select("*, plans!subscriptions_plan_id_fkey(name, modules)").eq("organization_id", id).maybeSingle(),
    admin.from("plans").select("id, name").order("sort_order"),
    admin.from("modules").select("code, name").order("sort_order"),
    admin.from("organization_addons").select("*").eq("organization_id", id),
    admin.from("memberships").select("user_id, role, active, created_at").eq("organization_id", id).order("created_at"),
    admin.from("invoices").select("*").eq("organization_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("billing_profiles").select("*").eq("organization_id", id).maybeSingle(),
  ]);
  if (!organization) notFound();
  const profiles = members?.length
    ? (await admin.from("profiles").select("id, display_name").in("id", members.map((m) => m.user_id))).data ?? []
    : [];
  const names = new Map(profiles.map((p) => [p.id, p.display_name as string]));
  const moduleNames = new Map((modules ?? []).map((m) => [m.code, m.name as string]));

  return (
    <>
      <PageHeader eyebrow="Plataforma" title={organization.name} description={`Criada em ${formatDate(organization.created_at)} · portal do aluno em /p/${organization.slug}`} />
      <AdminNav active="/admin/empresas" />
      <div className="grid gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Assinatura</CardTitle>
            <CardDescription>
              {subscription
                ? `${subscription.plans?.name ?? "Plano"} · ${SUBSCRIPTION_LABELS[subscription.status] ?? subscription.status} até ${formatDate(subscription.current_period_end)} · pagamento ${subscription.payment_method ?? "—"}${subscription.efi_subscription_id ? ` · Efí #${subscription.efi_subscription_id}` : ""}`
                : "Sem assinatura. Defina um plano manualmente para liberar o acesso (cortesia ou venda fora da Efí)."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionForm
              organizationId={id}
              plans={(plans ?? []).map((p) => ({ id: p.id, name: p.name }))}
              current={subscription ? { planId: subscription.plan_id, status: subscription.status, periodEnd: String(subscription.current_period_end).slice(0, 10) } : null}
              suggestedEnd={new Date(new Date().getTime() + 30 * 86_400_000).toISOString().slice(0, 10)}
            />
            <p className="mt-3 text-xs text-muted-foreground">Ajustes manuais não geram cobrança na Efí. Para suspender por abuso ou inadimplência, use a situação “Suspensa”.</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Módulos avulsos</CardTitle>
            <CardDescription>Liberam um módulo além do plano (teste comercial, cortesia).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(addons ?? []).length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {(addons ?? []).map((addon) => (
                  <li key={addon.module} className="flex items-center gap-1 rounded-full border py-0.5 pl-3 pr-1 text-sm">
                    {moduleNames.get(addon.module) ?? addon.module}
                    {addon.expires_at && <span className="text-xs text-muted-foreground">até {formatDate(addon.expires_at)}</span>}
                    <RevokeAddonButton organizationId={id} module={addon.module} />
                  </li>
                ))}
              </ul>
            )}
            <AddonForm organizationId={id} modules={(modules ?? []).map((m) => ({ code: m.code, name: m.name }))} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Equipe</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {(members ?? []).map((member) => (
                  <li key={member.user_id} className="flex items-center justify-between gap-2 py-2">
                    <span>{names.get(member.user_id) ?? member.user_id.slice(0, 8)}</span>
                    <span className="flex items-center gap-2">
                      <Badge variant="secondary">{MEMBER_ROLE_LABELS[member.role as MemberRole]}</Badge>
                      {!member.active && <Badge variant="outline">Inativo</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Cobrança</CardTitle>
              <CardDescription>{profile ? `${profile.payer_name} · ${profile.email} · ${profile.phone}` : "Dados de cobrança não preenchidos."}</CardDescription>
            </CardHeader>
            <CardContent>
              {(invoices ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma fatura.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoices ?? []).map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell>{formatDate(invoice.due_at)}</TableCell>
                        <TableCell className="tabular-nums">{formatCurrencyBRL(invoice.amount_cents / 100)}</TableCell>
                        <TableCell>{invoice.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
