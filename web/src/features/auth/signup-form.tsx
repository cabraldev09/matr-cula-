"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganizationAction, signUpAction } from "@/features/auth/actions";

export function SignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUpAction, undefined);
  // Quem chega por um convite só cria a conta; a empresa já existe.
  const invited = Boolean(next && next !== "/onboarding");
  if (state?.info) {
    return (
      <div className="flex items-start gap-2 rounded-md bg-status-success-bg px-3 py-3 text-sm text-status-success">
        <MailCheck className="mt-0.5 size-4 shrink-0" /> {state.info}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-2">
        <Label htmlFor="name">Seu nome</Label>
        <Input id="name" name="name" autoComplete="name" required maxLength={120} />
      </div>
      {invited ? (
        <input type="hidden" name="company" value="Convite" />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="company">Nome da empresa</Label>
          <Input id="company" name="company" autoComplete="organization" required maxLength={120} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres.</p>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} Criar conta
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Já tem conta? <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="underline">Entrar</Link>
      </p>
    </form>
  );
}

export function CreateOrganizationForm({ defaultName, defaultCompany }: { defaultName: string; defaultCompany?: string }) {
  const [state, action, pending] = useActionState(createOrganizationAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="company">Nome da empresa</Label>
        <Input id="company" name="company" required maxLength={120} defaultValue={defaultCompany} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Seu nome</Label>
        <Input id="name" name="name" required maxLength={120} defaultValue={defaultName} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} Criar empresa
      </Button>
    </form>
  );
}
