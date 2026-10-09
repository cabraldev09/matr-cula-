"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileDown, Loader2, RotateCcw, Save, Send, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_PUNCTUALITY_NOTE, money, percent2, type ProposalDocument } from "@/domain/proposal/document";
import type { ProposalRules } from "@/domain/proposal/pricing";
import { firstMonthlyFromScholarship } from "@/domain/proposal/pricing";
import { createProposalAction, sendProposalWhatsappAction } from "@/features/crm/actions";
import { MODALITIES, type Course } from "@/features/crm/labels";
import { MoneyInput } from "@/features/crm/money-input";
import { impliedPct, payloadFromDraft, previewDocument, scholarshipOf, validateDraft, type ProposalDraft } from "@/features/crm/proposal-draft";
import { SelectField } from "@/features/crm/select-field";
import { ProjectionTable } from "@/features/proposals/projection-table";
import { cn } from "@/lib/utils";

interface Saved {
  id: string;
  token: string;
  number?: number;
}

export interface WorkspaceProps {
  leadId: string;
  initial: ProposalDraft;
  courses: Course[];
  baseRules: ProposalRules;
  institution: { name: string; document: string; logo: ProposalDocument["logo"]; logoUrl: string | null };
  canConfigure: boolean;
  latest: Saved | null;
}

