import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext, getSessionUser } from "@/lib/session";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { NavContext } from "@/components/layout/nav-items";
import { countDueFollowUps, listDueFollowUps } from "@/services/follow-up/follow-up";
import { getVapidPublicKey } from "@/services/push/web-push";
import { formatRelativeTime } from "@/lib/time";
import { MEMBER_ROLE_LABELS } from "@/lib/member-roles";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!context.organization) redirect("/onboarding");
  const organization = context.organization;
  const modules = context.entitlements?.modules ?? [];
  const manager = organization.role === "owner" || organization.role === "admin";
  const curricular = modules.includes("analise_curricular") ? await getSessionUser() : null;

  let followUps = null;
  if (curricular) {
    // ADMIN acompanha os retornos de toda a equipe; consultores veem só os próprios.
    const teamWide = curricular.role === "ADMIN";
    const scope = teamWide ? undefined : curricular.id;
    const [dueItems, dueTotal] = await Promise.all([listDueFollowUps(scope, 6), countDueFollowUps(scope)]);
    followUps = {
      teamWide,
      total: dueTotal,
      items: dueItems.map((a) => ({ id: a.id, student: a.studentName ?? "Aluno não identificado", course: a.courseName ?? "Curso não identificado", dueLabel: formatRelativeTime(a.followUpDueAt), ownerName: teamWide ? a.createdBy.name : undefined })),
    };
  }

  const nav: NavContext = { role: curricular?.role ?? null, modules, manager, platformAdmin: context.isPlatformAdmin };
  const access = context.entitlements?.access ?? "none";
  return (
    <div className="flex min-h-screen overflow-x-clip">
      <div className="hidden md:block md:sticky md:top-0 md:h-screen md:self-start md:bg-sidebar">
        <Sidebar nav={nav} />
      </div>
      <div className="app-canvas flex min-w-0 flex-1 flex-col">
        <Topbar
          user={{ name: context.displayName, email: context.email, roleLabel: MEMBER_ROLE_LABELS[organization.role] }}
          nav={nav}
          organizations={context.memberships.map((m) => ({ id: m.organizationId, name: m.name }))}
          activeOrganizationId={organization.organizationId}
          followUps={followUps}
          pushPublicKey={getVapidPublicKey()}
        />
        {access !== "full" && <PlanBanner access={access} manager={manager} hasPlan={Boolean(context.entitlements?.plan)} />}
        <main className="min-w-0 flex-1 animate-in fade-in-0 duration-300 px-4 py-5 md:px-6 md:py-7 xl:px-8 xl:py-8">
          <div className="mx-auto w-full min-w-0 max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function PlanBanner({ access, manager, hasPlan }: { access: "read_only" | "none"; manager: boolean; hasPlan: boolean }) {
  const message =
    access === "read_only"
      ? "O pagamento do plano está pendente. A empresa está em modo somente leitura."
      : hasPlan
        ? "A assinatura da empresa não está ativa. Os módulos ficam indisponíveis até a regularização."
        : "Escolha um plano para liberar os módulos da sua empresa.";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-status-warning/30 bg-status-warning-bg px-4 py-2 text-sm text-status-warning md:px-6">
      <span>{message}</span>
      {manager ? (
        <Link href="/conta/plano" className="rounded-md bg-status-warning px-3 py-1 text-xs font-semibold text-white">
          {hasPlan ? "Ver plano e faturas" : "Escolher plano"}
        </Link>
      ) : (
        <span className="text-xs">Fale com o administrador da empresa.</span>
      )}
    </div>
  );
}
