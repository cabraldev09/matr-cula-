"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/features/auth/actions";

export function LoginForm({ next, portalSlug }: { next?: string; portalSlug?: string }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  const [show, setShow] = useState(false);
  const portal = Boolean(portalSlug);

  return (
    <form action={action} className="space-y-4">
      {portalSlug && <input type="hidden" name="portal" value={portalSlug} />}
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-2">
        <Label htmlFor="login">{portal ? "E-mail ou RGM" : "E-mail"}</Label>
        <Input id="login" name="login" type={portal ? "text" : "email"} autoComplete="username" required placeholder={portal ? "Seu e-mail ou RGM" : "voce@empresa.com.br"} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <Input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" required className="pr-10" />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Entrar
      </Button>
      <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/esqueci-senha" className="text-muted-foreground underline hover:text-foreground">Esqueci minha senha</Link>
        {!portal && (
          <Link href={next ? `/cadastro?next=${encodeURIComponent(next)}` : "/cadastro"} className="font-medium text-brand-cyan-700 underline">
            Criar conta
          </Link>
        )}
      </p>
    </form>
  );
}
