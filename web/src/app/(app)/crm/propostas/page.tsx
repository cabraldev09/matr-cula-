import type { Metadata } from "next";
import { ExternalLink, FileDown } from "lucide-react";
import { ProposalIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";
import { money } from "@/domain/proposal/document";

export const metadata: Metadata = { title: "Propostas" };
export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const context = await requireContextModule("crm");
  const supabase = await createClient();
  const organizationId = context.organization.organizationId;
  const [{ data: proposals }, { data: charges }] = await Promise.all([
    supabase.from("proposals").select("id, number, public_token, student_name, course_name, modality, first_monthly_cents, status, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(200),
    supabase.from("enrollment_charges").select("proposal_id, status").eq("organization_id", organizationId).not("proposal_id", "is", null),
  ]);
  const paid = new Set((charges ?? []).filter((c) => c.status === "paid").map((c) => c.proposal_id as string));
  return (
    <>
      <PageHeader eyebrow="CRM" title="Propostas" description="Todas as propostas de bolsa geradas pela equipe, com link para o aluno e PDF." />
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Aluno</TableHead>
                <TableHead>Curso</TableHead>
                <TableHead>1ª mensalidade</TableHead>
                <TableHead>Taxa</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(proposals ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums">{p.number}</TableCell>
                  <TableCell className="font-medium">{p.student_name}</TableCell>
                  <TableCell>{p.course_name}<span className="block text-xs text-muted-foreground">{p.modality}</span></TableCell>
                  <TableCell className="tabular-nums">{money(p.first_monthly_cents / 100)}</TableCell>
                  <TableCell>{paid.has(p.id) ? <Badge className="bg-emerald-600">Paga</Badge> : <Badge variant="outline">Em aberto</Badge>}</TableCell>
                  <TableCell>{formatDateTime(p.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost"><a href={`/proposta/${p.public_token}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir</a></Button>
                    <Button asChild size="sm" variant="ghost"><a href={`/api/propostas/${p.id}/pdf`} target="_blank" rel="noreferrer"><FileDown className="size-4" /> PDF</a></Button>
                  </TableCell>
                </TableRow>
              ))}
              {(proposals ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="p-4"><EmptyState icon={ProposalIcon} title="Nenhuma proposta ainda" description="Gere a primeira pelo funil de matrículas, na aba Proposta e taxa do painel do lead." compact /></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </>
  );
}
