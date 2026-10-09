"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, ExternalLink, FileDown, FileSearch, Loader2, MessageCircle, QrCode, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatDateTime } from "@/lib/utils";
import { firstMonthlyFromScholarship, priceProposal } from "@/domain/proposal/pricing";
import { money, percent2 } from "@/domain/proposal/document";
import { readableError } from "@/features/attendance/errors";
import { confirmChargeAction, createEnrollmentChargeAction, createProposalAction, sendProposalWhatsappAction, type ChargeResult } from "@/features/crm/actions";
import { EDUCATION_LEVELS, ENTRY_TYPES, EVENT_LABELS, LOST_REASONS, MODALITIES, STAGES, TEMPERATURE, type Course, type Lead, type Stage } from "@/features/crm/labels";

interface Props {
  lead: Lead | null;
  onClose: () => void;
  onChanged: () => void;
  onMove: (lead: Lead, stage: Stage) => void;
  organizationId: string;
  userId: string;
  members: { id: string; name: string }[];
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
  return (
    <>
      <SheetHeader className="border-b bg-gradient-to-br from-brand-navy to-brand-navy-700 p-5 text-white">
        <SheetTitle className="flex flex-wrap items-center gap-2 text-xl text-white">
          {lead.contacts?.name ?? "Lead"}
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1", TEMPERATURE[lead.temperature].className)}>{TEMPERATURE[lead.temperature].label} · {lead.score}</span>
        </SheetTitle>
        <SheetDescription className="text-white/80">
          {[lead.contacts?.phone, lead.contacts?.email].filter(Boolean).join(" · ") || "Sem contato cadastrado"} · {lead.source === "whatsapp" ? "veio pelo WhatsApp" : "cadastro manual"}
        </SheetDescription>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Etapa do funil"
            value={lead.stage}
            onChange={(e) => onMove(lead, e.target.value as Stage)}
            className="h-8 rounded-md border border-white/30 bg-white/10 px-2 text-sm text-white [&>option]:text-slate-900"
          >
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <span className="flex items-center gap-1 text-xs text-white/80"><span className="size-2 rounded-full" style={{ backgroundColor: stage.color }} /> desde {formatDateTime(lead.stage_changed_at)}</span>
          <div className="flex-1" />
          <Button asChild size="sm" variant="secondary"><Link href="/atendimento"><MessageCircle className="size-4" /> Conversa</Link></Button>
          <Button asChild size="sm" variant="secondary"><Link href="/analyses/new"><FileSearch className="size-4" /> Analisar histórico</Link></Button>
        </div>
      </SheetHeader>
      <Tabs defaultValue={lead.stage === "novo" || lead.stage === "contato" ? "qualificacao" : "proposta"} className="p-5">
        <TabsList className="w-full">
          <TabsTrigger value="qualificacao">Qualificação</TabsTrigger>
          <TabsTrigger value="proposta">Proposta e taxa</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="qualificacao" className="pt-4">
          <Qualification key={lead.updated_at} lead={lead} courses={courses} members={members} organizationId={organizationId} onSaved={onChanged} defaultStartTerm={defaultStartTerm} />
        </TabsContent>
        <TabsContent value="proposta" className="pt-4">
          <ProposalPanel lead={lead} courses={courses} organizationId={organizationId} enrollmentFeeCents={enrollmentFeeCents} efiConfigured={efiConfigured} pixConfigured={pixConfigured} defaultStartTerm={defaultStartTerm} onChanged={onChanged} />
        </TabsContent>
        <TabsContent value="historico" className="pt-4">
          <Timeline lead={lead} organizationId={organizationId} userId={userId} members={members} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Qualification({ lead, courses, members, organizationId, onSaved, defaultStartTerm }: { lead: Lead; courses: Course[]; members: { id: string; name: string }[]; organizationId: string; onSaved: () => void; defaultStartTerm: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [previous, setPrevious] = useState(Boolean(lead.has_previous_studies));
  async function submit(form: FormData) {
    setBusy(true);
    const value = (name: string) => {
      const v = String(form.get(name) ?? "").trim();
      return v || null;
    };
    const result = await supabase
      .from("leads")
      .update({
        course_id: value("course_id"),
        modality: value("modality"),
        entry_type: value("entry_type"),
        education_level: value("education_level"),
        has_previous_studies: previous,
        city: value("city"),
        start_term: value("start_term"),
        best_time: value("best_time"),
        owner_id: value("owner_id"),
        notes: String(form.get("notes") ?? ""),
        ...(lead.stage === "novo" || lead.stage === "contato" ? { stage: value("course_id") && value("entry_type") ? "qualificado" : "contato" } : {}),
      })
      .eq("organization_id", organizationId)
      .eq("id", lead.id);
    setBusy(false);
    if (result.error) toast.error(readableError(result.error));
    else {
      toast.success("Qualificação salva.");
      onSaved();
    }
  }
  const select = (name: string, label: string, options: readonly (readonly [string, string])[], value: string | null, empty = "Não informado") => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <select id={name} name={name} defaultValue={value ?? ""} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
        <option value="">{empty}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
  return (
    <form action={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {select("course_id", "Curso de interesse", courses.map((c) => [c.id, `${c.name} · ${c.modality}`] as const), lead.course_id)}
        {select("modality", "Modalidade", MODALITIES.map((m) => [m, m] as const), lead.modality)}
        {select("entry_type", "Forma de ingresso", ENTRY_TYPES, lead.entry_type)}
        {select("education_level", "Escolaridade", EDUCATION_LEVELS, lead.education_level)}
        <div className="space-y-1.5"><Label htmlFor="start_term">Quer começar em</Label><Input id="start_term" name="start_term" placeholder={defaultStartTerm} pattern="\d{4}\.[12]" defaultValue={lead.start_term ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="city">Cidade</Label><Input id="city" name="city" maxLength={120} defaultValue={lead.city ?? ""} /></div>
        <div className="space-y-1.5"><Label htmlFor="best_time">Melhor horário</Label><Input id="best_time" name="best_time" maxLength={60} placeholder="Ex.: depois das 18h" defaultValue={lead.best_time ?? ""} /></div>
        {select("owner_id", "Responsável", members.map((m) => [m.id, m.name] as const), lead.owner_id, "Sem responsável")}
      </div>
      <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
        <Switch checked={previous} onCheckedChange={setPrevious} />
        Já cursou faculdade (pode aproveitar disciplinas)
      </label>
      <div className="space-y-1.5"><Label htmlFor="notes">Anotações</Label><Textarea id="notes" name="notes" rows={3} maxLength={5000} defaultValue={lead.notes} /></div>
      <p className="text-xs text-muted-foreground">A pontuação sobe com curso, modalidade, forma de ingresso, estudos anteriores, semestre de início, mensagens e proposta. A partir de 70 o lead fica quente.</p>
      <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar qualificação</Button>
    </form>
  );
}

interface ProposalRow {
  id: string;
  number: number;
  public_token: string;
  course_name: string;
  first_monthly_cents: number;
  created_at: string;
}

interface ChargeRow {
  id: string;
  method: "efi_link" | "pix_manual";
  status: "pending" | "paid" | "canceled";
  amount_cents: number;
  payment_url: string | null;
  pix_payload: string | null;
  created_at: string;
}

function ProposalPanel({ lead, courses, organizationId, enrollmentFeeCents, efiConfigured, pixConfigured, defaultStartTerm, onChanged }: { lead: Lead; courses: Course[]; organizationId: string; enrollmentFeeCents: number; efiConfigured: boolean; pixConfigured: boolean; defaultStartTerm: string; onChanged: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [pending, start] = useTransition();
  const initialCourse = courses.find((c) => c.id === lead.course_id) ?? null;
  const [courseId, setCourseId] = useState(initialCourse?.id ?? "");
  const [courseName, setCourseName] = useState(initialCourse?.name ?? "");
  const [modality, setModality] = useState(initialCourse?.modality ?? lead.modality ?? "");
  const [semesters, setSemesters] = useState(initialCourse?.semesters ?? 8);
  const [gross, setGross] = useState(initialCourse ? (initialCourse.gross_monthly_cents / 100).toFixed(2) : "");
  const [first, setFirst] = useState(initialCourse ? (initialCourse.default_first_monthly_cents / 100).toFixed(2) : "");
  const [startTerm, setStartTerm] = useState(lead.start_term ?? defaultStartTerm);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [lastCharge, setLastCharge] = useState<ChargeResult | null>(null);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase.from("proposals").select("id, number, public_token, course_name, first_monthly_cents, created_at").eq("organization_id", organizationId).eq("lead_id", lead.id).order("created_at", { ascending: false }),
      supabase.from("enrollment_charges").select("id, method, status, amount_cents, payment_url, pix_payload, created_at").eq("organization_id", organizationId).eq("lead_id", lead.id).order("created_at", { ascending: false }),
    ]);
    setProposals((p.data ?? []) as ProposalRow[]);
    setCharges((c.data ?? []) as ChargeRow[]);
  }, [supabase, organizationId, lead.id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  function pickCourse(id: string) {
    setCourseId(id);
    const course = courses.find((c) => c.id === id);
    if (!course) return;
    setCourseName(course.name);
    setModality(course.modality);
    setSemesters(course.semesters);
    setGross((course.gross_monthly_cents / 100).toFixed(2));
    setFirst((course.default_first_monthly_cents / 100).toFixed(2));
  }

  const grossCents = Number.isFinite(Number(gross.replace(",", "."))) ? Math.round(Number(gross.replace(",", ".")) * 100) : 0;
  const firstCents = Number.isFinite(Number(first.replace(",", "."))) ? Math.round(Number(first.replace(",", ".")) * 100) : 0;
  let preview: ReturnType<typeof priceProposal> | null = null;
  try {
    preview = grossCents > 0 && firstCents > 0 && /^\d{4}\.[12]$/.test(startTerm) ? priceProposal({ grossMonthlyCents: grossCents, firstMonthlyCents: firstCents, semesters, startTerm }) : null;
  } catch {
    preview = null;
  }

  function generate() {
    start(async () => {
      const result = await createProposalAction({ leadId: lead.id, studentName: lead.contacts?.name ?? "Aluno", courseName, modality, semesters, grossMonthlyCents: grossCents, firstMonthlyCents: firstCents, startTerm });
      if (result.ok) {
        toast.success(result.message);
        load();
        onChanged();
      } else toast.error(result.error);
    });
  }

  function charge(method: "efi_link" | "pix_manual") {
    start(async () => {
      const result = await createEnrollmentChargeAction({ leadId: lead.id, proposalId: proposals[0]?.id ?? null, method });
      if (result.ok) {
        toast.success(result.message);
        setLastCharge(result.data);
        load();
      } else toast.error(result.error);
    });
  }

  function send(proposalId: string) {
    start(async () => {
      const result = await sendProposalWhatsappAction({ proposalId, paymentUrl: lastCharge?.paymentUrl ?? null, pixPayload: lastCharge?.pixPayload ?? null });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  function confirm(id: string) {
    if (!window.confirm("Confirma que o valor da taxa já entrou na conta do polo?")) return;
    start(async () => {
      const result = await confirmChargeAction(id);
      if (result.ok) {
        toast.success(result.message);
        load();
        onChanged();
      } else toast.error(result.error);
    });
  }

  const copy = (text: string, message: string) => navigator.clipboard.writeText(text).then(() => toast.success(message));
  const latest = proposals[0];

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border p-4">
        <h3 className="font-semibold">Nova proposta de bolsa</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-course">Curso</Label>
            <select id="p-course" value={courseId} onChange={(e) => pickCourse(e.target.value)} className="h-9 w-full rounded-md border bg-transparent px-2 text-sm">
              <option value="">Escolha um curso da tabela</option>
              {courses.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.modality}</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="p-gross">Mensalidade bruta (R$)</Label><Input id="p-gross" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="p-first">Primeira mensalidade (R$)</Label><Input id="p-first" inputMode="decimal" value={first} onChange={(e) => setFirst(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label htmlFor="p-bolsa">Ou bolsa (%)</Label>
            <Input
              id="p-bolsa"
              inputMode="decimal"
              placeholder={preview ? percent2(preview.scholarshipPct) : "Ex.: 70"}
              onBlur={(e) => {
                const pct = Number(e.target.value.replace(",", "."));
                if (grossCents > 0 && pct > 0 && pct < 100) setFirst((firstMonthlyFromScholarship(grossCents, pct) / 100).toFixed(2));
                e.target.value = "";
              }}
            />
          </div>
          <div className="space-y-1.5"><Label htmlFor="p-term">Início</Label><Input id="p-term" value={startTerm} onChange={(e) => setStartTerm(e.target.value)} pattern="\d{4}\.[12]" /></div>
          <div className="space-y-1.5"><Label htmlFor="p-sem">Semestres</Label><Input id="p-sem" type="number" min={1} max={20} value={semesters} onChange={(e) => setSemesters(Number(e.target.value) || 1)} /></div>
          <div className="space-y-1.5"><Label htmlFor="p-name">Nome do curso na proposta</Label><Input id="p-name" value={courseName} onChange={(e) => setCourseName(e.target.value)} /></div>
        </div>
        {preview ? (
          <div className="grid grid-cols-3 gap-x-3 gap-y-2 rounded-xl bg-muted/40 p-3 text-sm">
            <span><span className="block text-xs text-muted-foreground">Bolsa</span><strong>{percent2(preview.scholarshipPct)}</strong></span>
            <span><span className="block text-xs text-muted-foreground">1ª mensalidade</span><strong>{money(preview.firstMonthly)}</strong></span>
            <span><span className="block text-xs text-muted-foreground">Após o dia 10</span><strong>{money(preview.lateTier1)}</strong></span>
            <span className="col-span-3 border-t pt-2"><span className="block text-xs text-muted-foreground">Último semestre (reajuste anual de 5% a 11%)</span><strong>{money(preview.projection.at(-1)!.monthlyMin)} a {money(preview.projection.at(-1)!.monthlyMax)}</strong></span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Escolha o curso ou preencha os valores para ver a prévia.</p>
        )}
        <Button onClick={generate} disabled={pending || !preview || courseName.trim().length < 2}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Gerar proposta
        </Button>
      </section>

      {proposals.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold">Propostas</h3>
          <ul className="divide-y rounded-2xl border">
            {proposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <strong>Nº {p.number}</strong> · {p.course_name} · {money(p.first_monthly_cents / 100)}
                  <span className="block text-xs text-muted-foreground">{formatDateTime(p.created_at)}</span>
                </span>
                <span className="flex flex-wrap gap-1">
                  <Button asChild size="sm" variant="ghost"><a href={`/proposta/${p.public_token}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir</a></Button>
                  <Button asChild size="sm" variant="ghost"><a href={`/api/propostas/${p.id}/pdf`} target="_blank" rel="noreferrer"><FileDown className="size-4" /> PDF</a></Button>
                  <Button size="sm" variant="ghost" onClick={() => copy(`${window.location.origin}/proposta/${p.public_token}`, "Link copiado.")}><Copy className="size-4" /> Link</Button>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => send(p.id)}><Send className="size-4" /> WhatsApp</Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-2xl border p-4">
        <h3 className="font-semibold">Taxa de matrícula · {money(enrollmentFeeCents / 100)}</h3>
        <p className="text-xs text-muted-foreground">O valor vai para a conta do polo. Pelo link Efí a confirmação é automática; pelo Pix, confirme quando o dinheiro entrar.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending || !efiConfigured} onClick={() => charge("efi_link")}><Wallet className="size-4" /> Gerar link de pagamento</Button>
          <Button variant="outline" disabled={pending || !pixConfigured} onClick={() => charge("pix_manual")}><QrCode className="size-4" /> Gerar Pix</Button>
        </div>
        {(!efiConfigured || !pixConfigured) && (
          <p className="text-xs text-muted-foreground">
            {!efiConfigured && "Link Efí indisponível: o proprietário conecta a conta em CRM → Proposta e pagamentos. "}
            {!pixConfigured && "Pix indisponível: cadastre a chave Pix do polo em CRM → Proposta e pagamentos."}
          </p>
        )}
        {lastCharge && (
          <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
            {lastCharge.paymentUrl && (
              <p className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-all">{lastCharge.paymentUrl}</span><Button size="sm" variant="outline" onClick={() => copy(lastCharge.paymentUrl!, "Link copiado.")}><Copy className="size-4" /> Copiar</Button></p>
            )}
            {lastCharge.pixPayload && (
              <p className="flex flex-wrap items-center gap-2"><span className="min-w-0 flex-1 break-all font-mono text-[11px]">{lastCharge.pixPayload}</span><Button size="sm" variant="outline" onClick={() => copy(lastCharge.pixPayload!, "Código Pix copiado.")}><Copy className="size-4" /> Copiar</Button></p>
            )}
            {latest && <Button size="sm" disabled={pending} onClick={() => send(latest.id)}><Send className="size-4" /> Enviar proposta e cobrança no WhatsApp</Button>}
          </div>
        )}
        {charges.length > 0 && (
          <ul className="divide-y rounded-xl border text-sm">
            {charges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  {c.method === "efi_link" ? "Link Efí" : "Pix"} · {money(c.amount_cents / 100)}
                  <span className="block text-xs text-muted-foreground">{formatDateTime(c.created_at)}</span>
                </span>
                {c.status === "paid" ? (
                  <Badge className="bg-emerald-600"><CheckCircle2 className="size-3" /> Pago</Badge>
                ) : c.status === "canceled" ? (
                  <Badge variant="outline">Cancelada</Badge>
                ) : c.method === "pix_manual" ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => confirm(c.id)}>Marcar como pago</Button>
                ) : (
                  <Badge variant="secondary">Aguardando pagamento</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-muted-foreground">Perdeu o lead? Use a etapa no topo e escolha um motivo: {LOST_REASONS.join(", ")}.</p>
    </div>
  );
}

function Timeline({ lead, organizationId, userId, members }: { lead: Lead; organizationId: string; userId: string; members: { id: string; name: string }[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<{ id: string; kind: string; payload: Record<string, unknown>; actor_id: string | null; created_at: string }[]>([]);
  const [note, setNote] = useState("");
  const names = new Map(members.map((m) => [m.id, m.name]));
  const stageLabel = (key: unknown) => STAGES.find((s) => s.key === key)?.label ?? String(key ?? "");

  const load = useCallback(async () => {
    const { data } = await supabase.from("lead_events").select("id, kind, payload, actor_id, created_at").eq("organization_id", organizationId).eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(200);
    setEvents(data ?? []);
  }, [supabase, organizationId, lead.id]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function add() {
    const result = await supabase.from("lead_events").insert({ organization_id: organizationId, lead_id: lead.id, kind: "note", payload: { text: note.trim() }, actor_id: userId });
    if (result.error) toast.error(readableError(result.error));
    else {
      setNote("");
      load();
    }
  }

  function describe(event: (typeof events)[number]): string {
    const p = event.payload ?? {};
    if (event.kind === "stage") return `${stageLabel(p.from)} → ${stageLabel(p.to)}${p.reason ? ` (${p.reason})` : ""}`;
    if (event.kind === "note") return String(p.text ?? "");
    if (event.kind === "proposal") return `Nº ${p.number} · ${p.course}`;
    if (event.kind === "charge" || event.kind === "paid") return `${p.method === "efi_link" ? "Link Efí" : "Pix"} · ${money(Number(p.amount_cents ?? 0) / 100)}`;
    if (event.kind === "created") return p.source === "whatsapp" ? "Entrou pelo WhatsApp" : "Cadastro manual";
    return "";
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Adicionar nota (ex.: ligar amanhã às 18h)" maxLength={1000} />
        <Button disabled={!note.trim()} onClick={add}>Anotar</Button>
      </div>
      <ol className="relative space-y-4 border-l pl-5">
        {events.map((event) => (
          <li key={event.id} className="relative">
            <span className="absolute -left-[26px] top-1 size-3 rounded-full border-2 border-background bg-brand-cyan" />
            <p className="text-sm font-medium">{EVENT_LABELS[event.kind] ?? event.kind}</p>
            <p className="text-sm text-muted-foreground">{describe(event)}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}{event.actor_id ? ` · ${event.actor_id === userId ? "você" : (names.get(event.actor_id) ?? "equipe")}` : " · automático"}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
