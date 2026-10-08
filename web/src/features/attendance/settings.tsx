"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readableError, requireResult } from "@/features/attendance/errors";

interface Team {
  id: string;
  name: string;
  color: string;
  greeting_message: string;
}

function useMutation() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(work: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, success: string) {
    setBusy(true);
    try {
      requireResult(await work());
      toast.success(success);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(readableError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { supabase, busy, run };
}

export function TeamsSettings({
  organizationId,
  teams,
  members,
  teamMembers,
}: {
  organizationId: string;
  teams: Team[];
  members: { id: string; name: string }[];
  teamMembers: { team_id: string; user_id: string }[];
}) {
  const { supabase, busy, run } = useMutation();
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Departamentos</CardTitle>
        <CardDescription>Atendentes veem só as conversas dos seus departamentos; supervisores e administradores veem todas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          action={async (form) => {
            await run(() => supabase.from("teams").insert({ organization_id: organizationId, name: String(form.get("name") ?? "").trim(), color: form.get("color") }), "Departamento criado.");
          }}
          className="flex flex-wrap gap-2"
        >
          <Input name="name" required minLength={2} maxLength={120} placeholder="Ex.: Secretaria" className="max-w-xs" aria-label="Nome do departamento" />
          <Input name="color" type="color" defaultValue="#3956ff" className="h-9 w-14 p-1" aria-label="Cor" />
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Adicionar</Button>
        </form>
        <ul className="divide-y rounded-md border">
          {teams.length === 0 && <li className="p-3 text-sm text-muted-foreground">Nenhum departamento.</li>}
          {teams.map((team) => (
            <li key={team.id} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium"><span className="size-3 rounded-full" style={{ backgroundColor: team.color }} /> {team.name}</span>
                <Button size="sm" variant="ghost" disabled={busy} aria-label={`Excluir ${team.name}`} onClick={() => window.confirm(`Excluir o departamento ${team.name}?`) && run(() => supabase.from("teams").delete().eq("organization_id", organizationId).eq("id", team.id), "Departamento excluído.")}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                {members.map((member) => {
                  const checked = teamMembers.some((tm) => tm.team_id === team.id && tm.user_id === member.id);
                  return (
                    <label key={member.id} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={checked}
                        disabled={busy}
                        onCheckedChange={(value) =>
                          run(
                            () =>
                              value
                                ? supabase.from("team_members").insert({ organization_id: organizationId, team_id: team.id, user_id: member.id })
                                : supabase.from("team_members").delete().eq("organization_id", organizationId).eq("team_id", team.id).eq("user_id", member.id),
                            value ? "Pessoa adicionada ao departamento." : "Pessoa removida do departamento.",
                          )
                        }
                      />
                      {member.name}
                    </label>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function QuickAnswersSettings({ organizationId, answers }: { organizationId: string; answers: { id: string; shortcut: string; body: string }[] }) {
  const { supabase, busy, run } = useMutation();
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Respostas rápidas</CardTitle>
        <CardDescription>Digite /atalho no campo de resposta para inserir o texto.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          action={async (form) => {
            await run(
              () => supabase.from("quick_answers").insert({ organization_id: organizationId, shortcut: String(form.get("shortcut") ?? "").replace(/^\//, "").trim(), body: String(form.get("body") ?? "").trim() }),
              "Resposta rápida criada.",
            );
          }}
          className="grid gap-2"
        >
          <Input name="shortcut" required maxLength={30} placeholder="atalho (ex.: boasvindas)" aria-label="Atalho" />
          <Textarea name="body" required maxLength={10000} rows={3} placeholder="Texto da resposta" aria-label="Texto" />
          <div><Button type="submit" disabled={busy}>Adicionar</Button></div>
        </form>
        <ul className="divide-y rounded-md border text-sm">
          {answers.length === 0 && <li className="p-3 text-muted-foreground">Nenhuma resposta rápida.</li>}
          {answers.map((answer) => (
            <li key={answer.id} className="flex items-start justify-between gap-2 p-3">
              <span className="min-w-0"><strong>/{answer.shortcut}</strong> <span className="block whitespace-pre-wrap text-muted-foreground">{answer.body}</span></span>
              <Button size="sm" variant="ghost" disabled={busy} aria-label={`Excluir /${answer.shortcut}`} onClick={() => run(() => supabase.from("quick_answers").delete().eq("organization_id", organizationId).eq("id", answer.id), "Resposta excluída.")}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function TagsSettings({ organizationId, tags }: { organizationId: string; tags: { id: string; name: string; color: string }[] }) {
  const { supabase, busy, run } = useMutation();
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Etiquetas</CardTitle>
        <CardDescription>Use nos contatos para segmentar (ex.: interessado, matriculado).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          action={async (form) => {
            await run(() => supabase.from("tags").insert({ organization_id: organizationId, name: String(form.get("name") ?? "").trim(), color: form.get("color") }), "Etiqueta criada.");
          }}
          className="flex flex-wrap gap-2"
        >
          <Input name="name" required minLength={2} maxLength={60} placeholder="Nome" className="max-w-xs" aria-label="Nome da etiqueta" />
          <Input name="color" type="color" defaultValue="#0693e3" className="h-9 w-14 p-1" aria-label="Cor" />
          <Button type="submit" disabled={busy}>Adicionar</Button>
        </form>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma etiqueta.</p>}
          {tags.map((tag) => (
            <span key={tag.id} className="flex items-center gap-1">
              <Badge style={{ backgroundColor: tag.color }}>{tag.name}</Badge>
              <Button size="icon" variant="ghost" className="size-6" disabled={busy} aria-label={`Excluir ${tag.name}`} onClick={() => run(() => supabase.from("tags").delete().eq("organization_id", organizationId).eq("id", tag.id), "Etiqueta excluída.")}>
                <Trash2 className="size-3" />
              </Button>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
