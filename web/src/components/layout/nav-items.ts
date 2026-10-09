import { can, type Permission } from "@/lib/rbac";
import type { ModuleCode } from "@/lib/modules";

export type NavIcon =
  | "home"
  | "chat"
  | "contacts"
  | "channels"
  | "teams"
  | "new"
  | "list"
  | "review"
  | "academic"
  | "requests"
  | "students"
  | "grades"
  | "reports"
  | "settings"
  | "company"
  | "people"
  | "plan"
  | "account"
  | "platform"
  | "funnel"
  | "proposals"
  | "courses";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** Permissão da análise curricular (papel do usuário no módulo). */
  permission?: Permission;
  /** Módulo que precisa estar no plano da empresa. */
  module?: ModuleCode;
  /** Somente proprietário/administrador da empresa. */
  managerOnly?: boolean;
}

export interface NavSection {
  label?: string;
  module?: ModuleCode;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  { items: [{ href: "/inicio", label: "Início", icon: "home" }] },
  {
    label: "CRM",
    module: "crm",
    items: [
      { href: "/crm", label: "Funil de matrículas", icon: "funnel" },
      { href: "/crm/propostas", label: "Propostas", icon: "proposals" },
      { href: "/crm/cursos", label: "Cursos e preços", icon: "courses", managerOnly: true },
      { href: "/crm/configuracoes", label: "Proposta e pagamentos", icon: "settings", managerOnly: true },
    ],
  },
  {
    label: "Atendimento",
    module: "atendimento",
    items: [
      { href: "/atendimento", label: "Conversas", icon: "chat" },
      { href: "/atendimento/contatos", label: "Contatos", icon: "contacts" },
      { href: "/atendimento/canais", label: "Canais", icon: "channels", managerOnly: true },
      { href: "/atendimento/configuracoes", label: "Departamentos e respostas", icon: "teams", managerOnly: true },
    ],
  },
  {
    label: "Análise curricular",
    module: "analise_curricular",
    items: [
      { href: "/analyses/new", label: "Nova análise", icon: "new", permission: "analysis:create" },
      { href: "/analyses", label: "Análises", icon: "list", permission: "analysis:read" },
      { href: "/reviews", label: "Revisões", icon: "review", permission: "analysis:review" },
      { href: "/academic-analysis", label: "Análise acadêmica", icon: "academic", permission: "academic:manage" },
      { href: "/academic-analysis/requests", label: "Solicitações", icon: "requests", permission: "students:manage", module: "portal_aluno" },
      { href: "/academic-analysis/students", label: "Alunos", icon: "students", permission: "students:manage", module: "portal_aluno" },
      { href: "/commercial-grades", label: "Grades comerciais", icon: "grades", module: "grades_comerciais" },
    ],
  },
  { items: [{ href: "/relatorios", label: "Relatórios", icon: "reports" }] },
];

export interface SettingsNavItem {
  href: string;
  label: string;
  permission?: Permission;
  module?: ModuleCode;
  managerOnly?: boolean;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  { href: "/conta/empresa", label: "Empresa", managerOnly: true },
  { href: "/conta/equipe", label: "Equipe", managerOnly: true },
  { href: "/conta/plano", label: "Plano e faturas", managerOnly: true },
  { href: "/settings/account", label: "Minha conta" },
  { href: "/settings/general", label: "Análise: geral", permission: "privacy:manage", module: "analise_curricular" },
  { href: "/settings/academic-calendar", label: "Calendário letivo", permission: "privacy:manage", module: "analise_curricular" },
  { href: "/settings/openai", label: "OpenAI", permission: "integration:manage", module: "analise_curricular" },
  { href: "/settings/usage", label: "Uso de IA", permission: "usage:read", module: "analise_curricular" },
  { href: "/settings/privacy", label: "Privacidade", permission: "privacy:manage", module: "analise_curricular" },
  { href: "/settings/security", label: "Segurança", permission: "privacy:manage" },
  { href: "/settings/audit", label: "Auditoria", permission: "audit:read" },
  { href: "/settings/maintenance", label: "Manutenção", permission: "privacy:manage", module: "analise_curricular" },
];

/** Contexto mínimo que o menu precisa (serializável para o componente cliente). */
export interface NavContext {
  role: import("@/generated/prisma/enums").Role | null;
  modules: ModuleCode[];
  manager: boolean;
  platformAdmin: boolean;
}

/** Regra única de visibilidade: usada pelo menu lateral, pela paleta de comandos e pelas migalhas. */
export function isNavVisible(item: { module?: ModuleCode; managerOnly?: boolean; permission?: Permission }, nav: NavContext): boolean {
  if (item.module && !nav.modules.includes(item.module)) return false;
  if (item.managerOnly && !nav.manager) return false;
  if (item.permission && !can(nav.role, item.permission)) return false;
  return true;
}

export interface Crumb {
  label: string;
  href?: string;
}

/** Trilha de navegação a partir do endereço: "CRM › Propostas". Vazia fora das páginas do menu (o início não tem trilha). */
export function buildCrumbs(pathname: string): Crumb[] {
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const settings = SETTINGS_NAV.filter((item) => matches(item.href)).sort((a, b) => b.href.length - a.href.length)[0];
  if (settings) return [{ label: "Configurações" }, { label: settings.label, href: settings.href }, ...(pathname === settings.href ? [] : [{ label: "Detalhe" }])];
  let best: { item: NavItem; section: NavSection } | null = null;
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (matches(item.href) && (!best || item.href.length > best.item.href.length)) best = { item, section };
    }
  }
  if (!best || best.item.href === "/inicio") return [];
  const crumbs: Crumb[] = [];
  if (best.section.label) crumbs.push({ label: best.section.label });
  crumbs.push({ label: best.item.label, href: best.item.href });
  if (pathname !== best.item.href) crumbs.push({ label: pathname.endsWith("/proposta") ? "Proposta de bolsa" : "Detalhe" });
  return crumbs;
}
