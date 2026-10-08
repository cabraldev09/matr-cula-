/** Módulos vendáveis. Os códigos espelham public.modules no banco. */
export const MODULES = {
  atendimento: "Atendimento",
  analise_curricular: "Análise curricular",
  portal_aluno: "Portal do aluno",
  grades_comerciais: "Grades comerciais",
  chatbot: "Chatbot",
  campanhas: "Campanhas",
  ia: "Inteligência artificial",
  api: "API e integrações",
} as const;

export type ModuleCode = keyof typeof MODULES;

export function isModuleCode(value: string): value is ModuleCode {
  return value in MODULES;
}

/** Prefixos de rota que exigem um módulo contratado. O primeiro que casar vale. */
export const ROUTE_MODULES: { prefix: string; module: ModuleCode }[] = [
  { prefix: "/atendimento", module: "atendimento" },
  { prefix: "/academic-analysis/students", module: "portal_aluno" },
  { prefix: "/academic-analysis/requests", module: "portal_aluno" },
  { prefix: "/commercial-grades", module: "grades_comerciais" },
  { prefix: "/analyses", module: "analise_curricular" },
  { prefix: "/reviews", module: "analise_curricular" },
  { prefix: "/academic-analysis", module: "analise_curricular" },
  { prefix: "/settings/academic-calendar", module: "analise_curricular" },
  { prefix: "/settings/openai", module: "analise_curricular" },
];

export function moduleForPath(path: string): ModuleCode | null {
  return ROUTE_MODULES.find((r) => path === r.prefix || path.startsWith(`${r.prefix}/`))?.module ?? null;
}
