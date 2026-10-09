"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { AccountIcon, ChatIcon, TemperatureIcon } from "@/components/icons";
import { PersonAvatar } from "@/components/shared/person-avatar";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn, formatRelativeTime } from "@/lib/utils";
import { readableError, requireResult } from "@/features/attendance/errors";
import { LOST_REASONS, STAGES, TEMPERATURE, type Course, type Lead, type Stage } from "@/features/crm/labels";
import { LeadSheet } from "@/features/crm/lead-sheet";

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

const LEAD_SELECT = "*, contacts(name, phone, email)";

export function CrmBoard(props: BoardProps) {
  const { organizationId, userId, members, courses } = props;
  const supabase = useMemo(() => createClient(), []);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [temperature, setTemperature] = useState<string>("");
  const [courseFilter, setCourseFilter] = useState<string>("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [openId, setOpenId] = useState<string | null>(props.initialLeadId ?? null);
  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const courseName = useMemo(() => new Map(courses.map((c) => [c.id, c.name])), [courses]);

  const load = useCallback(async () => {
    const result = await supabase.from("leads").select(LEAD_SELECT).eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(1000);
    if (result.error) toast.error(readableError(result.error));
    else setLeads((result.data ?? []) as Lead[]);
    setLoading(false);
  }, [supabase, organizationId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const channel = supabase
      .channel(`crm:${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `organization_id=eq.${organizationId}` }, () => load())
      .subscribe();
    return () => {
      clearTimeout(first);
      supabase.removeChannel(channel);
    };
  }, [supabase, organizationId, load]);

  const visible = leads.filter((lead) => {
    if (onlyMine && lead.owner_id !== userId) return false;
    if (temperature && lead.temperature !== temperature) return false;
    if (courseFilter && lead.course_id !== courseFilter) return false;
    const text = `${lead.contacts?.name ?? ""} ${lead.contacts?.phone ?? ""} ${lead.course_id ? courseName.get(lead.course_id) : ""}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  });

  async function move(lead: Lead, stage: Stage) {
    if (lead.stage === stage) return;
    let lostReason: string | null = null;
    if (stage === "perdido") {
      lostReason = window.prompt(`Motivo da perda (${LOST_REASONS.join(", ")}):`, LOST_REASONS[0]);
      if (lostReason === null) return;
    }
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage, stage_changed_at: new Date().toISOString() } : l)));
    const result = await supabase.from("leads").update({ stage, ...(lostReason !== null ? { lost_reason: lostReason.slice(0, 300) } : {}) }).eq("organization_id", organizationId).eq("id", lead.id);
    if (result.error) {
      toast.error(readableError(result.error));
      load();
    }
  }

  const active = leads.filter((l) => !["matriculado", "perdido"].includes(l.stage));
  const won = leads.filter((l) => l.stage === "taxa_paga" || l.stage === "matriculado").length;
  const decided = won + leads.filter((l) => l.stage === "perdido").length;
  const kpis = [
    { label: "Leads ativos", value: active.length },
    { label: "Quentes", value: active.filter((l) => l.temperature === "quente").length },
    { label: "Propostas em aberto", value: leads.filter((l) => l.stage === "proposta").length },
    { label: "Taxas pagas", value: leads.filter((l) => l.stage === "taxa_paga").length },
    { label: "Conversão", value: decided ? `${Math.round((won / decided) * 100)}%` : "—" },
  ];
  const opened = leads.find((l) => l.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border bg-card px-4 py-3 shadow-sm">
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nome, telefone ou curso" className="pl-8" aria-label="Buscar lead" />
        </div>
        <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm" aria-label="Filtrar por curso">
          <option value="">Todos os cursos</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={temperature} onChange={(e) => setTemperature(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm" aria-label="Filtrar por temperatura">
          <option value="">Todas as temperaturas</option>
          {Object.entries(TEMPERATURE).map(([key, t]) => <option key={key} value={key}>{t.label}</option>)}
        </select>
        <Button variant={onlyMine ? "secondary" : "outline"} size="sm" onClick={() => setOnlyMine((v) => !v)} aria-pressed={onlyMine}>Meus leads</Button>
        <div className="flex-1" />
        <NewLeadDialog organizationId={organizationId} courses={courses} onCreated={(id) => { load(); setOpenId(id); }} />
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
        <div className="flex min-w-max gap-3">
          {STAGES.map((stage) => {
            const cards = visible.filter((l) => l.stage === stage.key);
            return (
              <section
                key={stage.key}
                aria-label={stage.label}
                onDragOver={(e) => { e.preventDefault(); setOver(stage.key); }}
                onDragLeave={() => setOver((current) => (current === stage.key ? null : current))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const lead = leads.find((l) => l.id === e.dataTransfer.getData("text/plain"));
                  if (lead) move(lead, stage.key);
                }}
                className={cn("flex w-72 shrink-0 flex-col rounded-2xl border bg-muted/40 transition-colors", over === stage.key && "border-brand-cyan bg-brand-cyan/5")}
              >
                <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: stage.color }} /> {stage.label}
                  </span>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{cards.length}</span>
                </header>
                <p className="px-3 pb-2 text-[11px] text-muted-foreground">{stage.hint}</p>
                <div className="flex min-h-40 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3" style={{ maxHeight: "62dvh" }}>
                  {loading && <div className="h-20 animate-pulse rounded-xl bg-background/70" />}
                  {cards.map((lead) => (
                    <div
                      key={lead.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenId(lead.id); } }}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", lead.id); setDragging(lead.id); }}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => setOpenId(lead.id)}
                      className={cn(
                        "group cursor-pointer rounded-xl border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-cyan",
                        dragging === lead.id && "opacity-50",
                      )}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <PersonAvatar name={lead.contacts?.name ?? "Lead"} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{lead.contacts?.name ?? "Lead"}</span>
                            <span className="block truncate text-xs text-muted-foreground">{lead.course_id ? courseName.get(lead.course_id) : "Curso não informado"}</span>
                          </span>
                        </span>
                        <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", TEMPERATURE[lead.temperature].className)}>
                          <TemperatureIcon level={lead.temperature} className="size-3.5" /> {TEMPERATURE[lead.temperature].label}
                        </span>
                      </span>
                      <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-1 rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-orange-500" style={{ width: `${lead.score}%` }} />
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          {lead.source === "whatsapp" ? <ChatIcon className="size-3.5 text-emerald-600" /> : <AccountIcon className="size-3.5" />}
                          {lead.owner_id ? (memberName.get(lead.owner_id) ?? "Equipe").split(" ")[0] : "Sem responsável"}
                        </span>
                        <span>{formatRelativeTime(lead.stage_changed_at)}</span>
                      </span>
                      <span className="sr-only">Mover para:</span>
                      <select
                        aria-label={`Mover ${lead.contacts?.name ?? "lead"} para outra etapa`}
                        value={lead.stage}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => move(lead, e.target.value as Stage)}
                        className="mt-2 h-7 w-full rounded-md border bg-background px-1 text-xs md:hidden"
                      >
                        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </div>
                  ))}
                  {!loading && cards.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">Arraste um lead para cá</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>

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

function NewLeadDialog({ organizationId, courses, onCreated }: { organizationId: string; courses: Course[]; onCreated: (id: string) => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    setBusy(true);
    try {
      const phone = String(form.get("phone") ?? "").replace(/\D/g, "") || null;
      const contact = requireResult(
        await supabase.from("contacts").insert({ organization_id: organizationId, name: String(form.get("name") ?? "").trim(), phone, email: String(form.get("email") ?? "").trim() || null }).select("id").single(),
      ) as { id: string };
      const lead = requireResult(
        await supabase.from("leads").insert({ organization_id: organizationId, contact_id: contact.id, source: "manual", course_id: form.get("course") || null }).select("id").single(),
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
            <select id="lead-course" name="course" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
              <option value="">Ainda não sabe</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.modality}</option>)}
            </select>
          </div>
          <Button type="submit" disabled={busy}>Criar lead</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
