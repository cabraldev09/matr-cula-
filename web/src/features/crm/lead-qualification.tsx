"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { readableError } from "@/features/attendance/errors";
import { EDUCATION_LEVELS, ENTRY_TYPES, MODALITIES, type Course, type Lead } from "@/features/crm/labels";
import type { Member } from "@/features/crm/lead-types";
import { SelectField } from "@/features/crm/select-field";

/**
 * Os campos são controlados e a ficha é recriada só quando o lead muda (key = id). Assim, salvar não zera o
 * formulário nem um evento de outra pessoa apaga o que está sendo digitado.
 */
export function Qualification({ lead, courses, members, organizationId, onSaved, defaultStartTerm }: { lead: Lead; courses: Course[]; members: Member[]; organizationId: string; onSaved: () => void; defaultStartTerm: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState({
    course_id: lead.course_id ?? "",
    modality: lead.modality ?? "",
    entry_type: lead.entry_type ?? "",
    education_level: lead.education_level ?? "",
    owner_id: lead.owner_id ?? "",
    start_term: lead.start_term ?? "",
    city: lead.city ?? "",
    best_time: lead.best_time ?? "",
    notes: lead.notes,
  });
  const [previous, setPrevious] = useState(Boolean(lead.has_previous_studies));
  const set = (key: keyof typeof values) => (value: string) => setValues((prev) => ({ ...prev, [key]: value }));
  const termInvalid = values.start_term !== "" && !/^\d{4}\.[12]$/.test(values.start_term);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (termInvalid) {
      toast.error("O semestre de início precisa ser como 2027.1.");
      return;
    }
    setBusy(true);
    const orNull = (text: string) => text.trim() || null;
    const result = await supabase
      .from("leads")
      .update({
        course_id: orNull(values.course_id),
        modality: orNull(values.modality),
        entry_type: orNull(values.entry_type),
        education_level: orNull(values.education_level),
        has_previous_studies: previous,
        city: orNull(values.city),
        start_term: orNull(values.start_term),
        best_time: orNull(values.best_time),
        owner_id: orNull(values.owner_id),
        notes: values.notes,
        ...(lead.stage === "novo" || lead.stage === "contato" ? { stage: values.course_id && values.entry_type ? "qualificado" : "contato" } : {}),
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

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="q-course" label="Curso de interesse" value={values.course_id} onChange={set("course_id")} options={courses.map((c) => [c.id, `${c.name} · ${c.modality}`] as const)} />
        <SelectField id="q-modality" label="Modalidade" value={values.modality} onChange={set("modality")} options={MODALITIES.map((m) => [m, m] as const)} />
        <SelectField id="q-entry" label="Forma de ingresso" value={values.entry_type} onChange={set("entry_type")} options={ENTRY_TYPES} />
        <SelectField id="q-level" label="Escolaridade" value={values.education_level} onChange={set("education_level")} options={EDUCATION_LEVELS} />
        <div className="space-y-1.5">
          <Label htmlFor="q-term">Quer começar em</Label>
          <Input id="q-term" value={values.start_term} onChange={(e) => set("start_term")(e.target.value)} placeholder={defaultStartTerm} aria-invalid={termInvalid} maxLength={6} />
          {termInvalid && <p className="text-xs text-status-danger">Use o formato 2027.1 (ano e semestre).</p>}
        </div>
        <div className="space-y-1.5"><Label htmlFor="q-city">Cidade</Label><Input id="q-city" maxLength={120} value={values.city} onChange={(e) => set("city")(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="q-time">Melhor horário</Label><Input id="q-time" maxLength={60} placeholder="Ex.: depois das 18h" value={values.best_time} onChange={(e) => set("best_time")(e.target.value)} /></div>
        <SelectField id="q-owner" label="Responsável" value={values.owner_id} onChange={set("owner_id")} options={members.map((m) => [m.id, m.name] as const)} empty="Sem responsável" />
      </div>
      <label className="flex items-center gap-3 rounded-lg border p-3 text-sm">
        <Switch checked={previous} onCheckedChange={setPrevious} />
        Já cursou faculdade (pode aproveitar disciplinas)
      </label>
      <div className="space-y-1.5"><Label htmlFor="q-notes">Anotações</Label><Textarea id="q-notes" rows={3} maxLength={5000} value={values.notes} onChange={(e) => set("notes")(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">A pontuação sobe com curso, modalidade, forma de ingresso, estudos anteriores, semestre de início, mensagens e proposta. A partir de 70 o lead fica quente.</p>
      <Button type="submit" disabled={busy || termInvalid}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar qualificação</Button>
    </form>
  );
}
