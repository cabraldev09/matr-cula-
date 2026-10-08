"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { inviteMemberAction, removeMemberAction, revokeInvitationAction, setCurricularProfileAction, setMemberRoleAction } from "@/features/team/actions";
import type { ActionResult } from "@/lib/action-result";

const MEMBER_ROLES = [
  ["admin", "Administrador"],
  ["supervisor", "Supervisor"],
  ["agent", "Atendente"],
] as const;

const CURRICULAR_ROLES = [
  ["ADMIN", "Administrador"],
  ["ACADEMIC_COORDINATOR", "Coordenação acadêmica"],
  ["TUTOR", "Tutor"],
  ["ANALYST", "Analista"],
  ["VIEWER", "Visualizador"],
] as const;

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(action: () => Promise<ActionResult<T>>, after?: (data: T) => void) =>
    start(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        after?.(result.data);
        router.refresh();
      } else toast.error(result.error);
    });
  return { pending, run };
}

export function InviteForm({ isOwner }: { isOwner: boolean }) {
  const { pending, run } = useRun();
  const [link, setLink] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <form
        action={(form) => run(() => inviteMemberAction({ email: form.get("email"), role: form.get("role") }), (data) => setLink(data.link))}
        className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="invite-email">E-mail</Label>
          <Input id="invite-email" name="email" type="email" required placeholder="pessoa@empresa.com.br" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Papel</Label>
          <select id="invite-role" name="role" defaultValue="agent" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
            {MEMBER_ROLES.filter(([value]) => isOwner || value !== "admin").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <Button type="submit" disabled={pending}>{pending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Convidar</Button>
      </form>
      {link && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-3 text-sm">
          <span className="min-w-0 flex-1 break-all font-mono text-xs">{link}</span>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copiado."))}>
            <Copy className="size-3.5" /> Copiar link
          </Button>
        </div>
      )}
    </div>
  );
}

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "supervisor" | "agent";
  curricularRole: string | null;
  poloCode: string | null;
  phone: string | null;
  self: boolean;
}

export function MemberRow({ member, isOwner, curricular, polos }: { member: TeamMember; isOwner: boolean; curricular: boolean; polos: { code: string; name: string }[] }) {
  const { pending, run } = useRun();
  const editable = !member.self && member.role !== "owner" && (isOwner || member.role !== "admin");
  const manager = member.role === "owner" || member.role === "admin";
  return (
    <li className="grid gap-3 py-4 lg:grid-cols-[1fr_170px_auto] lg:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">{member.name} {member.self && <span className="text-xs text-muted-foreground">(você)</span>}</p>
        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
      </div>
      <div>
        {member.role === "owner" ? (
          <Badge>Proprietário</Badge>
        ) : (
          <select
            aria-label={`Papel de ${member.name}`}
            defaultValue={member.role}
            disabled={!editable || pending}
            onChange={(event) => run(() => setMemberRoleAction({ userId: member.userId, role: event.target.value }))}
            className="h-9 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-60"
          >
            {MEMBER_ROLES.filter(([value]) => isOwner || value !== "admin" || member.role === "admin").map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        )}
      </div>
      <div className="flex justify-end">
        {editable && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Remover ${member.name} da empresa? O acesso termina na hora.`)) run(() => removeMemberAction(member.userId));
            }}
          >
            <UserMinus className="size-4" /> Remover
          </Button>
        )}
      </div>
      {curricular && (
        <form
          action={(form) => run(() => setCurricularProfileAction({ userId: member.userId, role: form.get("curricularRole"), poloCode: form.get("poloCode"), phone: form.get("phone") }))}
          className="grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end lg:col-span-3"
        >
          <div className="space-y-1">
            <Label className="text-xs">Análise curricular</Label>
            <select name="curricularRole" defaultValue={manager ? "ADMIN" : (member.curricularRole ?? "ANALYST")} disabled={manager} className="h-8 w-full rounded-md border bg-transparent px-2 text-sm disabled:opacity-60">
              {CURRICULAR_ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unidade</Label>
            <select name="poloCode" defaultValue={member.poloCode ?? ""} className="h-8 w-full rounded-md border bg-transparent px-2 text-sm">
              <option value="">—</option>
              {polos.map((polo) => <option key={polo.code} value={polo.code}>{polo.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">WhatsApp (mostrado aos alunos)</Label>
            <Input name="phone" defaultValue={member.phone ?? ""} className="h-8" />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Salvar</Button>
        </form>
      )}
    </li>
  );
}

export function RevokeInvitationButton({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeInvitationAction(id))}>
      Revogar
    </Button>
  );
}
