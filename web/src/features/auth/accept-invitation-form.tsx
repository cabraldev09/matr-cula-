"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvitationAction } from "@/features/auth/actions";

export function AcceptInvitationForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="name">Seu nome</Label>
        <Input id="name" name="name" required maxLength={120} defaultValue={defaultName} />
      </div>
      {state?.error && (
        <p role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" />} Aceitar convite
      </Button>
    </form>
  );
}
