"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { grantAddonAction, revokeAddonAction, setSubscriptionAction } from "@/features/platform/actions";
import type { ActionResult } from "@/lib/action-result";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<ActionResult>) =>
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else toast.error(result.error);
    });
  return { pending, run };
}

const STATUSES = [
  ["active", "Ativa"],
  ["trialing", "Período de teste"],
  ["past_due", "Pagamento pendente"],
  ["canceled", "Cancelada (acesso até o fim do período)"],
  ["suspended", "Suspensa (sem acesso)"],
  ["incomplete", "Aguardando primeiro pagamento"],
] as const;

export function SubscriptionForm({
  organizationId,
  plans,
  current,
}: {
  organizationId: string;
  plans: { id: string; name: string }[];
  current: { planId: string; status: string; periodEnd: string } | null;
}) {
  const { pending, run } = useAction();
  const defaultEnd = current?.periodEnd ?? new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  return (
    <form
      action={(form) => run(() => setSubscriptionAction({ organizationId, planId: form.get("planId"), status: form.get("status"), periodEnd: form.get("periodEnd") }))}
      className="grid gap-3 sm:grid-cols-4 sm:items-end"
    >
      <div className="space-y-1.5 sm:col-span-1">
        <Label htmlFor="planId">Plano</Label>
        <select id="planId" name="planId" defaultValue={current?.planId ?? plans[0]?.id} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
          {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-1">
        <Label htmlFor="status">Situação</Label>
        <select id="status" name="status" defaultValue={current?.status ?? "active"} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="space-y-1.5 sm:col-span-1">
        <Label htmlFor="periodEnd">Válida até</Label>
        <Input id="periodEnd" name="periodEnd" type="date" defaultValue={defaultEnd} required />
      </div>
      <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
    </form>
  );
}

export function AddonForm({ organizationId, modules }: { organizationId: string; modules: { code: string; name: string }[] }) {
  const { pending, run } = useAction();
  return (
    <form
      action={(form) => run(() => grantAddonAction({ organizationId, module: form.get("module"), expiresAt: form.get("expiresAt"), note: form.get("note") }))}
      className="grid gap-3 sm:grid-cols-4 sm:items-end"
    >
      <div className="space-y-1.5">
        <Label htmlFor="module">Módulo</Label>
        <select id="module" name="module" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
          {modules.map((module) => <option key={module.code} value={module.code}>{module.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="expiresAt">Até (opcional)</Label>
        <Input id="expiresAt" name="expiresAt" type="date" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">Observação</Label>
        <Input id="note" name="note" maxLength={200} placeholder="ex.: cortesia" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Liberar</Button>
    </form>
  );
}

export function RevokeAddonButton({ organizationId, module }: { organizationId: string; module: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="icon" variant="ghost" disabled={pending} aria-label="Remover módulo avulso" onClick={() => run(() => revokeAddonAction({ organizationId, module }))}>
      <X className="size-4" />
    </Button>
  );
}
