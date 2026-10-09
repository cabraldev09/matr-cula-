"use client";

import { useState, useTransition } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { money, percent2 } from "@/domain/proposal/document";
import { firstMonthlyFromScholarship, priceProposal } from "@/domain/proposal/pricing";
import { createProposalAction } from "@/features/crm/actions";
import type { Course, Lead } from "@/features/crm/labels";
import { MoneyInput } from "@/features/crm/money-input";
import { SelectField } from "@/features/crm/select-field";

/** Formulário da nova proposta, com a prévia dos valores calculada no navegador pelo mesmo motor do PDF. */
export function ProposalForm({ lead, courses, defaultStartTerm, onCreated }: { lead: Lead; courses: Course[]; defaultStartTerm: string; onCreated: () => void }) {
  const [pending, start] = useTransition();
  const initial = courses.find((c) => c.id === lead.course_id) ?? null;
  const [courseId, setCourseId] = useState(initial?.id ?? "");
  const [courseName, setCourseName] = useState(initial?.name ?? "");
  const [modality, setModality] = useState(initial?.modality ?? lead.modality ?? "");
  const [semesters, setSemesters] = useState(initial?.semesters ?? 8);
  const [grossCents, setGrossCents] = useState(initial?.gross_monthly_cents ?? 0);
  const [firstCents, setFirstCents] = useState(initial?.default_first_monthly_cents ?? 0);
  const [startTerm, setStartTerm] = useState(lead.start_term ?? defaultStartTerm);

  function pickCourse(id: string) {
    setCourseId(id);
    const course = courses.find((c) => c.id === id);
    if (!course) return;
    setCourseName(course.name);
    setModality(course.modality);
    setSemesters(course.semesters);
    setGrossCents(course.gross_monthly_cents);
    setFirstCents(course.default_first_monthly_cents);
  }

  let preview: ReturnType<typeof priceProposal> | null = null;
  try {
    preview = grossCents > 0 && firstCents > 0 && firstCents <= grossCents && /^\d{4}\.[12]$/.test(startTerm) ? priceProposal({ grossMonthlyCents: grossCents, firstMonthlyCents: firstCents, semesters, startTerm }) : null;
  } catch {
    preview = null;
  }
  const overGross = firstCents > grossCents && grossCents > 0;

  function generate() {
    start(async () => {
      const result = await createProposalAction({ leadId: lead.id, studentName: lead.contacts?.name ?? "Aluno", courseName, modality, semesters, grossMonthlyCents: grossCents, firstMonthlyCents: firstCents, startTerm });
      if (result.ok) {
        toast.success(result.message);
        onCreated();
      } else toast.error(result.error);
    });
  }

  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <h3 className="font-semibold">Nova proposta de bolsa</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField id="p-course" label="Curso" value={courseId} onChange={pickCourse} options={courses.filter((c) => c.active).map((c) => [c.id, `${c.name} · ${c.modality}`] as const)} empty="Escolha um curso da tabela" className="sm:col-span-2" />
        <div className="space-y-1.5"><Label htmlFor="p-gross">Mensalidade bruta (R$)</Label><MoneyInput id="p-gross" value={grossCents} onChange={setGrossCents} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="p-first">Primeira mensalidade (R$)</Label>
          <MoneyInput id="p-first" value={firstCents} onChange={setFirstCents} />
          {overGross && <p className="text-xs text-status-danger">A primeira mensalidade não pode passar da bruta.</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-bolsa">Ou informe a bolsa (%)</Label>
          <Input
            id="p-bolsa"
            inputMode="decimal"
            placeholder={preview ? percent2(preview.scholarshipPct) : "Ex.: 70"}
            onBlur={(e) => {
              const pct = Number(e.target.value.replace(",", "."));
              if (grossCents > 0 && pct > 0 && pct < 100) setFirstCents(firstMonthlyFromScholarship(grossCents, pct));
              e.target.value = "";
            }}
          />
        </div>
        <div className="space-y-1.5"><Label htmlFor="p-term">Início</Label><Input id="p-term" value={startTerm} onChange={(e) => setStartTerm(e.target.value)} maxLength={6} placeholder="2027.1" /></div>
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
  );
}
