import type { Lead, Stage } from "@/features/crm/labels";

export const CLOSED_STAGES: readonly Stage[] = ["matriculado", "perdido"];
/** Quantos cartões cada coluna mostra antes do "ver mais". */
export const COLUMN_PAGE = 30;
/** Matriculados e perdidos mais antigos que isso saem do quadro (aparecem em "carregar anteriores"). */
export const CLOSED_WINDOW_DAYS = 30;

/** Motivo pelo qual o lead não pode ir para a etapa (ou null, se pode). Etapas automáticas não se arrastam. */
export function moveBlockedReason(lead: Pick<Lead, "stage" | "proposal_id">, to: Stage): string | null {
  if (lead.stage === to) return null;
  if (to === "taxa_paga") return "A etapa Taxa paga é preenchida sozinha quando o pagamento é confirmado. Gere a cobrança no painel do lead.";
  if (to === "matriculado" && lead.stage !== "taxa_paga") return "Só dá para matricular depois que a taxa estiver paga.";
  if (to === "proposta" && !lead.proposal_id) return "O lead passa para Proposta enviada quando a proposta é gerada. Gere a proposta no painel do lead.";
  return null;
}

export type Staleness = "ok" | "warning" | "late";

const DAY = 86_400_000;

export function daysInStage(lead: Pick<Lead, "stage_changed_at">, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(lead.stage_changed_at).getTime()) / DAY));
}

/** Lead parado: novo há mais de 1 dia, ou outras etapas abertas há mais de 3 (atenção) e 7 (atrasado). */
export function staleness(lead: Pick<Lead, "stage" | "stage_changed_at">, now: Date): Staleness {
  if (CLOSED_STAGES.includes(lead.stage) || lead.stage === "taxa_paga") return "ok";
  const days = daysInStage(lead, now);
  const [warn, late] = lead.stage === "novo" ? [1, 3] : [3, 7];
  return days >= late ? "late" : days >= warn ? "warning" : "ok";
}

export interface BoardFilters {
  query: string;
  course: string;
  temperature: string;
  /** "" todos, "me" meus, "none" sem responsável ou o id do responsável. */
  owner: string;
  source: string;
  stage: string;
}

export const EMPTY_FILTERS: BoardFilters = { query: "", course: "", temperature: "", owner: "", source: "", stage: "" };

export function matchesFilters(lead: Lead, filters: BoardFilters, ctx: { userId: string; courseName: (id: string | null) => string }): boolean {
  if (filters.stage && lead.stage !== filters.stage) return false;
  if (filters.temperature && lead.temperature !== filters.temperature) return false;
  if (filters.course && lead.course_id !== filters.course) return false;
  if (filters.source && lead.source !== filters.source) return false;
  if (filters.owner === "me" && lead.owner_id !== ctx.userId) return false;
  if (filters.owner === "none" && lead.owner_id) return false;
  if (filters.owner && filters.owner !== "me" && filters.owner !== "none" && lead.owner_id !== filters.owner) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  const text = `${lead.contacts?.name ?? ""} ${lead.contacts?.phone ?? ""} ${ctx.courseName(lead.course_id)}`.toLowerCase();
  return text.includes(query);
}

/** Soma das primeiras mensalidades das propostas em aberto, em centavos. */
export function openProposalCents(leads: Pick<Lead, "stage" | "proposals">[]): number {
  return leads.reduce((sum, lead) => sum + (lead.stage === "proposta" ? (lead.proposals?.first_monthly_cents ?? 0) : 0), 0);
}

/** Conversão: leads que pagaram a taxa (ou se matricularam) entre os que já tiveram desfecho. */
export function conversionRate(leads: Pick<Lead, "stage">[]): number | null {
  const won = leads.filter((l) => l.stage === "taxa_paga" || l.stage === "matriculado").length;
  const decided = won + leads.filter((l) => l.stage === "perdido").length;
  return decided ? Math.round((won / decided) * 100) : null;
}

export function filtersFromParams(params: URLSearchParams): BoardFilters {
  return {
    query: params.get("q") ?? "",
    course: params.get("curso") ?? "",
    temperature: params.get("temp") ?? "",
    owner: params.get("resp") ?? "",
    source: params.get("origem") ?? "",
    stage: params.get("etapa") ?? "",
  };
}

const PARAM_KEYS: Record<keyof BoardFilters, string> = { query: "q", course: "curso", temperature: "temp", owner: "resp", source: "origem", stage: "etapa" };

export function paramsWithFilters(current: URLSearchParams, patch: Partial<BoardFilters>): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch) as [keyof BoardFilters, string][]) {
    if (value) next.set(PARAM_KEYS[key], value);
    else next.delete(PARAM_KEYS[key]);
  }
  return next;
}
