"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox as InboxIcon, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn, formatRelativeTime } from "@/lib/utils";
import { readableError, requireResult } from "@/features/attendance/errors";
import { ConversationPanel, type Conversation } from "@/features/attendance/conversation-panel";

const STATUS_TABS = [
  ["pending", "Aguardando"],
  ["open", "Em atendimento"],
  ["closed", "Encerradas"],
] as const;

type Status = (typeof STATUS_TABS)[number][0];

export interface InboxProps {
  organizationId: string;
  userId: string;
  supervisor: boolean;
  members: Record<string, string>;
  teams: { id: string; name: string }[];
}

export function Inbox({ organizationId, userId, supervisor, members, teams }: InboxProps) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<Status>("pending");
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    let request = supabase
      .from("conversations")
      .select("*, contacts(name, phone), teams(name), channels(name, provider)")
      .eq("organization_id", organizationId)
      .eq("status", status)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (mine) request = request.eq("assigned_to", userId);
    try {
      setRows(requireResult(await request) as Conversation[]);
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [supabase, organizationId, status, mine, userId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const channel = supabase
      .channel(`inbox:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `organization_id=eq.${organizationId}` }, () => load())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [supabase, organizationId, load]);

  const visible = rows.filter((row) => {
    const text = `${row.contacts?.name ?? ""} ${row.contacts?.phone ?? ""} ${row.subject}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  });
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <div className="grid min-h-[70dvh] gap-4 lg:grid-cols-[360px_1fr]">
      <section className={cn("flex min-w-0 flex-col rounded-2xl border bg-card shadow-sm", selected && "hidden lg:flex")}>
        <div className="space-y-3 border-b p-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar contato ou assunto" className="pl-8" aria-label="Buscar conversa" />
            </div>
            <NewConversationDialog organizationId={organizationId} teams={teams} onCreated={(id) => { setStatus("pending"); setSelectedId(id); }} />
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map(([value, label]) => (
              <Button key={value} size="sm" variant={status === value ? "default" : "ghost"} onClick={() => setStatus(value)}>{label}</Button>
            ))}
            <Button size="sm" variant={mine ? "secondary" : "ghost"} onClick={() => setMine((v) => !v)} aria-pressed={mine}>Minhas</Button>
          </div>
        </div>
        <ul className="flex-1 divide-y overflow-y-auto" aria-label="Conversas">
          {loading ? (
            <li className="flex items-center justify-center p-8 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></li>
          ) : visible.length === 0 ? (
            <li className="flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <InboxIcon className="size-6" /> Nenhuma conversa aqui.
            </li>
          ) : (
            visible.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={cn("flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/50", row.id === selectedId && "bg-muted")}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{row.contacts?.name ?? "Contato"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(row.updated_at)}</span>
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{row.subject || "Sem assunto"}</span>
                  <span className="flex flex-wrap gap-1">
                    {row.teams?.name && <Badge variant="outline">{row.teams.name}</Badge>}
                    {row.channels?.name && <Badge variant="secondary">{row.channels.name}</Badge>}
                    {row.assigned_to && <Badge variant="outline">{row.assigned_to === userId ? "Você" : (members[row.assigned_to] ?? "Atendente")}</Badge>}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
      <section className={cn("min-w-0", !selected && "hidden lg:block")}>
        {selected ? (
          <ConversationPanel
            key={selected.id}
            organizationId={organizationId}
            userId={userId}
            supervisor={supervisor}
            members={members}
            conversation={selected}
            onBack={() => setSelectedId(null)}
            onChanged={(next) => {
              // A conversa acompanha a mudança de situação (assumir → Em atendimento, encerrar → Encerradas).
              if (next && next !== status) setStatus(next);
              else load();
            }}
          />
        ) : (
          <div className="flex h-full min-h-[50dvh] items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
            Selecione uma conversa.
          </div>
        )}
      </section>
    </div>
  );
}

function NewConversationDialog({ organizationId, teams, onCreated }: { organizationId: string; teams: { id: string; name: string }[]; onCreated: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(async () => {
      let request = supabase.from("contacts").select("id, name, phone").eq("organization_id", organizationId).order("name").limit(30);
      if (search.trim()) request = request.ilike("name", `%${search.trim().replace(/[%_]/g, "")}%`);
      const { data } = await request;
      setContacts(data ?? []);
    }, 200);
    return () => clearTimeout(timer);
  }, [supabase, organizationId, open, search]);

  async function submit(form: FormData) {
    setBusy(true);
    try {
      const created = requireResult(
        await supabase
          .from("conversations")
          .insert({ organization_id: organizationId, contact_id: form.get("contact"), team_id: form.get("team") || null, subject: String(form.get("subject") ?? "") })
          .select("id")
          .single(),
      ) as { id: string };
      toast.success("Atendimento criado.");
      setOpen(false);
      onCreated(created.id);
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" aria-label="Novo atendimento"><Plus className="size-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo atendimento</DialogTitle>
          <DialogDescription>Registra um atendimento interno para um contato (sem enviar mensagem por canal).</DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="contact-search">Contato</Label>
            <Input id="contact-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pelo nome" />
            <select name="contact" required className="h-9 w-full rounded-md border bg-transparent px-2 text-sm" aria-label="Contato">
              {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.phone ? ` · ${contact.phone}` : ""}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team">Departamento</Label>
            <select id="team" name="team" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
              <option value="">Sem departamento</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">Assunto</Label>
            <Input id="subject" name="subject" maxLength={200} />
          </div>
          <Button type="submit" disabled={busy || contacts.length === 0}>{busy && <Loader2 className="size-4 animate-spin" />} Criar</Button>
          {contacts.length === 0 && <p className="text-xs text-muted-foreground">Cadastre o contato em Atendimento → Contatos.</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}
