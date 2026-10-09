"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, pointerWithin, rectIntersection, useDroppable, useSensor, useSensors,
  type Announcements, type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/domain/proposal/document";
import { cn } from "@/lib/utils";
import { readableError, requireResult } from "@/features/attendance/errors";
import {
  CLOSED_STAGES, CLOSED_WINDOW_DAYS, COLUMN_PAGE, EMPTY_FILTERS, conversionRate, filtersFromParams, matchesFilters, moveBlockedReason, openProposalCents, paramsWithFilters,
  type BoardFilters,
} from "@/features/crm/board-rules";
import { STAGES, type Course, type Lead, type Stage } from "@/features/crm/labels";
import { DraggableLeadCard, LeadCardView } from "@/features/crm/lead-card";
import { LeadSheet } from "@/features/crm/lead-sheet";
import { LeadTable } from "@/features/crm/lead-table";
import { LoseLeadDialog } from "@/features/crm/lose-lead-dialog";

export interface BoardProps {
  organizationId: string;
  userId: string;
  members: { id: string; name: string }[];
  courses: Course[];
  enrollmentFeeCents: number;
  efiConfigured: boolean;
  pixConfigured: boolean;
  defaultStartTerm: string;
  initialLeadId?: string | null;
}

const LEAD_SELECT = "*, contacts(name, phone, email), proposals!leads_proposal_fkey(number, first_monthly_cents)";
const OPEN_STAGES = STAGES.filter((s) => !CLOSED_STAGES.includes(s.key)).map((s) => s.key);

/** Colocar o lead de volta na lista sem recarregar o quadro inteiro. */
function mergeLead(leads: Lead[], row: Lead): Lead[] {
  const index = leads.findIndex((l) => l.id === row.id);
  if (index < 0) return [row, ...leads];
  const next = [...leads];
  next[index] = row;
  return next;
}

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length ? within : rectIntersection(args);
};

