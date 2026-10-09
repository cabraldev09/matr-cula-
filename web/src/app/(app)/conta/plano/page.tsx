import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSessionContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrencyBRL, formatDate } from "@/lib/utils";
import { PlanPicker, type PlanOption } from "@/features/billing/plan-picker";
import { BillingProfileForm, CancelSubscriptionButton } from "@/features/billing/billing-profile-form";
import { loadPlanUsage } from "@/features/home/usage";
import { PlanUsage } from "@/features/home/work-panel";
import { INVOICE_LABELS } from "@/features/platform/labels";

export const metadata: Metadata = { title: "Plano e faturas" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  incomplete: "Aguardando o primeiro pagamento",
  trialing: "Período de teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Renovação cancelada",
  suspended: "Suspensa",
};

export default async function PlanPage({ searchParams }: PageProps<"/conta/plano">) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!context.organization) redirect("/onboarding");
  const organization = context.organization;
  if (organization.role !== "owner" && organization.role !== "admin") redirect("/inicio?forbidden=1");
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: plans }, { data: modules }, { data: profile }, { data: invoices }, { data: subscription }] = await Promise.all([
    supabase.from("plans").select("*").order("sort_order"),
    supabase.from("modules").select("code, name").order("sort_order"),
    supabase.from("billing_profiles").select("*").eq("organization_id", organization.organizationId).maybeSingle(),
    supabase.from("invoices").select("*").eq("organization_id", organization.organizationId).order("created_at", { ascending: false }).limit(24),
    supabase.from("subscriptions").select("*").eq("organization_id", organization.organizationId).maybeSingle(),
  ]);
  const entitlements = context.entitlements;
  const usage = await loadPlanUsage(organization.organizationId, entitlements, new Date());
  const moduleNames = Object.fromEntries((modules ?? []).map((m) => [m.code, m.name]));
  const options: PlanOption[] = (plans ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    priceCents: p.price_cents,
    interval: p.billing_interval,
    trialDays: p.trial_days,
    modules: p.modules,
    limits: p.limits,
  }));
  const address = (profile?.address ?? {}) as Record<string, string>;
  const highlight = typeof params.modulo === "string" ? params.modulo : null;

  return (
    <>
      <PageHeader eyebrow="Configurações" title="Plano e faturas" description="Escolha os módulos da sua empresa. Você pode trocar de plano ou cancelar quando quiser." />
      {params.novo === "1" && (
        <p className="mb-6 rounded-md bg-status-success-bg px-3 py-2 text-sm text-status-success">
          Empresa criada. Ela começa vazia e só sua: escolha um plano ou comece um teste grátis.
        </p>
      )}
      {subscription && (
        <Card className="mb-6 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{entitlements?.plan?.name ?? "Plano"}</span>
                <Badge variant="secondary">{STATUS_LABELS[subscription.status] ?? subscription.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {subscription.status === "trialing"
                  ? `Teste até ${formatDate(subscription.current_period_end)}.`
                  : subscription.status === "canceled"
                    ? `Acesso até ${formatDate(subscription.current_period_end)}.`
                    : subscription.status === "incomplete"
                      ? "Os módulos são liberados quando o pagamento for confirmado."
                      : `Período atual até ${formatDate(subscription.current_period_end)}.`}
                {subscription.pending_plan_id ? " Mudança de plano aguardando pagamento." : ""}
              </p>
            </div>
            {organization.role === "owner" && ["active", "trialing", "past_due"].includes(subscription.status) && subscription.efi_subscription_id && (
              <CancelSubscriptionButton />
            )}
          </CardContent>
        </Card>
      )}
      {usage.length > 0 && <div className="mb-6"><PlanUsage usage={usage} /></div>}
      <PlanPicker
        plans={options}
        moduleNames={moduleNames}
        currentPlanId={subscription && subscription.status !== "incomplete" ? subscription.plan_id : null}
        pendingPlanId={subscription?.status === "incomplete" ? subscription.plan_id : (subscription?.pending_plan_id ?? null)}
        canStartTrial={!subscription}
        isOwner={organization.role === "owner"}
        highlightModule={highlight}
        hasBillingProfile={Boolean(profile)}
        efiAccount={process.env.NEXT_PUBLIC_EFI_ACCOUNT_ID ?? null}
        efiSandbox={process.env.EFI_SANDBOX !== "false"}
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card id="dados-cobranca" className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Dados de cobrança</CardTitle>
            <CardDescription>Usados nos boletos, no Pix e no cartão.</CardDescription>
          </CardHeader>
          <CardContent>
            <BillingProfileForm
              initial={{
                payerName: profile?.payer_name,
                document: profile?.document,
                email: profile?.email ?? context.email,
                phone: profile?.phone,
                street: address.street,
                number: address.number,
                neighborhood: address.neighborhood,
                zipcode: address.zipcode,
                city: address.city,
                state: address.state,
              }}
            />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Faturas</CardTitle>
            <CardDescription>Cobranças geradas pela Efí.</CardDescription>
          </CardHeader>
          <CardContent>
            {(invoices ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma fatura ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vencimento</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices ?? []).map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>{formatDate(invoice.due_at)}</TableCell>
                      <TableCell className="tabular-nums">{formatCurrencyBRL(invoice.amount_cents / 100)}</TableCell>
                      <TableCell>{INVOICE_LABELS[invoice.status] ?? invoice.status}</TableCell>
                      <TableCell className="text-right">
                        {invoice.status === "pending" && invoice.payment_url && (
                          <a href={invoice.payment_url} target="_blank" rel="noreferrer" className="text-sm text-brand-cyan-700 underline">Pagar</a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
