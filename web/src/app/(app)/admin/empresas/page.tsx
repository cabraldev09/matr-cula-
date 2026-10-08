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
  let request = createAdminClient()
    .from("organizations")
    .select("id, name, slug, created_at, memberships(count), subscriptions(status, current_period_end, plans!subscriptions_plan_id_fkey(name))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (query) request = request.ilike("name", `%${query.replace(/[%_]/g, "")}%`);
  const { data } = await request;
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Empresas" description="Todas as contas da plataforma. Cada empresa só vê os próprios dados." />
      <AdminNav active="/admin/empresas" />
      <form className="mb-4 max-w-sm">
        <Input name="q" defaultValue={query} placeholder="Buscar pelo nome" aria-label="Buscar empresa" />
      </form>
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
    </>
  );
}
