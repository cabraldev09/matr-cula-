"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, FileDown, Search } from "lucide-react";
import { ProposalIcon } from "@/components/icons";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/domain/proposal/document";
import { FEE_LABELS, filterProposals, summarize, type FeeStatus, type ProposalListRow } from "@/features/crm/proposal-list";
import { formatDateTime } from "@/lib/utils";

export function ProposalsTable({ rows }: { rows: ProposalListRow[] }) {
  const [query, setQuery] = useState("");
  const [fee, setFee] = useState<FeeStatus | "">("");
  const visible = useMemo(() => filterProposals(rows, query, fee), [rows, query, fee]);
  const totals = useMemo(() => summarize(visible), [visible]);
  const filtered = query.trim() !== "" || fee !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aluno, curso ou número" className="pl-8" aria-label="Buscar proposta" />
        </div>
        <Select value={fee || "all"} onValueChange={(v) => setFee(v === "all" ? "" : (v as FeeStatus))}>
          <SelectTrigger aria-label="Filtrar pela taxa" className="h-9 w-auto min-w-44 bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {(Object.keys(FEE_LABELS) as FeeStatus[]).map((key) => <SelectItem key={key} value={key}>{FEE_LABELS[key]}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setFee(""); }}>Limpar filtros</Button>}
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {totals.count} proposta{totals.count === 1 ? "" : "s"} · {money(totals.monthlyCents / 100)}/mês · {totals.paid} com taxa paga
        </p>
      </div>
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[820px]">
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
              {visible.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums">{p.number}</TableCell>
                  <TableCell className="font-medium">
                    {p.lead_id ? <Link href={`/crm?lead=${p.lead_id}`} className="hover:underline" title="Abrir o lead no funil">{p.student_name}</Link> : p.student_name}
                  </TableCell>
                  <TableCell>{p.course_name}<span className="block text-xs text-muted-foreground">{p.modality}</span></TableCell>
                  <TableCell className="tabular-nums">{money(p.first_monthly_cents / 100)}</TableCell>
                  <TableCell>
                    {p.fee === "paid" ? <Badge className="bg-status-success text-white">Paga</Badge> : p.fee === "pending" ? <Badge variant="secondary">Cobrança em aberto</Badge> : <Badge variant="outline">Sem cobrança</Badge>}
                  </TableCell>
                  <TableCell>{formatDateTime(p.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost"><a href={`/proposta/${p.public_token}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Abrir</a></Button>
                    <Button asChild size="sm" variant="ghost"><a href={`/api/propostas/${p.id}/pdf`} target="_blank" rel="noreferrer"><FileDown className="size-4" /> PDF</a></Button>
                  </TableCell>
                </TableRow>
              ))}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-4">
                    <EmptyState
                      icon={ProposalIcon}
                      title={filtered ? "Nenhuma proposta com esses filtros" : "Nenhuma proposta ainda"}
                      description={filtered ? "Limpe os filtros ou busque por outro nome." : "Gere a primeira pelo funil de matrículas, na aba Proposta e taxa do painel do lead."}
                      compact
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
