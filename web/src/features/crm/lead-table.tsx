"use client";

import { PersonAvatar } from "@/components/shared/person-avatar";
import { EmptyState } from "@/components/shared/empty-state";
import { FunnelIcon, TemperatureIcon } from "@/components/icons";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/domain/proposal/document";
import { daysInStage, staleness } from "@/features/crm/board-rules";
import { STAGES, TEMPERATURE, type Lead } from "@/features/crm/labels";
import { formatWhatsapp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/** Visão em lista do funil, para ordenar o olhar por responsável, etapa ou tempo parado. */
export function LeadTable({ leads, courseName, ownerName, now, onOpen }: {
  leads: Lead[];
  courseName: (id: string | null) => string | null;
  ownerName: (id: string | null) => string | null;
  now: Date;
  onOpen: (id: string) => void;
}) {
  if (leads.length === 0) {
    return <EmptyState icon={FunnelIcon} title="Nenhum lead com esses filtros" description="Limpe os filtros ou cadastre um lead novo." compact />;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
      <Table className="min-w-[860px]">
        <TableHeader>
          <TableRow>
            <TableHead>Lead</TableHead>
            <TableHead>Curso</TableHead>
            <TableHead>Etapa</TableHead>
            <TableHead>Temperatura</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Na etapa</TableHead>
            <TableHead className="text-right">Proposta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((lead) => {
            const stage = STAGES.find((s) => s.key === lead.stage)!;
            const temperature = TEMPERATURE[lead.temperature];
            const late = staleness(lead, now);
            const days = daysInStage(lead, now);
            return (
              <TableRow
                key={lead.id}
                tabIndex={0}
                onClick={() => onOpen(lead.id)}
                onKeyDown={(e) => { if (e.key === "Enter") onOpen(lead.id); }}
                className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <PersonAvatar name={lead.contacts?.name ?? "Lead"} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{lead.contacts?.name ?? "Lead"}</p>
                      <p className="truncate text-xs text-muted-foreground">{formatWhatsapp(lead.contacts?.phone) ?? "Sem telefone"}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="max-w-48 truncate">{courseName(lead.course_id) ?? <span className="text-muted-foreground">Não informado</span>}</TableCell>
                <TableCell><span className="inline-flex items-center gap-2 text-sm"><span className="size-2.5 rounded-full" style={{ backgroundColor: stage.color }} /> {stage.label}</span></TableCell>
                <TableCell>
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", temperature.className)}>
                    <TemperatureIcon level={lead.temperature} className="size-3.5" /> {temperature.label} · {lead.score}
                  </span>
                </TableCell>
                <TableCell>{ownerName(lead.owner_id) ?? <span className="text-muted-foreground">Sem responsável</span>}</TableCell>
                <TableCell className={cn("tabular-nums", late === "late" && "font-medium text-status-danger", late === "warning" && "font-medium text-status-warning")}>
                  {days === 0 ? "hoje" : `${days} d`}
                </TableCell>
                <TableCell className="text-right tabular-nums">{lead.proposals ? money(lead.proposals.first_monthly_cents / 100) : "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