export function ProposalWorkspace({ leadId, initial, courses, baseRules, institution, canConfigure, latest }: WorkspaceProps) {
  const [draft, setDraft] = useState<ProposalDraft>(initial);
  const [saved, setSaved] = useState<Saved | null>(latest);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "pdf" | "whatsapp" | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const doc = useMemo(() => previewDocument(draft, baseRules, institution), [draft, baseRules, institution]);
  const signature = JSON.stringify(draft);
  const upToDate = saved !== null && savedSignature === signature;
  const set = (patch: Partial<ProposalDraft>) => setDraft((prev) => ({ ...prev, ...patch }));
  const scholarship = scholarshipOf(draft.grossCents, draft.firstCents);

  function pickCourse(id: string) {
    const course = courses.find((c) => c.id === id);
    if (!course) return set({ courseId: "" });
    set({ courseId: id, courseName: course.name, modality: course.modality, semesters: course.semesters, grossCents: course.gross_monthly_cents, firstCents: course.default_first_monthly_cents, tierOverrides: {}, projectionTo: String(course.semesters) });
  }

  function field(name: keyof ProposalDraft, label: string, props: React.ComponentProps<typeof Input> = {}, className?: string) {
    const message = showErrors ? errors[name] : undefined;
    return (
      <div className={cn("space-y-1.5", className)}>
        <Label htmlFor={`f-${name}`}>{label}</Label>
        <Input id={`f-${name}`} value={String(draft[name] ?? "")} onChange={(e) => set({ [name]: e.target.value } as Partial<ProposalDraft>)} aria-invalid={Boolean(message)} aria-describedby={message ? `f-${name}-error` : undefined} {...props} />
        {message && <p id={`f-${name}-error`} className="text-xs text-status-danger">{message}</p>}
      </div>
    );
  }
  const moneyField = (name: "grossCents" | "firstCents" | "enrollmentFeeCents", label: string) => {
    const message = showErrors ? errors[name] : undefined;
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`f-${name}`}>{label}</Label>
        <MoneyInput id={`f-${name}`} value={draft[name]} onChange={(cents) => set({ [name]: cents } as Partial<ProposalDraft>)} />
        {message && <p className="text-xs text-status-danger">{message}</p>}
      </div>
    );
  };

  /** Salva uma nova proposta (nova versão numerada). Devolve o que foi salvo, ou null se algo impediu. */
  async function save(): Promise<Saved | null> {
    setShowErrors(true);
    const first = Object.values(errors)[0];
    if (first) {
      toast.error(first);
      return null;
    }
    const result = await createProposalAction(payloadFromDraft(draft, leadId, baseRules));
    if (!result.ok) {
      toast.error(result.error);
      return null;
    }
    const next = { id: result.data.id, token: result.data.token };
    setSaved(next);
    setSavedSignature(signature);
    toast.success(result.message);
    return next;
  }

  async function onSave() {
    setBusy("save");
    await save();
    setBusy(null);
  }

  async function onPdf() {
    // A janela abre já no clique (senão o navegador bloqueia) e recebe o endereço depois de salvar.
    const tab = window.open("", "_blank");
    setBusy("pdf");
    const target = upToDate && saved ? saved : await save();
    setBusy(null);
    if (!target) return tab?.close();
    if (tab) tab.location.href = `/api/propostas/${target.id}/pdf`;
  }

  async function onWhatsapp() {
    setBusy("whatsapp");
    const target = upToDate && saved ? saved : await save();
    if (target) {
      const result = await sendProposalWhatsappAction({ proposalId: target.id, paymentUrl: null, pixPayload: null });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    }
    setBusy(null);
  }

  const tiers = [
    { key: "untilDue" as const, label: `Até o dia ${draft.dueDay || "…"}`, hint: `Com desconto de pontualidade de ${draft.punctualityPct || 0}%.`, value: doc?.pricing.untilDue, pctField: "punctualityPct" as const },
    { key: "lateTier1" as const, label: `Dias ${(Number(draft.dueDay) || 0) + 1} a 25`, hint: `Perde desconto de pontualidade de ${doc?.rules.lateTier1Pct ?? draft.lateTier1Pct}%.`, value: doc?.pricing.lateTier1, pctField: "lateTier1Pct" as const },
    { key: "lateTier2" as const, label: "Após o vencimento", hint: `Perde desconto de pontualidade de ${doc?.rules.lateTier2Pct ?? draft.lateTier2Pct}%.`, value: doc?.pricing.lateTier2, pctField: "lateTier2Pct" as const },
  ];

  return (
    <div className="space-y-6 pb-28">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-4">
            {institution.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo com proporção livre
              <img src={institution.logoUrl} alt={institution.name} className="h-14 w-auto max-w-[220px] rounded-lg border border-dashed p-2 object-contain" />
            ) : (
              <span className="grid h-14 w-28 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">Sem logo</span>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Instituição da proposta</p>
              <p className="font-semibold">{institution.name}</p>
              {institution.document && <p className="text-sm text-muted-foreground">CNPJ {institution.document}</p>}
            </div>
          </div>
          {canConfigure && <Button asChild variant="outline" size="sm"><Link href="/crm/configuracoes"><Settings className="size-4" /> Configurar</Link></Button>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Aluno e curso</CardTitle>
            <CardDescription>O curso vem da tabela do polo. Dá para ajustar os valores só para este aluno.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {field("studentName", "Aluno", { maxLength: 160 })}
            <SelectField id="f-course" label="Curso da tabela" value={draft.courseId} onChange={pickCourse} options={courses.filter((c) => c.active).map((c) => [c.id, `${c.name} · ${c.modality}`] as const)} empty="Outro curso (digitar o nome)" />
            {field("courseName", "Nome do curso na proposta", { maxLength: 160 })}
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField id="f-modality" label="Modalidade" value={draft.modality} onChange={(v) => set({ modality: v })} options={[...new Set([...MODALITIES, ...(draft.modality ? [draft.modality] : [])])].map((m) => [m, m] as const)} empty={null} />
              <div className="space-y-1.5">
                <Label htmlFor="f-semesters">Semestres</Label>
                <Input id="f-semesters" type="number" min={1} max={20} value={draft.semesters} onChange={(e) => set({ semesters: Number(e.target.value) || 1 })} aria-invalid={showErrors && Boolean(errors.semesters)} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Valores do 1º semestre</CardTitle>
            <CardDescription>Bolsa aplicada: <strong className="text-foreground">{scholarship === null ? "—" : percent2(scholarship)}</strong> sobre a mensalidade bruta.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {moneyField("grossCents", "Mensalidade bruta atual")}
            {moneyField("firstCents", "Primeira mensalidade")}
            <div className="space-y-1.5">
              <Label htmlFor="f-bolsa">Ou informe a bolsa (%)</Label>
              <Input
                id="f-bolsa"
                inputMode="decimal"
                placeholder={scholarship === null ? "Ex.: 70" : String(scholarship).replace(".", ",")}
                onBlur={(e) => {
                  const pct = Number(e.target.value.replace(",", "."));
                  if (draft.grossCents > 0 && pct > 0 && pct < 100) set({ firstCents: firstMonthlyFromScholarship(draft.grossCents, pct), tierOverrides: {} });
                  e.target.value = "";
                }}
              />
            </div>
            {moneyField("enrollmentFeeCents", "Taxa de matrícula")}
            {field("firstPaymentDate", "Vencimento da 1ª mensalidade", { type: "date" })}
            {field("installments", "Parcelas deste semestre", { inputMode: "numeric" })}
            {field("dueDay", "Demais mensalidades: dia", { inputMode: "numeric" })}
            <div className="grid grid-cols-2 gap-4 sm:col-span-2">
              {field("startYear", "Ano inicial", { inputMode: "numeric", maxLength: 4 })}
              <SelectField id="f-semester" label="Semestre inicial" value={draft.startSemester} onChange={(v) => set({ startSemester: v === "2" ? "2" : "1" })} options={[["1", "1º semestre"], ["2", "2º semestre"]]} empty={null} />
            </div>
            {field("firstTermScholarshipPct", "Bolsa no 1º semestre (%)", { inputMode: "decimal" })}
            {field("nextScholarshipPct", "Bolsa do 2º semestre em diante (%)", { inputMode: "decimal" })}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">2ª mensalidade em diante (pontualidade já inclusa de {draft.punctualityPct || 0}%)</CardTitle>
          <CardDescription>Os valores saem das regras. Digite um valor para ajustar à mão, ou mude o percentual e o valor se recalcula.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {tiers.map((tier) => (
            <div key={tier.key} className="grid items-center gap-3 sm:grid-cols-[1fr_9rem_9rem_auto]">
              <div>
                <p className="font-medium">{tier.label}</p>
                <p className="text-xs text-muted-foreground">{tier.hint}</p>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`tier-${tier.key}`} className="text-xs text-muted-foreground">Valor</Label>
                <MoneyInput id={`tier-${tier.key}`} value={tier.value !== undefined ? Math.round(tier.value * 100) : 0} onChange={(cents) => set({ tierOverrides: cents > 0 ? { ...draft.tierOverrides, [tier.key]: cents } : Object.fromEntries(Object.entries(draft.tierOverrides).filter(([k]) => k !== tier.key)) })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`pct-${tier.key}`} className="text-xs text-muted-foreground">{tier.key === "untilDue" ? "Pontualidade (%)" : "Acréscimo (%)"}</Label>
                <Input
                  id={`pct-${tier.key}`}
                  inputMode="decimal"
                  value={tier.key !== "untilDue" && draft.tierOverrides[tier.key] !== undefined ? String(impliedPct(draft.tierOverrides[tier.key]!, draft.firstCents)).replace(".", ",") : draft[tier.pctField]}
                  onChange={(e) => set({ [tier.pctField]: e.target.value, tierOverrides: Object.fromEntries(Object.entries(draft.tierOverrides).filter(([k]) => k !== tier.key)) } as Partial<ProposalDraft>)}
                  aria-invalid={showErrors && Boolean(errors[tier.pctField])}
                />
              </div>
              {draft.tierOverrides[tier.key] !== undefined ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ tierOverrides: Object.fromEntries(Object.entries(draft.tierOverrides).filter(([k]) => k !== tier.key)) })} aria-label={`Voltar ao valor calculado: ${tier.label}`}><RotateCcw className="size-4" /> Calculado</Button>
              ) : <span className="hidden w-[5.5rem] sm:block" />}
            </div>
          ))}
          {field("punctualityNote", "Observação da proposta", { maxLength: 400, placeholder: DEFAULT_PUNCTUALITY_NOTE })}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Projeção por semestre</CardTitle>
          <CardDescription>Cenários com reajuste anual mínimo de {baseRules.annualMinPct}% e teto de {baseRules.annualMaxPct}%, conforme a regra do polo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border p-4">
            <label className="flex items-center gap-3 text-sm font-medium">
              <Checkbox checked={draft.projectionOn} onCheckedChange={(checked) => set({ projectionOn: checked === true })} aria-label="Definir período da projeção" /> Definir período da projeção
            </label>
            <p className="mt-1 text-xs text-muted-foreground">Desmarcado, mostra todos os semestres do curso. Marcado, mostra só do primeiro ao último semestre que o aluno cursará.</p>
            {draft.projectionOn && (
              <div className="mt-3 grid max-w-sm grid-cols-2 gap-4">
                {field("projectionFrom", "Primeiro semestre", { inputMode: "numeric" })}
                {field("projectionTo", "Último semestre", { inputMode: "numeric" })}
              </div>
            )}
          </div>
          {doc ? <ProjectionTable doc={doc} /> : <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Preencha curso, valores e início para ver a projeção.</p>}
          {field("projectionNote", "Texto da projeção")}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader><CardTitle className="text-base">Produto e mensagem final</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-2 text-left">Produto ou serviço</th><th className="px-4 py-2 text-right">Preço</th><th className="px-4 py-2 text-right">Desconto</th><th className="px-4 py-2 text-right">Sub-total</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3"><strong className="block">{draft.courseName || "—"}</strong><span className="text-xs text-muted-foreground">{draft.modality}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{doc ? money(doc.pricing.grossMonthly) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{doc ? percent2(doc.pricing.scholarshipPct) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{doc ? money(doc.pricing.firstMonthly) : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="flex justify-between rounded-xl bg-status-success-bg px-4 py-2 font-semibold text-status-success"><span>Valor total do pedido</span><span className="tabular-nums">{doc ? money(doc.pricing.firstMonthly) : "—"}</span></p>
          <div className="space-y-1.5">
            <Label htmlFor="f-finalMessage">Mensagem final</Label>
            <Textarea id="f-finalMessage" rows={2} maxLength={600} value={draft.finalMessage} onChange={(e) => set({ finalMessage: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 px-4 py-3 shadow-[0_-8px_24px_-16px_rgb(0_0_0/0.4)] backdrop-blur md:left-16 xl:left-64">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground" role="status">
            {saved ? (upToDate ? `Proposta salva${saved.number ? ` (nº ${saved.number})` : ""}. Nenhuma alteração pendente.` : "Há alterações que ainda não foram salvas.") : "Proposta ainda não salva."}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {saved ? (
              <Button asChild variant="secondary"><a href={`/proposta/${saved.token}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Ver proposta salva</a></Button>
            ) : (
              <Button variant="secondary" disabled><ExternalLink className="size-4" /> Ver proposta salva</Button>
            )}
            <Button asChild variant="ghost"><Link href={`/crm?lead=${leadId}`}>Cancelar</Link></Button>
            <Button onClick={onPdf} disabled={busy !== null} className="bg-brand-cyan text-white hover:bg-brand-cyan-700">{busy === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} Gerar PDF</Button>
            <Button variant="outline" onClick={onWhatsapp} disabled={busy !== null}>{busy === "whatsapp" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar no WhatsApp</Button>
            <Button onClick={onSave} disabled={busy !== null || upToDate}>{busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar proposta</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
