import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { formatCurrencyBRL } from "@/lib/utils";
import { AdminNav } from "@/features/platform/admin-nav";
import { PlanFormDialog, SyncPlanButton } from "@/features/platform/plan-form";

export const metadata: Metadata = { title: "Planos" };
export const dynamic = "force-dynamic";

const LIMIT_LABELS: Record<string, string> = { users: "usuários", channels: "canais", analyses: "análises/mês", ai_credits: "créditos IA/mês" };

export default async function PlatformPlansPage() {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const [{ data: plans }, { data: modules }, { data: subscriptions }] = await Promise.all([
    admin.from("plans").select("*").order("sort_order"),
    admin.from("modules").select("code, name").order("sort_order"),
    admin.from("subscriptions").select("plan_id, status"),
  ]);
  const moduleList = (modules ?? []).map((m) => ({ code: m.code as string, name: m.name as string }));
  const moduleNames = new Map(moduleList.map((m) => [m.code, m.name]));
  const usage = new Map<string, number>();
  for (const subscription of subscriptions ?? []) {
    if (["active", "trialing", "past_due"].includes(subscription.status)) usage.set(subscription.plan_id, (usage.get(subscription.plan_id) ?? 0) + 1);
  }
  return (
    <>
      <PageHeader
        eyebrow="Plataforma"
        title="Planos"
        description="Defina o que cada plano libera e quanto custa. Os clientes veem os planos públicos e ativos em Plano e faturas."
        actions={<PlanFormDialog modules={moduleList} />}
      />
      <AdminNav active="/admin/planos" />
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                <TableHead>Plano</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Módulos</TableHead>
                <TableHead>Limites</TableHead>
                <TableHead>Empresas</TableHead>
                <TableHead>Efí</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(plans ?? []).map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <span className="font-medium">{plan.name}</span>
                    <span className="block text-xs text-muted-foreground">{plan.code}</span>
                    <span className="mt-1 flex gap-1">
                      {!plan.active && <Badge variant="outline">Inativo</Badge>}
                      {!plan.is_public && <Badge variant="outline">Oculto</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatCurrencyBRL(plan.price_cents / 100)}/{plan.billing_interval === "year" ? "ano" : "mês"}</TableCell>
                  <TableCell className="max-w-56 text-sm">{(plan.modules as string[]).map((m) => moduleNames.get(m) ?? m).join(", ")}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {Object.entries(plan.limits as Record<string, number>).map(([key, value]) => `${value} ${LIMIT_LABELS[key] ?? key}`).join(" · ") || "ilimitado"}
                  </TableCell>
                  <TableCell className="tabular-nums">{usage.get(plan.id) ?? 0}</TableCell>
                  <TableCell>{plan.efi_plan_id ? <span className="text-sm">#{plan.efi_plan_id}</span> : <SyncPlanButton planId={plan.id} />}</TableCell>
                  <TableCell className="text-right">
                    <PlanFormDialog
                      modules={moduleList}
                      plan={{
                        id: plan.id,
                        code: plan.code,
                        name: plan.name,
                        description: plan.description,
                        priceCents: plan.price_cents,
                        interval: plan.billing_interval,
                        modules: plan.modules,
                        trialDays: plan.trial_days,
                        isPublic: plan.is_public,
                        active: plan.active,
                        sortOrder: plan.sort_order,
                        limits: plan.limits,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
