"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, PanelLeftClose, X } from "lucide-react";
import {
  AccountIcon, AnalysesIcon, ChannelsIcon, ChatIcon, CompanyIcon, ContactsIcon, CoursesIcon, FunnelIcon, GradesIcon, HomeIcon,
  NewAnalysisIcon, PeopleIcon, PlanIcon, PlatformIcon, ProposalIcon, ReportsIcon, RequestsIcon, ReviewIcon, SettingsIcon,
  StepsIcon, StudentsIcon, TeamsIcon, type IconComponent,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { can } from "@/lib/rbac";
import { NAV_SECTIONS, SETTINGS_NAV, type NavContext, type NavIcon, type NavItem, type SettingsNavItem } from "@/components/layout/nav-items";
import { BrandLogo } from "@/components/shared/brand-logo";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const ICONS: Record<NavIcon, IconComponent> = {
  home: HomeIcon,
  chat: ChatIcon,
  contacts: ContactsIcon,
  channels: ChannelsIcon,
  teams: TeamsIcon,
  new: NewAnalysisIcon,
  list: AnalysesIcon,
  review: ReviewIcon,
  academic: StepsIcon,
  requests: RequestsIcon,
  students: StudentsIcon,
  grades: GradesIcon,
  reports: ReportsIcon,
  settings: SettingsIcon,
  company: CompanyIcon,
  people: PeopleIcon,
  plan: PlanIcon,
  account: AccountIcon,
  platform: PlatformIcon,
  funnel: FunnelIcon,
  proposals: ProposalIcon,
  courses: CoursesIcon,
};

function visible(item: NavItem | SettingsNavItem, nav: NavContext): boolean {
  if (item.module && !nav.modules.includes(item.module)) return false;
  if (item.managerOnly && !nav.manager) return false;
  if (item.permission && !can(nav.role, item.permission)) return false;
  return true;
}

/** Itens da análise curricular que são prefixos de outros (ex.: /analyses e /analyses/new). */
function isActive(pathname: string, href: string): boolean {
  if (href === "/analyses") return pathname === "/analyses" || /^\/analyses\/(?!new)/.test(pathname);
  if (href === "/academic-analysis") return pathname === href || (pathname.startsWith(`${href}/`) && !/^\/academic-analysis\/(students|requests)/.test(pathname));
  if (href === "/atendimento") return pathname === href || /^\/atendimento\/conversas/.test(pathname);
  if (href === "/crm") return pathname === href || /^\/crm\/leads/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * `rail`: barra lateral do desktop (recolhe para ícones abaixo de xl e pode ser alternada).
 * `drawer`: conteúdo do menu mobile dentro do Sheet — sempre expandido, sem o botão de recolher.
 */
export function Sidebar({ nav, onNavigate, onClose, variant = "rail" }: { nav: NavContext; onNavigate?: () => void; onClose?: () => void; variant?: "rail" | "drawer" }) {
  const pathname = usePathname();
  const [railMode, setMode] = useState<"auto" | "expanded" | "collapsed">("auto");
  const drawer = variant === "drawer";
  const mode = drawer ? "expanded" : railMode;
  const settingsItems = SETTINGS_NAV.filter((item) => visible(item, nav));
  const inSettings = settingsItems.some((item) => isActive(pathname, item.href));
  const expanded = mode === "expanded";
  const labels = mode === "expanded" ? "inline" : mode === "collapsed" ? "hidden" : "hidden xl:inline";
  const sectionLabels = mode === "expanded" ? "block" : mode === "collapsed" ? "hidden" : "hidden xl:block";

  function toggle() {
    const isCurrentlyExpanded = mode === "expanded" || (mode === "auto" && window.matchMedia("(min-width: 1280px)").matches);
    setMode(isCurrentlyExpanded ? "collapsed" : "expanded");
  }

  const sections = NAV_SECTIONS.filter((section) => !section.module || nav.modules.includes(section.module))
    .map((section) => ({ ...section, items: section.items.filter((item) => visible(item, nav)) }))
    .filter((section) => section.items.length > 0);

  const linkClass = (active: boolean) =>
    cn(
      "group/nav relative flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
      expanded ? "justify-start" : mode === "auto" && "xl:justify-start",
      active
        ? "bg-gradient-to-r from-sidebar-primary to-brand-cyan-400 text-sidebar-primary-foreground shadow-[0_8px_24px_-10px_rgb(6_147_227/0.9)]"
        : "text-sidebar-foreground/85 hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-white",
    );

  return (
    <aside data-sidebar className={cn("relative z-30 flex flex-col bg-sidebar text-sidebar-foreground", drawer ? "h-full w-full" : "h-screen min-h-screen transition-[width] duration-300", !drawer && (mode === "expanded" ? "w-64" : mode === "collapsed" ? "w-16" : "w-16 xl:w-64"))}>
      <div className={cn("flex items-center pb-4 pt-5 text-white", expanded ? "justify-between px-5" : mode === "collapsed" ? "justify-center px-3" : "justify-center px-3 xl:justify-between xl:px-5")}>
        {mode === "collapsed" ? (
          <button type="button" onClick={toggle} className="rounded-md p-1 text-white focus:outline-none focus:ring-2 focus:ring-sidebar-primary" aria-label="Expandir menu lateral" title="Expandir menu lateral">
            <BrandLogo compact />
          </button>
        ) : (
          <>
            <span className={cn("min-w-0", mode === "expanded" ? "block" : "hidden xl:block", drawer && "max-w-[180px]")}><BrandLogo maxWidthClassName="max-w-[160px]" /></span>
            <button type="button" onClick={toggle} className={mode === "expanded" ? "hidden" : "block rounded-md p-1 text-white focus:outline-none focus:ring-2 focus:ring-sidebar-primary xl:hidden"} aria-label="Expandir menu lateral" title="Expandir menu lateral"><BrandLogo compact /></button>
          </>
        )}
        {drawer ? (
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-white/80 transition-colors hover:bg-sidebar-accent hover:text-white" aria-label="Fechar menu">
            <X className="size-5" />
          </button>
        ) : mode !== "collapsed" && <button type="button" onClick={toggle} className={cn("rounded-md p-1.5 text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-white", mode === "auto" && "absolute -right-11 top-3 z-40 bg-sidebar text-white shadow-md xl:static xl:bg-transparent xl:shadow-none")} aria-label="Expandir ou recolher menu lateral" title="Expandir ou recolher menu lateral">
          <PanelLeftClose className="size-4" />
        </button>}
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-6" aria-label="Navegação principal">
        {sections.map((section, index) => (
          <div key={section.label ?? index} className="space-y-1">
            {section.label && <p className={cn("px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50", sectionLabels)}>{section.label}</p>}
            {section.items.map((item) => {
              const Icon = ICONS[item.icon];
              return (
                <Link key={item.href} href={item.href} onClick={onNavigate} title={item.label} className={linkClass(isActive(pathname, item.href))}>
                  <Icon className="size-4 transition-transform duration-200 group-hover/nav:scale-110" />
                  <span className={labels}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}

        {nav.platformAdmin && (
          <Link href="/admin" onClick={onNavigate} title="Plataforma" className={linkClass(pathname.startsWith("/admin"))}>
            <PlatformIcon className="size-4" />
            <span className={labels}>Plataforma</span>
          </Link>
        )}

        {settingsItems.length > 0 && (
          <Collapsible defaultOpen={inSettings} className={sectionLabels}>
            <CollapsibleTrigger className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors", inSettings ? "text-white" : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white")}>
              <SettingsIcon className="size-4" />
              Configurações
              <ChevronDown className="ml-auto size-4 opacity-60 transition-transform [[data-state=open]_&]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-5 mt-1 space-y-0.5 border-l border-sidebar-border/60 pl-3">
              {settingsItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn("block rounded-md px-3 py-1.5 text-[13px] transition-colors", isActive(pathname, item.href) ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/75 hover:text-white")}
                >
                  {item.label}
                </Link>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
        {settingsItems.length > 0 && mode !== "expanded" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" title="Configurações" className={cn("flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors", mode === "auto" && "xl:hidden", inSettings ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-white")}>
                <SettingsIcon className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-52">
              <DropdownMenuLabel>Configurações</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {settingsItems.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href} onClick={onNavigate}>{item.label}</Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </aside>
  );
}
