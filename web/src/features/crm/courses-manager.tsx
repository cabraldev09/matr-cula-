"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, percent2 } from "@/domain/proposal/document";
import { readableError, requireResult } from "@/features/attendance/errors";
import { MODALITIES, type Course } from "@/features/crm/labels";

/** "1.014,70" ou "1014.70" → centavos. */
export function parseMoney(value: string): number {
  const text = value.trim().replace(/[R$\s]/g, "");
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : NaN;
}

export function CoursesManager({ organizationId, courses }: { organizationId: string; courses: Course[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove(course: Course) {
    if (!window.confirm(`Excluir ${course.name}? Leads com este curso ficam sem curso definido.`)) return;
    const result = await supabase.from("courses").delete().eq("organization_id", organizationId).eq("id", course.id);
    if (result.error) toast.error(readableError(result.error));
    else router.refresh();
  }

  async function toggle(course: Course) {
    const result = await supabase.from("courses").update({ active: !course.active, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", course.id);
    if (result.error) toast.error(readableError(result.error));
    else router.refresh();
  }

  async function importCsv(text: string) {
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.split(/;|\t/).map((cell) => cell.trim()))
      .filter((cells) => cells.length >= 5 && cells[0] && !/^nome$/i.test(cells[0]));
    const records = rows.map(([name, modality, semesters, gross, first]) => ({
      organization_id: organizationId,
      name: name!,
      modality: modality || "EAD - Graduação",
      semesters: Number(semesters),
      gross_monthly_cents: parseMoney(gross ?? ""),
      default_first_monthly_cents: parseMoney(first ?? ""),
      active: true,
      updated_at: new Date().toISOString(),
    }));
    const invalid = records.findIndex((r) => !Number.isInteger(r.semesters) || !(r.gross_monthly_cents > 0) || !(r.default_first_monthly_cents > 0) || r.default_first_monthly_cents > r.gross_monthly_cents);
    if (!records.length) return toast.error("Nenhuma linha válida. Use: nome;modalidade;semestres;mensalidade;primeira mensalidade.");
    if (invalid >= 0) return toast.error(`Linha ${invalid + 1} inválida: confira semestres e valores (primeira mensalidade não pode passar da bruta).`);
    // Sem upsert: o ON CONFLICT atualizaria organization_id, coluna que a equipe não pode alterar.
    const key = (name: string, modality: string) => `${name.toLowerCase()}|${modality.toLowerCase()}`;
    const existing = new Map(courses.map((c) => [key(c.name, c.modality), c.id]));
    const fresh = records.filter((r) => !existing.has(key(r.name, r.modality)));
    const updates = records.filter((r) => existing.has(key(r.name, r.modality)));
    setBusy(true);
    try {
      if (fresh.length) requireResult(await supabase.from("courses").insert(fresh));
      for (const record of updates) {
        const values = { name: record.name, modality: record.modality, semesters: record.semesters, gross_monthly_cents: record.gross_monthly_cents, default_first_monthly_cents: record.default_first_monthly_cents, active: true, updated_at: record.updated_at };
        requireResult(await supabase.from("courses").update(values).eq("organization_id", organizationId).eq("id", existing.get(key(values.name, values.modality))!));
      }
      toast.success(`${records.length} curso(s) importado(s).`);
      router.refresh();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <CourseDialog organizationId={organizationId} />
        <ImportDialog busy={busy} onImport={importCsv} />
      </div>
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Curso</TableHead>
                <TableHead>Semestres</TableHead>
                <TableHead>Mensalidade bruta</TableHead>
                <TableHead>Primeira mensalidade</TableHead>
                <TableHead>Bolsa</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {courses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell><span className="font-medium">{course.name}</span><span className="block text-xs text-muted-foreground">{course.modality}</span></TableCell>
                  <TableCell className="tabular-nums">{course.semesters}</TableCell>
                  <TableCell className="tabular-nums">{money(course.gross_monthly_cents / 100)}</TableCell>
                  <TableCell className="tabular-nums">{money(course.default_first_monthly_cents / 100)}</TableCell>
                  <TableCell><Badge variant="secondary">{percent2((1 - course.default_first_monthly_cents / course.gross_monthly_cents) * 100)}</Badge></TableCell>
                  <TableCell><Switch checked={course.active} onCheckedChange={() => toggle(course)} aria-label={`Ativar ${course.name}`} /></TableCell>
                  <TableCell className="text-right">
                    <CourseDialog organizationId={organizationId} course={course} />
                    <Button size="sm" variant="ghost" onClick={() => remove(course)} aria-label={`Excluir ${course.name}`}><Trash2 className="size-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {courses.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Cadastre os cursos para gerar propostas e reconhecer o curso nas mensagens dos leads.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function CourseDialog({ organizationId, course }: { organizationId: string; course?: Course }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(form: FormData) {
    const values = {
      name: String(form.get("name") ?? "").trim(),
      modality: String(form.get("modality") ?? ""),
      semesters: Number(form.get("semesters")),
      gross_monthly_cents: parseMoney(String(form.get("gross") ?? "")),
      default_first_monthly_cents: parseMoney(String(form.get("first") ?? "")),
      updated_at: new Date().toISOString(),
    };
    if (!(values.gross_monthly_cents > 0) || !(values.default_first_monthly_cents > 0)) {
      toast.error("Confira os valores.");
      return;
    }
    if (values.default_first_monthly_cents > values.gross_monthly_cents) {
      toast.error("A primeira mensalidade não pode ser maior que a bruta.");
      return;
    }
    setBusy(true);
    try {
      if (course) requireResult(await supabase.from("courses").update(values).eq("organization_id", organizationId).eq("id", course.id));
      else requireResult(await supabase.from("courses").insert({ ...values, organization_id: organizationId }));
      toast.success("Curso salvo.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(readableError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {course ? <Button size="sm" variant="ghost" aria-label={`Editar ${course.name}`}><Pencil className="size-4" /></Button> : <Button><Plus className="size-4" /> Novo curso</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{course ? "Editar curso" : "Novo curso"}</DialogTitle>
          <DialogDescription>A primeira mensalidade já com bolsa e pontualidade, como aparece na proposta.</DialogDescription>
        </DialogHeader>
        <form action={submit} className="grid gap-3">
          <div className="space-y-1.5"><Label htmlFor="c-name">Nome</Label><Input id="c-name" name="name" required minLength={2} maxLength={160} defaultValue={course?.name} placeholder="Ex.: Biomedicina" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-modality">Modalidade</Label>
              <Input id="c-modality" name="modality" list="modalities" required defaultValue={course?.modality ?? "EAD - Graduação"} />
              <datalist id="modalities">{MODALITIES.map((m) => <option key={m} value={m} />)}</datalist>
            </div>
            <div className="space-y-1.5"><Label htmlFor="c-sem">Semestres</Label><Input id="c-sem" name="semesters" type="number" min={1} max={20} required defaultValue={course?.semesters ?? 8} /></div>
            <div className="space-y-1.5"><Label htmlFor="c-gross">Mensalidade bruta (R$)</Label><Input id="c-gross" name="gross" inputMode="decimal" required defaultValue={course ? (course.gross_monthly_cents / 100).toFixed(2).replace(".", ",") : ""} /></div>
            <div className="space-y-1.5"><Label htmlFor="c-first">Primeira mensalidade (R$)</Label><Input id="c-first" name="first" inputMode="decimal" required defaultValue={course ? (course.default_first_monthly_cents / 100).toFixed(2).replace(".", ",") : ""} /></div>
          </div>
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ busy, onImport }: { busy: boolean; onImport: (text: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><FileUp className="size-4" /> Importar planilha</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar cursos</DialogTitle>
          <DialogDescription>Cole as linhas da planilha (ou escolha um arquivo CSV) no formato: nome;modalidade;semestres;mensalidade;primeira mensalidade. Cursos já cadastrados são atualizados.</DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".csv,.txt" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setText(await file.text()); }} />
        <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Biomedicina;Semipresencial - Graduação;8;1014,70;306,75\nNutrição;Semipresencial - Graduação;8;1073,80;284,93"} className="font-mono text-xs" />
        <Button disabled={busy || !text.trim()} onClick={async () => { await onImport(text); setOpen(false); setText(""); }}>
          {busy && <Loader2 className="size-4 animate-spin" />} Importar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
