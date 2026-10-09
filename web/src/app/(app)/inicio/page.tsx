import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import { MODULE_ICONS } from "@/components/icons";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSessionContext } from "@/lib/session";
import { MODULES, type ModuleCode } from "@/lib/modules";
import { loadWorkPanel } from "@/features/home/queries";
import { LeadList, PlanUsage, PriorityList, QuickActions } from "@/features/home/work-panel";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

const MODULE_CARDS: { module: ModuleCode; href: string; description: string }[] = [
  { module: "crm", href: "/crm", description: "Funil de matrículas: lead do WhatsApp, qualificação, proposta de bolsa e taxa de matrícula." },
  { module: "atendimento", href: "/atendimento", description: "Conversas, contatos, departamentos e canais da equipe." },
  { module: "analise_curricular", href: "/analyses/new", description: "Leia históricos em PDF e calcule dispensas, pendências e previsão de conclusão." },
  { module: "portal_aluno", href: "/academic-analysis/students", description: "Área do aluno para enviar documentos e acompanhar solicitações." },
  { module: "grades_comerciais", href: "/commercial-grades", description: "Catálogo de matrizes de cursos com mensagem pronta para o WhatsApp." },
];

export default async function HomePage({ searchParams }: PageProps<"/inicio">) {
  const context = await getSessionContext();
  if (!context?.organization) redirect("/onboarding");
  const params = await searchParams;
  const modules = context.entitlements?.modules ?? [];
  const manager = context.organization.role === "owner" || context.organization.role === "admin";

  const now = new Date();
  const panel = await loadWorkPanel({
    organizationId: context.organization.organizationId,
    userId: context.authUserId,
    manager,
    modules,
    entitlements: context.entitlements,
    now,
  });
  const { activeLeads, openConversations, analysesThisMonth } = panel.counts;
  const stats: Partial<Record<ModuleCode, string>> = {
    ...(activeLeads !== null ? { crm: `${activeLeads} lead${activeLeads === 1 ? "" : "s"} no funil` } : {}),
    ...(openConversations !== null ? { atendimento: `${openConversations} conversa${openConversations === 1 ? "" : "s"} em aberto` } : {}),
    ...(analysesThisMonth !== null ? { analise_curricular: `${analysesThisMonth} análise${analysesThisMonth === 1 ? "" : "s"} neste mês` } : {}),
  };
  const hasWork = modules.some((m) => m === "crm" || m === "atendimento");

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
      {hasWork && (
        <div className="mb-8 space-y-5">
          <section aria-labelledby="agora" className="space-y-3">
            <h2 id="agora" className="text-lg font-semibold">Agora</h2>
            <PriorityList priorities={panel.priorities} />
          </section>
          {modules.includes("crm") && (
            <div className="grid gap-4 lg:grid-cols-2">
              <LeadList title={panel.scope === "equipe" ? "Leads quentes" : "Meus leads quentes"} hint="Maior pontuação primeiro" leads={panel.hotLeads} now={now} empty="Nenhum lead quente por enquanto." />
              <LeadList title={panel.scope === "equipe" ? "Leads parados" : "Meus leads parados"} hint="Mais de 3 dias na mesma etapa" leads={panel.staleLeads} now={now} empty="Nenhum lead parado. Bom trabalho." />
            </div>
          )}
          <PlanUsage usage={panel.usage} />
          <QuickActions modules={modules} />
        </div>
      )}
      <h2 className="mb-3 text-lg font-semibold">Seus módulos</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {MODULE_CARDS.map(({ module, href, description }) => {
          const Icon = MODULE_ICONS[module];
          const enabled = modules.includes(module);
          return (
            <Card key={module} className={enabled ? "shadow-sm transition-shadow hover:shadow-md" : "border-dashed bg-muted/30"}>
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold">
                    <Icon className="size-6 text-brand-navy" /> {MODULES[module]}
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
