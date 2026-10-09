"use client";

import { useDraggable } from "@dnd-kit/core";
import { Clock3 } from "lucide-react";
import { AccountIcon, ChatIcon, TemperatureIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { money } from "@/domain/proposal/document";
import { daysInStage, staleness } from "@/features/crm/board-rules";
import { TEMPERATURE, type Lead } from "@/features/crm/labels";
import { formatWhatsapp, whatsappUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

interface CardProps {
  lead: Lead;
  courseName: string | null;
  ownerName: string | null;
  now: Date;
}

/** Aparência do cartão. Usada na coluna e no cartão que acompanha o ponteiro durante o arrasto. */
export function LeadCardView({ lead, courseName, ownerName, now, className }: CardProps & { className?: string }) {
  const late = staleness(lead, now);
  const days = daysInStage(lead, now);
  const whatsapp = whatsappUrl(lead.contacts?.phone);
  const temperature = TEMPERATURE[lead.temperature];
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md",
        late === "late" && "border-status-danger/40",
        late === "warning" && "border-status-warning/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PersonAvatar name={lead.contacts?.name ?? "Lead"} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{lead.contacts?.name ?? "Lead"}</p>
            <p className="truncate text-xs text-muted-foreground">{courseName ?? "Curso não informado"}</p>
          </div>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", temperature.className)}>
          <TemperatureIcon level={lead.temperature} className="size-3.5" /> {temperature.label}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Pontuação ${lead.score} de 100`}>
        <div className="h-1 rounded-full bg-gradient-to-r from-brand-cyan-400 via-amber-400 to-orange-500" style={{ width: `${lead.score}%` }} />
      </div>
      {lead.proposals && (
        <p className="mt-2 text-xs text-muted-foreground">
          Proposta nº {lead.proposals.number} · <span className="font-medium text-foreground tabular-nums">{money(lead.proposals.first_monthly_cents / 100)}</span>/mês
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1">
          {lead.source === "whatsapp" ? <ChatIcon className="size-3.5 shrink-0 text-emerald-600" aria-label="Veio pelo WhatsApp" role="img" /> : <AccountIcon className="size-3.5 shrink-0" aria-label="Cadastro manual" role="img" />}
          <span className="truncate">{ownerName ? ownerName.split(" ")[0] : "Sem responsável"}</span>
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5",
            late === "late" && "bg-status-danger-bg font-medium text-status-danger",
            late === "warning" && "bg-status-warning-bg font-medium text-status-warning",
          )}
        >
          {late !== "ok" && <Clock3 className="size-3" aria-hidden="true" />}
          {days === 0 ? "hoje" : `${days} d na etapa`}
        </span>
      </div>
      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-emerald-700 hover:underline"
          aria-label={`Chamar ${lead.contacts?.name ?? "o lead"} no WhatsApp`}
        >
          <ChatIcon className="size-3.5" /> {formatWhatsapp(lead.contacts?.phone)}
        </a>
      )}
    </div>
  );
}

/** Cartão que pode ser arrastado com mouse, toque (segurar) ou teclado (espaço, setas, espaço). */
export function DraggableLeadCard({ onOpen, children, lead }: { lead: Lead; onOpen: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  const { onKeyDown: dndKeyDown, ...pointerListeners } = listeners ?? {};
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...pointerListeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          onOpen();
          return;
        }
        dndKeyDown?.(e);
      }}
      className={cn("cursor-grab touch-manipulation rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan active:cursor-grabbing", isDragging && "opacity-40")}
    >
      {children}
    </div>
  );
}
