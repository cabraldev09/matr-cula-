import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePlatformAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { AdminNav } from "@/features/platform/admin-nav";
import { SUBSCRIPTION_LABELS } from "@/features/platform/labels";
import { pageHref, pageRange, PAGE_SIZE, parsePage, totalPages } from "@/features/platform/pagination";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Empresas" };
export const dynamic = "force-dynamic";


type Row = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  memberships: { count: number }[];
  subscriptions: { status: string; current_period_end: string; plans: { name: string } | null } | null;
};

export default async function PlatformOrganizationsPage({ searchParams }: PageProps<"/admin/empresas">) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const situation = typeof params.situacao === "string" && params.situacao in SUBSCRIPTION_LABELS ? params.situacao : "";
  const page = parsePage(params.pagina);
  const { from, to } = pageRange(page);
  // Com filtro de situação, a junção vira obrigatória (!inner) para só listar empresas com essa assinatura.
  const subscriptionSelect = `subscriptions${situation ? "!inner" : ""}(status, current_period_end, plans!subscriptions_plan_id_fkey(name))`;
  let request = createAdminClient()
    .from("organizations")
    .select(`id, name, slug, created_at, memberships(count), ${subscriptionSelect}`, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (query) request = request.ilike("name", `%${query.replace(/[%_]/g, "")}%`);
  if (situation) request = request.eq("subscriptions.status", situation);
  const { data, count } = await request;
  const rows = (data ?? []) as unknown as Row[];
  const pages = totalPages(count ?? 0);
  const filters = { q: query, situacao: situation };
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Empresas" description="Todas as contas da plataforma. Cada empresa só vê os próprios dados." />
      <AdminNav active="/admin/empresas" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="w-full max-w-sm">
          {situation && <input type="hidden" name="situacao" value={situation} />}
          <Input name="q" defaultValue={query} placeholder="Buscar pelo nome" aria-label="Buscar empresa" />
        </form>
        <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-1.5">
          {([["", "Todas"], ...Object.entries(SUBSCRIPTION_LABELS)] as [string, string][]).map(([value, label]) => (
            <Link
              key={value || "todas"}
              href={pageHref("/admin/empresas", { q: query, situacao: value })}
              aria-current={situation === value ? "true" : undefined}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium transition-colors", situation === value ? "border-brand-navy bg-brand-navy text-white" : "bg-card text-muted-foreground hover:text-foreground")}
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="ml-auto text-sm text-muted-foreground" aria-live="polite">{count ?? 0} empresa{count === 1 ? "" : "s"}</p>
      </div>
      <Card className="overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Válida até</TableHead>
                <TableHead>Pessoas</TableHead>
                <TableHead>Criada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/admin/empresas/${row.id}`} className="font-medium hover:underline">{row.name}</Link>
                    <span className="block text-xs text-muted-foreground">/p/{row.slug}</span>
                  </TableCell>
                  <TableCell>{row.subscriptions?.plans?.name ?? "—"}</TableCell>
                  <TableCell>{row.subscriptions ? <Badge variant="secondary">{SUBSCRIPTION_LABELS[row.subscriptions.status] ?? row.subscriptions.status}</Badge> : <span className="text-muted-foreground">Sem plano</span>}</TableCell>
                  <TableCell>{row.subscriptions ? formatDate(row.subscriptions.current_period_end) : "—"}</TableCell>
                  <TableCell className="tabular-nums">{row.memberships[0]?.count ?? 0}</TableCell>
                  <TableCell>{formatDate(row.created_at)}</TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma empresa encontrada.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
      {pages > 1 && (
        <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-3 text-sm">
          <Button asChild variant="outline" size="sm" disabled={page <= 1}><Link href={pageHref("/admin/empresas", { ...filters, pagina: page - 1 })} aria-disabled={page <= 1}>Anterior</Link></Button>
          <span className="text-muted-foreground">Página {page} de {pages} · {PAGE_SIZE} por página</span>
          <Button asChild variant="outline" size="sm" disabled={page >= pages}><Link href={pageHref("/admin/empresas", { ...filters, pagina: page + 1 })} aria-disabled={page >= pages}>Próxima</Link></Button>
        </nav>
      )}
    </>
  );
}
