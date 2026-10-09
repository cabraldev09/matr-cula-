"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CoursesIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/empty-state";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money, percent2 } from "@/domain/proposal/document";
import { readableError, requireResult } from "@/features/attendance/errors";
import { courseKey, IMPORT_FORMAT, IMPORT_TEMPLATE, parseCourseImport, parseMoney } from "@/features/crm/course-import";
import { MODALITIES, type Course } from "@/features/crm/labels";

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function CoursesManager({ organizationId, courses }: { organizationId: string; courses: Course[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [modality, setModality] = useState("");
  const [removing, setRemoving] = useState<Course | null>(null);

  const modalities = useMemo(() => [...new Set(courses.map((c) => c.modality))].sort(), [courses]);
  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    return courses.filter((c) => (!modality || c.modality === modality) && (!needle || normalize(`${c.name} ${c.modality}`).includes(needle)));
  }, [courses, query, modality]);

  async function remove(course: Course) {
    setRemoving(null);
    const result = await supabase.from("courses").delete().eq("organization_id", organizationId).eq("id", course.id);
    if (result.error) toast.error(readableError(result.error));
    else {
      toast.success(`${course.name} excluído.`);
      router.refresh();
    }
  }

  async function toggle(course: Course) {
    const result = await supabase.from("courses").update({ active: !course.active, updated_at: new Date().toISOString() }).eq("organization_id", organizationId).eq("id", course.id);
    if (result.error) toast.error(readableError(result.error));
    else router.refresh();
  }

  /** Cria os novos de uma vez e atualiza os existentes em paralelo. Sem upsert: o ON CONFLICT mexeria em organization_id, que a equipe não pode alterar. */
  async function importRows(text: string): Promise<boolean> {
    const existing = new Map(courses.map((c) => [courseKey(c.name, c.modality), c.id]));
    const rows = parseCourseImport(text, new Set(existing.keys())).filter((r) => r.status !== "erro");
    if (rows.length === 0) return false;
    const now = new Date().toISOString();
    const values = (r: (typeof rows)[number]) => ({ name: r.name, modality: r.modality, semesters: r.semesters, gross_monthly_cents: r.grossCents, default_first_monthly_cents: r.firstCents, active: true, updated_at: now });
    setBusy(true);
    try {
      const fresh = rows.filter((r) => r.status === "novo").map((r) => ({ ...values(r), organization_id: organizationId }));
      if (fresh.length) requireResult(await supabase.from("courses").insert(fresh));
      const results = await Promise.all(
        rows.filter((r) => r.status === "atualiza").map((r) => supabase.from("courses").update(values(r)).eq("organization_id", organizationId).eq("id", existing.get(courseKey(r.name, r.modality))!)),
      );
      for (const result of results) requireResult(result);
      toast.success(`${fresh.length} curso(s) criado(s) e ${rows.length - fresh.length} atualizado(s).`);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(readableError(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CourseDialog organizationId={organizationId} />
        <ImportDialog busy={busy} existing={new Set(courses.map((c) => courseKey(c.name, c.modality)))} onImport={importRows} />
        <div className="relative ml-auto min-w-52 sm:max-w-xs sm:flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar curso" className="pl-8" aria-label="Buscar curso" />
        </div>
        {modalities.length > 1 && (
          <Select value={modality || "all"} onValueChange={(v) => setModality(v === "all" ? "" : v)}>
            <SelectTrigger aria-label="Filtrar por modalidade" className="h-9 w-auto min-w-44 bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as modalidades</SelectItem>
              {modalities.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
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
              {visible.map((course) => (
                <TableRow key={course.id} className={course.active ? undefined : "opacity-60"}>
                  <TableCell><span className="font-medium">{course.name}</span><span className="block text-xs text-muted-foreground">{course.modality}</span></TableCell>
                  <TableCell className="tabular-nums">{course.semesters}</TableCell>
                  <TableCell className="tabular-nums">{money(course.gross_monthly_cents / 100)}</TableCell>
                  <TableCell className="tabular-nums">{money(course.default_first_monthly_cents / 100)}</TableCell>
                  <TableCell><Badge variant="secondary">{percent2((1 - course.default_first_monthly_cents / course.gross_monthly_cents) * 100)}</Badge></TableCell>
                  <TableCell><Switch checked={course.active} onCheckedChange={() => toggle(course)} aria-label={`Ativar ${course.name}`} /></TableCell>
                  <TableCell className="text-right">
                    <CourseDialog organizationId={organizationId} course={course} />
                    <Button size="sm" variant="ghost" onClick={() => setRemoving(course)} aria-label={`Excluir ${course.name}`}><Trash2 className="size-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-4">
                    <EmptyState
                      icon={CoursesIcon}
                      title={courses.length === 0 ? "Nenhum curso cadastrado" : "Nenhum curso com esses filtros"}
                      description={courses.length === 0 ? "Cadastre os cursos para gerar propostas e reconhecer o curso nas mensagens dos leads. Dá para importar a planilha de uma vez." : "Limpe a busca ou escolha outra modalidade."}
                      compact
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Leads com este curso ficam sem curso definido. As propostas já geradas não mudam. Para só tirar o curso das novas propostas, desative-o em vez de excluir.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => removing && remove(removing)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function ImportDialog({ busy, existing, onImport }: { busy: boolean; existing: ReadonlySet<string>; onImport: (text: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const rows = useMemo(() => parseCourseImport(text, existing), [text, existing]);
  const valid = rows.filter((r) => r.status !== "erro");
  const invalid = rows.length - valid.length;

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "modelo-cursos.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><FileUp className="size-4" /> Importar planilha</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importar cursos</DialogTitle>
          <DialogDescription>
            Cole as linhas da planilha ou escolha um CSV, no formato <code className="rounded bg-muted px-1 text-xs">{IMPORT_FORMAT}</code>. Cursos já cadastrados (mesmo nome e modalidade) são atualizados.{" "}
            <button type="button" onClick={downloadTemplate} className="font-medium text-brand-cyan-700 underline underline-offset-2">Baixar modelo</button>
          </DialogDescription>
        </DialogHeader>
        <Input type="file" accept=".csv,.txt" aria-label="Arquivo CSV" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setText(await file.text()); }} />
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Linhas da planilha" placeholder={"Biomedicina;Semipresencial - Graduação;8;1014,70;306,75\nNutrição;Semipresencial - Graduação;8;1073,80;284,93"} className="font-mono text-xs" />
        {rows.length > 0 && (
          <div className="max-h-60 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Linha</TableHead><TableHead>Curso</TableHead><TableHead>Mensalidade</TableHead><TableHead>1ª mensalidade</TableHead><TableHead>Situação</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.line}>
                    <TableCell className="tabular-nums">{r.line}</TableCell>
                    <TableCell>{r.name || "—"}<span className="block text-xs text-muted-foreground">{r.modality}</span></TableCell>
                    <TableCell className="tabular-nums">{r.grossCents > 0 ? money(r.grossCents / 100) : "—"}</TableCell>
                    <TableCell className="tabular-nums">{r.firstCents > 0 ? money(r.firstCents / 100) : "—"}</TableCell>
                    <TableCell>
                      {r.status === "erro" ? <span className="text-xs text-status-danger">{r.error}</span> : <Badge variant={r.status === "novo" ? "default" : "secondary"}>{r.status === "novo" ? "Novo" : "Atualiza"}</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {rows.length === 0 ? "Nenhuma linha ainda." : `${valid.length} linha(s) prontas${invalid ? `, ${invalid} com problema (não entram)` : ""}.`}
          </p>
          <Button disabled={busy || valid.length === 0} onClick={async () => { if (await onImport(text)) { setOpen(false); setText(""); } }}>
            {busy && <Loader2 className="size-4 animate-spin" />} Importar {valid.length > 0 ? valid.length : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
