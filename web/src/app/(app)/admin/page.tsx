import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { formatCurrencyBRL, formatDate } from "@/lib/utils";
import { AdminNav } from "@/features/platform/admin-nav";
import { isEfiConfigured } from "@/services/billing/efi";

export const metadata: Metadata = { title: "Plataforma" };
export const dynamic = "force-dynamic";

type SubscriptionRow = { organization_id: string; status: string; current_period_end: string; plans: { name: string; price_cents: number; billing_interval: string } | null; organizations: { name: string } | null };

export default async function PlatformOverviewPage() {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ count: organizations }, { count: newOrganizations }, { data: subscriptions }, { data: paid }] = await Promise.all([
    admin.from("organizations").select("id", { count: "exact", head: true }),
    admin.from("organizations").select("id", { count: "exact", head: true }).gte("created_at", monthAgo),
    admin.from("subscriptions").select("organization_id, status, current_period_end, plans!subscriptions_plan_id_fkey(name, price_cents, billing_interval), organizations(name)"),
    admin.from("invoices").select("amount_cents").eq("status", "paid").gte("paid_at", monthAgo),
  ]);
  const rows = (subscriptions ?? []) as unknown as SubscriptionRow[];
  const byStatus = (status: string) => rows.filter((row) => row.status === status);
  const mrr = rows
    .filter((row) => row.status === "active" || row.status === "past_due")
    .reduce((sum, row) => sum + (row.plans ? (row.plans.billing_interval === "year" ? row.plans.price_cents / 12 : row.plans.price_cents) : 0), 0);
  const received = (paid ?? []).reduce((sum, invoice) => sum + invoice.amount_cents, 0);
  const soon = Date.now() + 3 * 86_400_000;
  const attention = rows.filter((row) => row.status === "past_due" || (row.status === "trialing" && new Date(row.current_period_end).getTime() < soon));

  const stats = [
    { label: "Empresas", value: String(organizations ?? 0), hint: `${newOrganizations ?? 0} nos últimos 30 dias` },
    { label: "Assinaturas ativas", value: String(byStatus("active").length), hint: `${byStatus("trialing").length} em teste` },
    { label: "Receita recorrente (MRR)", value: formatCurrencyBRL(mrr / 100), hint: "planos anuais divididos por 12" },
    { label: "Recebido em 30 dias", value: formatCurrencyBRL(received / 100), hint: `${byStatus("past_due").length} com pagamento pendente` },
  ];

  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Painel do administrador" description="Empresas, planos e cobrança de toda a plataforma." />
      <AdminNav active="/admin" />
      {!isEfiConfigured() && (
        <p className="mb-6 rounded-md bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
          Cobrança Efí não configurada: as empresas só conseguem usar o teste grátis ou planos liberados manualmente. Veja docs/COBRANCA-EFI.md.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-sm">
            <CardContent className="space-y-1 p-5">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-semibold tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-6 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Precisam de atenção</CardTitle>
        </CardHeader>
        <CardContent>
          {attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma empresa com pagamento pendente ou teste terminando.</p>
          ) : (
            <ul className="divide-y text-sm">
              {attention.map((row) => (
                <li key={row.organization_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/empresas/${row.organization_id}`} className="font-medium hover:underline">{row.organizations?.name ?? row.organization_id}</Link>
                  <span className="text-muted-foreground">
                    {row.status === "past_due" ? "Pagamento pendente" : `Teste termina em ${formatDate(row.current_period_end)}`} · {row.plans?.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
