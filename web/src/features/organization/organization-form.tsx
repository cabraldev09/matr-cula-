"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/shared/brand-logo";
import { removeLogoAction, updateOrganizationAction, uploadLogoAction } from "@/features/organization/actions";
import { TIME_ZONES } from "@/features/organization/time-zones";
import type { ActionResult } from "@/lib/action-result";

function useRun() {
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

export function OrganizationForm({ initial }: { initial: { name: string; brandColor: string; timezone: string; emailDomain: string } }) {
  const { pending, run } = useRun();
  return (
    <form
      action={(form) =>
        run(() =>
          updateOrganizationAction({
            name: form.get("name"),
            brandColor: form.get("brandColor"),
            timezone: form.get("timezone"),
            emailDomain: form.get("emailDomain"),
          }),
        )
      }
      className="grid gap-4"
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome da empresa</Label>
        <Input id="name" name="name" required maxLength={120} defaultValue={initial.name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="brandColor">Cor da marca</Label>
          <div className="flex items-center gap-2">
            <Input id="brandColor" name="brandColor" type="color" defaultValue={initial.brandColor} className="h-9 w-14 p-1" />
            <span className="text-xs text-muted-foreground">Usada no portal do aluno.</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="timezone">Fuso horário</Label>
          <select id="timezone" name="timezone" defaultValue={initial.timezone} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
            {TIME_ZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="emailDomain">Domínio de e-mail da equipe (opcional)</Label>
        <Input id="emailDomain" name="emailDomain" placeholder="suaescola.com.br" defaultValue={initial.emailDomain} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
      </div>
    </form>
  );
}

export function LogoForm({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  const { pending, run } = useRun();
  return (
    <div className="grid gap-4">
      <div className="flex min-h-20 items-center rounded-xl border bg-muted/30 p-4">
        <BrandLogo src={logoUrl} alt={name} maxWidthClassName="max-w-[240px]" className="text-brand-navy" />
      </div>
      <form action={(form) => run(() => uploadLogoAction(form))} className="flex flex-wrap items-center gap-2">
        <Input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="max-w-xs" />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Enviar logo
        </Button>
        {logoUrl && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => removeLogoAction())}>
            <Trash2 className="size-4" /> Remover
          </Button>
        )}
      </form>
      <p className="text-xs text-muted-foreground">PNG, JPG ou WebP até 1 MB. Aparece no portal do aluno e nos relatórios da empresa.</p>
    </div>
  );
}
