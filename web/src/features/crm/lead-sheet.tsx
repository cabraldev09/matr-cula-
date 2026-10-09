"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChatIcon, StepsIcon, TemperatureIcon, TranscriptIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STAGES, TEMPERATURE, type Course, type Lead, type Stage } from "@/features/crm/labels";
import { Qualification } from "@/features/crm/lead-qualification";
import { nextStep } from "@/features/crm/lead-summary";
import { Timeline } from "@/features/crm/lead-timeline";
import { ProposalTab } from "@/features/crm/lead-proposals";
import type { Member } from "@/features/crm/lead-types";
import { cn, formatDateTime } from "@/lib/utils";
import { formatWhatsapp } from "@/lib/whatsapp";

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onChanged: () => void;
  onMove: (lead: Lead, stage: Stage) => void;
  organizationId: string;
  userId: string;
  members: Member[];
  courses: Course[];
  enrollmentFeeCents: number;
  efiConfigured: boolean;
  pixConfigured: boolean;
  defaultStartTerm: string;
}

export function LeadSheet(props: Props) {
  const { lead, onClose } = props;
  return (
    <Sheet open={Boolean(lead)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {lead && <LeadDetail key={lead.id} {...props} lead={lead} />}
      </SheetContent>
    </Sheet>
  );
}

function LeadDetail({ lead, onChanged, onMove, organizationId, userId, members, courses, enrollmentFeeCents, efiConfigured, pixConfigured, defaultStartTerm }: Props & { lead: Lead }) {
  const stage = STAGES.find((s) => s.key === lead.stage)!;
  const [nowMs] = useState(() => Date.now());
  const step = useMemo(() => nextStep(lead, new Date(nowMs)), [lead, nowMs]);
  const temperature = TEMPERATURE[lead.temperature];
  const phone = formatWhatsapp(lead.contacts?.phone);
  return (
    <>
      <SheetHeader className="border-b bg-gradient-to-br from-brand-navy to-brand-navy-700 p-5 text-white">
        <SheetTitle className="flex flex-wrap items-center gap-2 text-xl text-white">
          {lead.contacts?.name ?? "Lead"}
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1", temperature.className)}>
            <TemperatureIcon level={lead.temperature} className="size-3.5" /> {temperature.label} · {lead.score}
          </span>
        </SheetTitle>
        <SheetDescription className="text-white/80">
          {[phone, lead.contacts?.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"} · {lead.source === "whatsapp" ? "veio pelo WhatsApp" : "cadastro manual"}
        </SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={lead.stage} onValueChange={(value) => onMove(lead, value as Stage)}>
            <SelectTrigger aria-label="Etapa do funil" size="sm" className="w-44 border-white/30 bg-white/10 text-white [&_svg]:text-white/80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} /> {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="flex items-center gap-1 text-xs text-white/80"><span className="size-2 rounded-full" style={{ backgroundColor: stage.color }} /> desde {formatDateTime(lead.stage_changed_at)}</span>
          <div className="flex-1" />
          <Button asChild size="sm" variant="secondary"><Link href={`/atendimento?contato=${lead.contact_id}`}><ChatIcon className="size-4" /> Conversa</Link></Button>
          <Button asChild size="sm" variant="secondary"><Link href="/analyses/new"><TranscriptIcon className="size-4" /> Analisar histórico</Link></Button>
        </div>
      </SheetHeader>

      <div className="flex items-start gap-3 border-b bg-brand-cyan-50 px-5 py-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-brand-navy shadow-sm"><StepsIcon className="size-4" /></span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-cyan-700">Próximo passo</p>
          <p className="text-sm font-semibold">{step.title}</p>
          <p className="text-sm text-muted-foreground">{step.hint}</p>
        </div>
      </div>

      <Tabs defaultValue={lead.stage === "novo" || lead.stage === "contato" ? "qualificacao" : "proposta"} className="p-5">
        <TabsList className="w-full">
          <TabsTrigger value="qualificacao">Qualificação</TabsTrigger>
          <TabsTrigger value="proposta">Proposta e taxa</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="qualificacao" className="pt-4">
          <Qualification lead={lead} courses={courses} members={members} organizationId={organizationId} onSaved={onChanged} defaultStartTerm={defaultStartTerm} />
        </TabsContent>
        <TabsContent value="proposta" className="pt-4">
          <ProposalTab lead={lead} courses={courses} organizationId={organizationId} enrollmentFeeCents={enrollmentFeeCents} efiConfigured={efiConfigured} pixConfigured={pixConfigured} defaultStartTerm={defaultStartTerm} onChanged={onChanged} />
        </TabsContent>
        <TabsContent value="historico" className="pt-4">
          <Timeline lead={lead} organizationId={organizationId} userId={userId} members={members} />
        </TabsContent>
      </Tabs>
    </>
  );
}
