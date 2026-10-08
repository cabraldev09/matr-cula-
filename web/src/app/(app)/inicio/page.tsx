import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, FileSearch, GraduationCap, KanbanSquare, Lock, MessagesSquare } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSessionContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { MODULES, type ModuleCode } from "@/lib/modules";
import { startOfCurrentMonth } from "@/lib/time";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

const MODULE_CARDS: { module: ModuleCode; href: string; icon: typeof MessagesSquare; description: string }[] = [
  { module: "crm", href: "/crm", icon: KanbanSquare, description: "Funil de matrículas: lead do WhatsApp, qualificação, proposta de bolsa e taxa de matrícula." },
  { module: "atendimento", href: "/atendimento", icon: MessagesSquare, description: "Conversas, contatos, departamentos e canais da equipe." },
  { module: "analise_curricular", href: "/analyses/new", icon: FileSearch, description: "Leia históricos em PDF e calcule dispensas, pendências e previsão de conclusão." },
  { module: "portal_aluno", href: "/academic-analysis/students", icon: GraduationCap, description: "Área do aluno para enviar documentos e acompanhar solicitações." },
  { module: "grades_comerciais", href: "/commercial-grades", icon: BookOpen, description: "Catálogo de matrizes de cursos com mensagem pronta para o WhatsApp." },
];

export default async function HomePage({ searchParams }: PageProps<"/inicio">) {
  const context = await getSessionContext();
  if (!context?.organization) redirect("/onboarding");
  const params = await searchParams;
  const modules = context.entitlements?.modules ?? [];
  const manager = context.organization.role === "owner" || context.organization.role === "admin";

  const [activeLeads, openConversations, analysesThisMonth] = await Promise.all([
    modules.includes("crm")
      ? (await createClient())
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", context.organization.organizationId)
          .not("stage", "in", "(matriculado,perdido)")
          .then((r) => r.count ?? 0)
      : Promise.resolve(null),
    modules.includes("atendimento")
      ? (await createClient())
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", context.organization.organizationId)
          .neq("status", "closed")
          .then((r) => r.count ?? 0)
      : Promise.resolve(null),
    modules.includes("analise_curricular")
      ? prisma.curricularAnalysis.count({ where: { createdAt: { gte: startOfCurrentMonth() } } })
      : Promise.resolve(null),
  ]);

  const stats: Partial<Record<ModuleCode, string>> = {
    ...(activeLeads !== null ? { crm: `${activeLeads} lead${activeLeads === 1 ? "" : "s"} no funil` } : {}),
    ...(openConversations !== null ? { atendimento: `${openConversations} conversa${openConversations === 1 ? "" : "s"} em aberto` } : {}),
    ...(analysesThisMonth !== null ? { analise_curricular: `${analysesThisMonth} análise${analysesThisMonth === 1 ? "" : "s"} neste mês` } : {}),
  };

  return (
    <>
      <PageHeader
        eyebrow={context.organization.name}
        title={`Olá, ${context.displayName.split(" ")[0]}`}
        description={
          context.entitlements?.plan
            ? `Plano ${context.entitlements.plan.name}${context.entitlements.status === "trialing" ? " (período de teste)" : ""}.`
            : "Sua empresa ainda não tem um plano ativo."
        }
      />
      {params.forbidden === "1" && (
        <p className="mb-4 rounded-md bg-status-warning-bg px-3 py-2 text-sm text-status-warning">Você não tem acesso à página solicitada.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {MODULE_CARDS.map(({ module, href, icon: Icon, description }) => {
          const enabled = modules.includes(module);
          return (
            <Card key={module} className={enabled ? "shadow-sm transition-shadow hover:shadow-md" : "border-dashed bg-muted/30"}>
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <Icon className="size-5 text-brand-cyan-700" /> {MODULES[module]}
                  </span>
                  {enabled ? <Badge variant="secondary">Contratado</Badge> : <Badge variant="outline"><Lock className="size-3" /> Não incluído</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
                {stats[module] && <p className="text-sm font-medium">{stats[module]}</p>}
                <div className="mt-auto pt-1">
                  {enabled ? (
                    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-brand-cyan-700 hover:underline">
                      Abrir <ArrowRight className="size-4" />
                    </Link>
                  ) : manager ? (
                    <Link href={`/conta/plano?modulo=${module}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-cyan-700 hover:underline">
                      Ver planos com este módulo <ArrowRight className="size-4" />
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">Peça ao administrador para incluir no plano.</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
