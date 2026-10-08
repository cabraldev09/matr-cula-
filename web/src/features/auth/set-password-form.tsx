"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPasswordAction } from "@/features/auth/actions";

export function SetPasswordForm({ next = "/inicio" }: { next?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  function submit(fd: FormData) {
    start(async () => {
      const res = await setPasswordAction({ password: fd.get("password"), confirm: fd.get("confirm") });
      if (res.ok) {
        setDone(true);
        toast.success(res.message);
        setTimeout(() => router.push(next), 800);
      } else toast.error(res.error);
    });
  }
  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-status-success-bg px-3 py-3 text-sm text-status-success">
        <CheckCircle2 className="size-4" /> Senha definida. Abrindo o sistema…
      </div>
    );
  }
  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">Nova senha</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">Mínimo de 10 caracteres. Use letras, números e símbolos.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar senha</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} Salvar senha
      </Button>
    </form>
  );
}