export function CrmBoard(props: BoardProps) {
  const { organizationId, userId, members, courses } = props;
  const supabase = useMemo(() => createClient(), []);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = filtersFromParams(new URLSearchParams(searchParams.toString()));
  const view = searchParams.get("vista") === "lista" ? "lista" : "quadro";

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [olderClosed, setOlderClosed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(props.initialLeadId ?? null);
  const [losing, setLosing] = useState<Lead | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const courseNames = useMemo(() => new Map(courses.map((c) => [c.id, c.name])), [courses]);
  const courseName = useCallback((id: string | null) => (id ? (courseNames.get(id) ?? null) : null), [courseNames]);
  const ownerName = useCallback((id: string | null) => (id ? (memberName.get(id) ?? "Equipe") : null), [memberName]);

  function replaceUrl(update: (params: URLSearchParams) => URLSearchParams) {
    const next = update(new URLSearchParams(window.location.search)).toString();
    window.history.replaceState(null, "", next ? `${pathname}?${next}` : pathname);
  }
  const setFilters = (patch: Partial<BoardFilters>) => replaceUrl((p) => paramsWithFilters(p, patch));
  const setView = (next: "quadro" | "lista") =>
    replaceUrl((p) => {
      if (next === "lista") p.set("vista", "lista");
      else p.delete("vista");
      return p;
    });

  const load = useCallback(async () => {
    const since = new Date(Date.now() - CLOSED_WINDOW_DAYS * 86_400_000).toISOString();
    let closedQuery = supabase.from("leads").select(LEAD_SELECT).eq("organization_id", organizationId).in("stage", [...CLOSED_STAGES]).order("stage_changed_at", { ascending: false }).limit(olderClosed ? 500 : 200);
    if (!olderClosed) closedQuery = closedQuery.gte("stage_changed_at", since);
    const [active, closed] = await Promise.all([
      supabase.from("leads").select(LEAD_SELECT).eq("organization_id", organizationId).in("stage", OPEN_STAGES).order("updated_at", { ascending: false }).limit(1000),
      closedQuery,
    ]);
    const error = active.error ?? closed.error;
    if (error) toast.error(readableError(error));
    else setLeads([...((active.data ?? []) as unknown as Lead[]), ...((closed.data ?? []) as unknown as Lead[])]);
    setLoading(false);
  }, [supabase, organizationId, olderClosed]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000);
    // Um evento atualiza só a linha afetada, não o quadro inteiro.
    const channel = supabase
      .channel(`crm:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `organization_id=eq.${organizationId}` }, async (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string }).id;
          if (id) setLeads((prev) => prev.filter((l) => l.id !== id));
          return;
        }
        const id = (payload.new as { id?: string }).id;
        if (!id) return;
        const { data } = await supabase.from("leads").select(LEAD_SELECT).eq("id", id).maybeSingle();
        if (data) setLeads((prev) => mergeLead(prev, data as unknown as Lead));
      })
      .subscribe();
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, organizationId]);

  const ctx = useMemo(() => ({ userId, courseName: (id: string | null) => courseName(id) ?? "" }), [userId, courseName]);
  const visible = useMemo(() => leads.filter((lead) => matchesFilters(lead, filters, ctx)), [leads, filters, ctx]);
  const opened = leads.find((l) => l.id === openId) ?? null;
  const draggedLead = leads.find((l) => l.id === dragging) ?? null;

  async function move(lead: Lead, stage: Stage, lostReason?: string) {
    if (lead.stage === stage) return;
    const blocked = moveBlockedReason(lead, stage);
    if (blocked) {
      toast.error(blocked);
      return;
    }
    if (stage === "perdido" && lostReason === undefined) {
      setLosing(lead);
      return;
    }
    const changed = new Date().toISOString();
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage, stage_changed_at: changed, lost_reason: stage === "perdido" ? (lostReason ?? null) : null } : l)));
    const result = await supabase
      .from("leads")
      .update({ stage, lost_reason: stage === "perdido" ? (lostReason ?? "").slice(0, 300) || null : null })
      .eq("organization_id", organizationId)
      .eq("id", lead.id);
    if (result.error) {
      toast.error(readableError(result.error));
      load();
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );
  const leadName = (id: unknown) => leads.find((l) => l.id === id)?.contacts?.name ?? "lead";
  const stageLabel = (id: unknown) => STAGES.find((s) => s.key === id)?.label ?? "etapa";
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Pegou ${leadName(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${leadName(active.id)} sobre a etapa ${stageLabel(over.id)}.` : `${leadName(active.id)} fora de qualquer etapa.`),
    onDragEnd: ({ active, over }) => (over ? `${leadName(active.id)} solto na etapa ${stageLabel(over.id)}.` : `${leadName(active.id)} voltou para onde estava.`),
    onDragCancel: ({ active }) => `Movimento de ${leadName(active.id)} cancelado.`,
  };

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const lead = leads.find((l) => l.id === event.active.id);
    const target = event.over?.id;
    if (lead && target && STAGES.some((s) => s.key === target)) move(lead, target as Stage);
  }

  const openLeads = leads.filter((l) => !CLOSED_STAGES.includes(l.stage));
  const proposalCents = openProposalCents(leads);
  const rate = conversionRate(leads);
  const kpis = [
    { label: "Leads ativos", value: String(openLeads.length), hint: undefined, patch: { ...EMPTY_FILTERS }, active: !filters.stage && !filters.temperature },
    { label: "Quentes", value: String(openLeads.filter((l) => l.temperature === "quente").length), hint: undefined, patch: { ...EMPTY_FILTERS, temperature: "quente" }, active: filters.temperature === "quente" },
    { label: "Propostas em aberto", value: String(leads.filter((l) => l.stage === "proposta").length), hint: proposalCents ? `${money(proposalCents / 100)}/mês` : undefined, patch: { ...EMPTY_FILTERS, stage: "proposta" }, active: filters.stage === "proposta" },
    { label: "Taxas pagas", value: String(leads.filter((l) => l.stage === "taxa_paga").length), hint: undefined, patch: { ...EMPTY_FILTERS, stage: "taxa_paga" }, active: filters.stage === "taxa_paga" },
    { label: "Conversão", value: rate === null ? "—" : `${rate}%`, hint: "taxa paga entre os que decidiram", patch: null, active: false },
  ];

  const columns = filters.stage ? STAGES.filter((s) => s.key === filters.stage) : STAGES;
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => {
          const body = (
            <>
              <span className="block text-xs text-muted-foreground">{kpi.label}</span>
              <span className="block text-2xl font-semibold tabular-nums">{kpi.value}</span>
              {kpi.hint && <span className="block truncate text-[11px] text-muted-foreground">{kpi.hint}</span>}
            </>
          );
          return kpi.patch ? (
            <button
              key={kpi.label}
              type="button"
              onClick={() => setFilters(kpi.patch!)}
              aria-pressed={kpi.active}
              className={cn("rounded-2xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-brand-cyan/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan", kpi.active && "border-brand-cyan ring-1 ring-brand-cyan/40")}
            >
              {body}
            </button>
          ) : (
            <div key={kpi.label} className="rounded-2xl border bg-card px-4 py-3 shadow-sm">{body}</div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={filters.query} onChange={(e) => setFilters({ query: e.target.value })} placeholder="Buscar nome, telefone ou curso" className="pl-8" aria-label="Buscar lead" />
        </div>
        <FilterSelect label="Filtrar por curso" value={filters.course} onChange={(v) => setFilters({ course: v })} allLabel="Todos os cursos" options={courses.map((c) => ({ value: c.id, label: c.name }))} />
        <FilterSelect label="Filtrar por temperatura" value={filters.temperature} onChange={(v) => setFilters({ temperature: v })} allLabel="Todas as temperaturas" options={[{ value: "quente", label: "Quente" }, { value: "morno", label: "Morno" }, { value: "frio", label: "Frio" }]} />
        <FilterSelect
          label="Filtrar por responsável"
          value={filters.owner}
          onChange={(v) => setFilters({ owner: v })}
          allLabel="Todos os responsáveis"
          options={[{ value: "me", label: "Meus leads" }, { value: "none", label: "Sem responsável" }, ...members.filter((m) => m.id !== userId).map((m) => ({ value: m.id, label: m.name }))]}
        />
        <FilterSelect label="Filtrar por origem" value={filters.source} onChange={(v) => setFilters({ source: v })} allLabel="Todas as origens" options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "manual", label: "Cadastro manual" }]} />
        {filtered && <Button variant="ghost" size="sm" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar filtros</Button>}
        <div className="flex-1" />
        <div role="group" aria-label="Forma de exibição" className="flex rounded-lg border bg-card p-0.5 text-sm">
          {(["quadro", "lista"] as const).map((option) => (
            <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)} className={cn("rounded-md px-3 py-1 capitalize transition-colors", view === option ? "bg-brand-navy text-white" : "text-muted-foreground hover:text-foreground")}>
              {option}
            </button>
          ))}
        </div>
        <NewLeadDialog organizationId={organizationId} courses={courses} onCreated={(id) => { load(); setOpenId(id); }} />
      </div>

      {view === "lista" ? (
        <LeadTable leads={[...visible].sort((a, b) => b.stage_changed_at.localeCompare(a.stage_changed_at))} courseName={courseName} ownerName={ownerName} now={now} onOpen={setOpenId} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          accessibility={{ announcements, screenReaderInstructions: { draggable: "Para mover o lead, aperte espaço, use as setas para escolher a etapa e aperte espaço de novo para soltar. Enter abre o lead." } }}
          onDragStart={(event: DragStartEvent) => setDragging(String(event.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
            <div className="flex min-w-max gap-3">
              {columns.map((stage) => {
                const cards = visible.filter((l) => l.stage === stage.key);
                const closed = CLOSED_STAGES.includes(stage.key);
                const shown = expanded[stage.key] ? cards : cards.slice(0, COLUMN_PAGE);
                const sum = stage.key === "proposta" ? openProposalCents(cards) : 0;
                return (
                  <Column key={stage.key} stage={stage}>
                    <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: stage.color }} /> {stage.label}
                      </span>
                      <span className="rounded-full bg-background px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{cards.length}</span>
                    </header>
                    <p className="px-3 pb-2 text-[11px] text-muted-foreground">
                      {closed ? (olderClosed ? "Todos os registros" : `Últimos ${CLOSED_WINDOW_DAYS} dias`) : sum ? `${money(sum / 100)}/mês em propostas` : stage.hint}
                    </p>
                    <div className="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3" style={{ maxHeight: "62dvh" }}>
                      {loading && <div className="h-24 animate-pulse rounded-xl bg-background/70" />}
                      {shown.map((lead) => (
                        <DraggableLeadCard key={lead.id} lead={lead} onOpen={() => setOpenId(lead.id)}>
                          <LeadCardView lead={lead} courseName={courseName(lead.course_id)} ownerName={ownerName(lead.owner_id)} now={now} />
                          <label className="sr-only" htmlFor={`move-${lead.id}`}>Mover {lead.contacts?.name ?? "lead"} para outra etapa</label>
                          <select
                            id={`move-${lead.id}`}
                            value={lead.stage}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            onChange={(e) => move(lead, e.target.value as Stage)}
                            className="mt-1 h-8 w-full rounded-md border bg-card px-1 text-xs md:hidden"
                          >
                            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                        </DraggableLeadCard>
                      ))}
                      {!loading && cards.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">{closed ? "Nada por aqui" : "Arraste um lead para cá"}</p>}
                      {cards.length > COLUMN_PAGE && !expanded[stage.key] && (
                        <Button variant="ghost" size="sm" onClick={() => setExpanded((prev) => ({ ...prev, [stage.key]: true }))}>Ver mais {cards.length - COLUMN_PAGE}</Button>
                      )}
                      {closed && (
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setOlderClosed((v) => !v)}>
                          {olderClosed ? `Mostrar só os últimos ${CLOSED_WINDOW_DAYS} dias` : "Carregar anteriores"}
                        </Button>
                      )}
                    </div>
                  </Column>
                );
              })}
            </div>
          </div>
          <DragOverlay>
            {draggedLead ? <LeadCardView lead={draggedLead} courseName={courseName(draggedLead.course_id)} ownerName={ownerName(draggedLead.owner_id)} now={now} className="w-72 rotate-1 shadow-xl ring-2 ring-brand-cyan/50" /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <LoseLeadDialog lead={losing} onCancel={() => setLosing(null)} onConfirm={(lead, reason) => { setLosing(null); move(lead, "perdido", reason); }} />

      <LeadSheet
        lead={opened}
        onClose={() => setOpenId(null)}
        onChanged={load}
        organizationId={organizationId}
        userId={userId}
        members={members}
        courses={courses}
        enrollmentFeeCents={props.enrollmentFeeCents}
        efiConfigured={props.efiConfigured}
        pixConfigured={props.pixConfigured}
        defaultStartTerm={props.defaultStartTerm}
        onMove={move}
      />
    </div>
  );
}

function Column({ stage, children }: { stage: (typeof STAGES)[number]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <section ref={setNodeRef} aria-label={stage.label} className={cn("flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/40 transition-colors", isOver && "border-brand-cyan bg-brand-cyan/5")}>
      {children}
    </section>
  );
}

function FilterSelect({ label, value, onChange, allLabel, options }: { label: string; value: string; onChange: (value: string) => void; allLabel: string; options: { value: string; label: string }[] }) {
  return (
    <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
      <SelectTrigger aria-label={label} className="h-9 w-auto min-w-36 max-w-56 bg-card"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function NewLeadDialog({ organizationId, courses, onCreated }: { organizationId: string; courses: Course[]; onCreated: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    try {
      const phone = String(form.get("phone") ?? "").replace(/\D/g, "") || null;
      const course = String(form.get("course") ?? "");
      const contact = requireResult(
        await supabase.from("contacts").insert({ organization_id: organizationId, name: String(form.get("name") ?? "").trim(), phone, email: String(form.get("email") ?? "").trim() || null }).select("id").single(),
      ) as { id: string };
      const lead = requireResult(
        await supabase.from("leads").insert({ organization_id: organizationId, contact_id: contact.id, source: "manual", course_id: course && course !== "none" ? course : null }).select("id").single(),
      ) as { id: string };
      toast.success("Lead criado.");
      setOpen(false);
      onCreated(lead.id);
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" /> Novo lead</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
          <DialogDescription>Leads do WhatsApp entram sozinhos. Use este cadastro para quem chegou por outro meio.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="lead-name">Nome</Label><Input id="lead-name" name="name" required minLength={2} maxLength={120} /></div>
          <div className="space-y-1.5"><Label htmlFor="lead-phone">WhatsApp (com DDI e DDD)</Label><Input id="lead-phone" name="phone" inputMode="tel" placeholder="5569999999999" /></div>
          <div className="space-y-1.5"><Label htmlFor="lead-email">E-mail</Label><Input id="lead-email" name="email" type="email" /></div>
          <div className="space-y-1.5">
            <Label htmlFor="lead-course">Curso de interesse</Label>
            <Select name="course" defaultValue="none">
              <SelectTrigger id="lead-course" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ainda não sabe</SelectItem>
                {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} · {c.modality}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy}>Criar lead</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
