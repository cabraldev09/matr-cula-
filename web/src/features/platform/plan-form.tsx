"use client";

import { FormSelect } from "@/components/shared/form-select";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { savePlanAction, syncPlanWithEfiAction } from "@/features/platform/actions";

export interface PlanFormValues {
  id?: string;
  code: string;
  name: string;
  description: string;
  priceCents: number;
  interval: "month" | "year";
  modules: string[];
  trialDays: number;
  isPublic: boolean;
  active: boolean;
  sortOrder: number;
  limits: Partial<Record<"users" | "channels" | "analyses" | "ai_credits", number>>;
}

const LIMIT_FIELDS = [
  { key: "users", label: "Usuários" },
  { key: "channels", label: "Canais" },
  { key: "analyses", label: "Análises/mês" },
  { key: "ai_credits", label: "Créditos de IA/mês" },
] as const;

export function PlanFormDialog({ plan, modules }: { plan?: PlanFormValues; modules: { code: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string[]>(plan?.modules ?? []);
  const [isPublic, setPublic] = useState(plan?.isPublic ?? true);
  const [active, setActive] = useState(plan?.active ?? true);

  function submit(form: FormData) {
    start(async () => {
      const result = await savePlanAction({
        id: plan?.id,
        code: form.get("code"),
        name: form.get("name"),
        description: form.get("description"),
        priceCents: Math.round(Number(String(form.get("price") ?? "0").replace(",", ".")) * 100),
        interval: form.get("interval"),
        modules: selected,
        trialDays: form.get("trialDays"),
        isPublic,
        active,
        sortOrder: form.get("sortOrder"),
        limits: Object.fromEntries(LIMIT_FIELDS.map(({ key }) => [key, form.get(`limit_${key}`)])),
      });
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {plan ? (
          <Button size="sm" variant="outline"><Pencil className="size-3.5" /> Editar</Button>
        ) : (
          <Button><Plus className="size-4" /> Novo plano</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{plan ? `Editar ${plan.name}` : "Novo plano"}</DialogTitle>
          <DialogDescription>Mudar preço, intervalo ou nome vale para novas contratações; assinaturas existentes seguem até trocarem de plano.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" required defaultValue={plan?.name} maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">Código</Label>
              <Input id="code" name="code" required defaultValue={plan?.code} pattern="[a-z0-9-]{2,40}" placeholder="ex.: completo" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" name="description" defaultValue={plan?.description} maxLength={300} rows={2} />
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="price">Preço (R$)</Label>
              <Input id="price" name="price" inputMode="decimal" required defaultValue={plan ? (plan.priceCents / 100).toFixed(2) : ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="interval">Cobrança</Label>
              <FormSelect id="interval" name="interval" defaultValue={plan?.interval ?? "month"} options={[["month", "Mensal"], ["year", "Anual"]]} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trialDays">Dias de teste</Label>
              <Input id="trialDays" name="trialDays" type="number" min={0} max={90} defaultValue={plan?.trialDays ?? 7} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sortOrder">Ordem</Label>
              <Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={plan?.sortOrder ?? 0} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Módulos incluídos</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {modules.map((module) => (
                <label key={module.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(module.code)}
                    onCheckedChange={(checked) => setSelected((prev) => (checked ? [...prev, module.code] : prev.filter((m) => m !== module.code)))}
                  />
                  {module.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Limites (vazio = ilimitado)</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              {LIMIT_FIELDS.map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`limit_${key}`} className="text-xs">{label}</Label>
                  <Input id={`limit_${key}`} name={`limit_${key}`} type="number" min={0} defaultValue={plan?.limits[key] ?? ""} />
                </div>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm"><Switch checked={isPublic} onCheckedChange={setPublic} /> Aparece na página de planos</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Disponível para contratação</label>
          </div>
          <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar plano</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SyncPlanButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await syncPlanWithEfiAction(planId);
          if (result.ok) {
            toast.success(result.message);
            router.refresh();
          } else toast.error(result.error);
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Criar na Efí
    </Button>
  );
}
