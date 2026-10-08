"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, GraduationCap, Loader2, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatDateTime } from "@/lib/utils";
import { readableError, requireResult } from "@/features/attendance/errors";
import { STAGES, TEMPERATURE, type Lead } from "@/features/crm/labels";

export interface Conversation {
  id: string;
  organization_id: string;
  contact_id: string;
  team_id: string | null;
  channel_id: string | null;
  assigned_to: string | null;
  status: "pending" | "open" | "closed";
  subject: string;
  updated_at: string;
  contacts: { name: string; phone: string | null } | null;
  teams: { name: string } | null;
  channels: { name: string; provider: string } | null;
}

interface Message {
  id: string;
  direction: "incoming" | "outgoing";
  body: string;
  status: string;
  error_code: string | null;
  sender_id: string | null;
  created_at: string;
}

interface Note {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
}

const MESSAGE_STATUS: Record<string, string> = {
  received: "Recebida",
  queued: "Na fila",
  processing: "Enviando",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  unknown: "Resultado incerto: confira antes de reenviar",
  simulated: "Envio simulado",
};

export function ConversationPanel({
  organizationId,
  userId,
  supervisor,
  members,
  conversation,
  onBack,
  onChanged,
}: {
  organizationId: string;
  userId: string;
  supervisor: boolean;
  members: Record<string, string>;
  conversation: Conversation;
  onBack: () => void;
  onChanged: (status?: Conversation["status"]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const mineOrSupervised = conversation.assigned_to === userId || supervisor;

  async function act(work: () => PromiseLike<{ error: { message: string } | null }>, success: string, next: Conversation["status"]) {
    setBusy(true);
    try {
      requireResult((await work()) as { data: unknown; error: { message: string } | null });
      toast.success(success);
      onChanged(next);
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b p-4">
        <Button size="icon" variant="ghost" className="lg:hidden" onClick={onBack} aria-label="Voltar para a lista"><ArrowLeft className="size-4" /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{conversation.contacts?.name ?? "Contato"}</h2>
          <p className="truncate text-sm text-muted-foreground">
            {[conversation.contacts?.phone, conversation.teams?.name, conversation.channels?.name].filter(Boolean).join(" · ") || "Atendimento interno"}
          </p>
        </div>
        <LeadBadge organizationId={organizationId} contactId={conversation.contact_id} />
        <Badge variant="secondary">
          {conversation.status === "pending" ? "Aguardando" : conversation.status === "open" ? `Com ${conversation.assigned_to === userId ? "você" : (members[conversation.assigned_to ?? ""] ?? "atendente")}` : "Encerrada"}
        </Badge>
        {conversation.status === "pending" && (
          <Button size="sm" disabled={busy} onClick={() => act(() => supabase.rpc("claim_conversation", { conversation: conversation.id }), "Conversa assumida.", "open")}>Assumir</Button>
        )}
        {conversation.status === "open" && mineOrSupervised && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => supabase.rpc("close_conversation", { conversation: conversation.id }), "Conversa encerrada.", "closed")}>Encerrar</Button>
        )}
      </header>
      <Tabs defaultValue={conversation.channel_id ? "mensagens" : "notas"} className="flex flex-1 flex-col p-4">
        <TabsList>
          {conversation.channel_id && <TabsTrigger value="mensagens">Mensagens</TabsTrigger>}
          <TabsTrigger value="notas">Notas internas</TabsTrigger>
          <TabsTrigger value="anexos">Anexos</TabsTrigger>
        </TabsList>
        {conversation.channel_id && (
          <TabsContent value="mensagens" className="flex-1">
            <Messages organizationId={organizationId} conversation={conversation} canReply={conversation.status === "open" && mineOrSupervised} />
          </TabsContent>
        )}
        <TabsContent value="notas" className="flex-1">
          <Notes organizationId={organizationId} conversationId={conversation.id} members={members} userId={userId} />
        </TabsContent>
        <TabsContent value="anexos" className="flex-1">
          <Attachments organizationId={organizationId} conversationId={conversation.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Etapa e temperatura do lead deste contato. Sem o módulo CRM a consulta volta vazia e nada aparece. */
function LeadBadge({ organizationId, contactId }: { organizationId: string; contactId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [lead, setLead] = useState<Pick<Lead, "id" | "stage" | "temperature" | "score"> | null>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      supabase
        .from("leads")
        .select("id, stage, temperature, score")
        .eq("organization_id", organizationId)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => { if (active) setLead(data as typeof lead); });
    const first = setTimeout(load, 0);
    const channel = supabase
      .channel(`lead-badge:${contactId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `contact_id=eq.${contactId}` }, () => load())
      .subscribe();
    return () => {
      active = false;
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [supabase, organizationId, contactId]);

  if (!lead) return null;
  const stage = STAGES.find((s) => s.key === lead.stage);
  return (
    <Link
      href={`/crm?lead=${lead.id}`}
      className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted"
      title="Ver no CRM"
    >
      <GraduationCap className="size-3.5 text-brand-cyan" />
      <span className="size-2 rounded-full" style={{ backgroundColor: stage?.color }} />
      {stage?.label ?? lead.stage}
      <span className={cn("rounded-full px-1.5 py-px text-[10px] ring-1", TEMPERATURE[lead.temperature].className)}>{TEMPERATURE[lead.temperature].label}</span>
      <span className="text-muted-foreground">Ver no CRM</span>
    </Link>
  );
}

function Messages({ organizationId, conversation, canReply }: { organizationId: string; conversation: Conversation; canReply: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [answers, setAnswers] = useState<{ id: string; shortcut: string; body: string }[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  // Mesmo texto reenviado usa a mesma chave: um clique repetido não duplica a mensagem.
  const pending = useRef<{ body: string; key: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("id, direction, body, status, error_code, sender_id, created_at")
      .eq("organization_id", organizationId)
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setMessages(((data ?? []) as Message[]).reverse());
  }, [supabase, organizationId, conversation.id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    supabase.from("quick_answers").select("id, shortcut, body").eq("organization_id", organizationId).order("shortcut").then(({ data }) => setAnswers(data ?? []));
    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, () => load())
      .subscribe();
    // Reconciliação periódica cobre notificações perdidas em reconexões.
    const timer = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, organizationId, conversation.id, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    if (!pending.current || pending.current.body !== text) pending.current = { body: text, key: crypto.randomUUID() };
    setBusy(true);
    try {
      requireResult(await supabase.rpc("queue_message", { conversation: conversation.id, message_body: text, idempotency_key: pending.current.key }));
      setBody("");
      pending.current = null;
      load();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  // "/atalho" no início do texto insere a resposta rápida correspondente.
  const shortcut = body.startsWith("/") ? answers.filter((a) => `/${a.shortcut}`.startsWith(body.trim())).slice(0, 5) : [];

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="max-h-[50dvh] min-h-48 flex-1 space-y-2 overflow-y-auto rounded-xl bg-muted/30 p-3" aria-live="polite">
        {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>}
        {messages.map((message) => (
          <article key={message.id} className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm", message.direction === "incoming" ? "bg-card" : "ml-auto bg-brand-cyan-50")}>
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatDateTime(message.created_at)}
              {message.direction === "outgoing" && ` · ${MESSAGE_STATUS[message.status] ?? message.status}${message.error_code ? ` (${message.error_code})` : ""}`}
            </p>
          </article>
        ))}
        <div ref={bottom} />
      </div>
      {canReply ? (
        <div className="relative space-y-2">
          {shortcut.length > 0 && (
            <ul className="absolute bottom-full mb-1 w-full overflow-hidden rounded-md border bg-popover text-sm shadow-md">
              {shortcut.map((answer) => (
                <li key={answer.id}>
                  <button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => setBody(answer.body)}>
                    <strong>/{answer.shortcut}</strong> <span className="text-muted-foreground">{answer.body.slice(0, 80)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={4096}
            rows={3}
            placeholder="Escreva a resposta (Enter envia, Shift+Enter quebra linha, / para respostas rápidas)"
          />
          <div className="flex justify-end">
            <Button disabled={busy || !body.trim()} onClick={send}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar</Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Assuma a conversa para responder.</p>
      )}
    </div>
  );
}

function Notes({ organizationId, conversationId, members, userId }: { organizationId: string; conversationId: string; members: Record<string, string>; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("internal_notes").select("id, author_id, body, created_at").eq("organization_id", organizationId).eq("conversation_id", conversationId).order("created_at").limit(200);
    setNotes(data ?? []);
  }, [supabase, organizationId, conversationId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const channel = supabase
      .channel(`notes:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "internal_notes", filter: `conversation_id=eq.${conversationId}` }, () => load())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, load]);

  async function add() {
    setBusy(true);
    try {
      requireResult(await supabase.from("internal_notes").insert({ organization_id: organizationId, conversation_id: conversationId, author_id: userId, body: body.trim() }));
      setBody("");
      load();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {notes.length === 0 && <li className="text-sm text-muted-foreground">Nenhuma nota. Notas são visíveis só para a equipe.</li>}
        {notes.map((note) => (
          <li key={note.id} className="rounded-lg border bg-amber-50/60 p-3 text-sm">
            <p className="whitespace-pre-wrap">{note.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">{note.author_id === userId ? "Você" : (members[note.author_id] ?? "Equipe")} · {formatDateTime(note.created_at)}</p>
          </li>
        ))}
      </ul>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={10000} placeholder="Nota interna (o cliente não vê)" />
      <Button size="sm" variant="outline" disabled={busy || !body.trim()} onClick={add}>{busy && <Loader2 className="size-4 animate-spin" />} Adicionar nota</Button>
    </div>
  );
}

function Attachments({ organizationId, conversationId }: { organizationId: string; conversationId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [files, setFiles] = useState<{ name: string; created_at: string | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const folder = `${organizationId}/${conversationId}`;

  const load = useCallback(async () => {
    const { data } = await supabase.storage.from("attachments").list(folder, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
    setFiles((data ?? []).filter((f) => f.id).map((f) => ({ name: f.name, created_at: f.created_at })));
  }, [supabase, folder]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function upload(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 20 MB.");
      return;
    }
    setBusy(true);
    try {
      const name = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      requireResult(await supabase.storage.from("attachments").upload(`${folder}/${name}`, file));
      toast.success("Anexo salvo.");
      load();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  async function download(name: string) {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(`${folder}/${name}`, 60);
    if (error || !data) toast.error(readableError(error));
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-3">
      <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted", busy && "pointer-events-none opacity-60")}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Anexar arquivo
        <input type="file" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
      </label>
      <ul className="divide-y rounded-md border text-sm">
        {files.length === 0 && <li className="p-3 text-muted-foreground">Nenhum anexo. Os arquivos são privados da equipe.</li>}
        {files.map((file) => (
          <li key={file.name} className="flex items-center justify-between gap-2 p-3">
            <span className="min-w-0 truncate">{file.name.replace(/^[0-9a-f-]{36}-/, "")}</span>
            <Button size="sm" variant="ghost" onClick={() => download(file.name)}><Download className="size-4" /> Baixar</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
