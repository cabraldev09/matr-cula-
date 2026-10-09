"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatIcon, ContactsIcon, FunnelIcon, PixIcon, ProposalIcon, ReviewIcon, SentIcon, type IconComponent } from "@/components/icons";
import { money } from "@/domain/proposal/document";
import { readableError } from "@/features/attendance/errors";
import { EVENT_LABELS, STAGES, type Lead } from "@/features/crm/labels";
import type { Member } from "@/features/crm/lead-types";
import { useVisiblePolling } from "@/features/crm/use-visible-polling";
import { cn, formatDateTime } from "@/lib/utils";

const EVENT_ICONS: Record<string, { icon: IconComponent; tone: string }> = {
  created: { icon: ContactsIcon, tone: "bg-brand-navy-50 text-brand-navy" },
  stage: { icon: FunnelIcon, tone: "bg-brand-cyan-50 text-brand-cyan-700" },
  note: { icon: ChatIcon, tone: "bg-brand-gold-50 text-brand-gold-700" },
  qualified: { icon: ReviewIcon, tone: "bg-brand-cyan-50 text-brand-cyan-700" },
  proposal: { icon: ProposalIcon, tone: "bg-brand-navy-50 text-brand-navy" },
  charge: { icon: PixIcon, tone: "bg-status-warning-bg text-status-warning" },
  paid: { icon: SentIcon, tone: "bg-status-success-bg text-status-success" },
};

interface EventRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
}

const stageLabel = (key: unknown) => STAGES.find((s) => s.key === key)?.label ?? String(key ?? "");

export function describeEvent(event: Pick<EventRow, "kind" | "payload">): string {
  const p = event.payload ?? {};
  if (event.kind === "stage") return `${stageLabel(p.from)} → ${stageLabel(p.to)}${p.reason ? ` (${p.reason})` : ""}`;
  if (event.kind === "note") return String(p.text ?? "");
  if (event.kind === "proposal") return `Nº ${p.number} · ${p.course}`;
  if (event.kind === "charge" || event.kind === "paid") return `${p.method === "efi_link" ? "Link Efí" : "Pix"} · ${money(Number(p.amount_cents ?? 0) / 100)}`;
  if (event.kind === "created") return p.source === "whatsapp" ? "Entrou pelo WhatsApp" : "Cadastro manual";
  if (event.kind === "qualified") return "Dados de qualificação atualizados";
  return "";
}

/** Linha do tempo do lead. Eventos automáticos (proposta, pagamento) chegam sozinhos: a lista se atualiza enquanto a aba está aberta. */
export function Timeline({ lead, organizationId, userId, members }: { lead: Lead; organizationId: string; userId: string; members: Member[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [note, setNote] = useState("");
  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const load = useCallback(async () => {
    const { data } = await supabase.from("lead_events").select("id, kind, payload, actor_id, created_at").eq("organization_id", organizationId).eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(200);
    setEvents((data ?? []) as EventRow[]);
  }, [supabase, organizationId, lead.id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load, lead.updated_at]);
  useVisiblePolling(load, 10_000);

  async function add() {
    const result = await supabase.from("lead_events").insert({ organization_id: organizationId, lead_id: lead.id, kind: "note", payload: { text: note.trim() }, actor_id: userId });
    if (result.error) toast.error(readableError(result.error));
    else {
      setNote("");
      load();
    }
  }

  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) add(); }}>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Adicionar nota (ex.: ligar amanhã às 18h)" maxLength={1000} aria-label="Nova nota" />
        <Button type="submit" disabled={!note.trim()}>Anotar</Button>
      </form>
      <ol className="space-y-4">
        {events.map((event) => {
          const meta = EVENT_ICONS[event.kind] ?? EVENT_ICONS.note!;
          const Icon = meta.icon;
          return (
            <li key={event.id} className="flex gap-3">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", meta.tone)}><Icon className="size-4" /></span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{EVENT_LABELS[event.kind] ?? event.kind}</p>
                {describeEvent(event) && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{describeEvent(event)}</p>}
                <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}{event.actor_id ? ` · ${event.actor_id === userId ? "você" : (names.get(event.actor_id) ?? "equipe")}` : " · automático"}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
