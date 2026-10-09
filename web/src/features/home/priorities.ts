export type PriorityTone = "danger" | "warning" | "info";

export interface Priority {
  key: string;
  title: string;
  detail: string;
  href: string;
  tone: PriorityTone;
}

export interface PanelCounts {
  /** Conversas esperando alguém assumir e há quanto tempo a mais antiga espera (ms). */
  pendingConversations: number;
  oldestPendingMs: number | null;
  staleLeads: number;
  hotLeads: number;
  proposalsWaiting: number;
  /** Teste grátis: dias que faltam, ou null quando não é teste. */
  trialDaysLeft: number | null;
  /** Itens do plano acima de 80% do limite (ex.: "usuários 4 de 5"). */
  nearLimit: string[];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function waiting(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

/** Lista do que pede atenção agora, da mais urgente para a menos. Vazia quando está tudo em dia. */
export function buildPriorities(counts: PanelCounts, options: { manager: boolean }): Priority[] {
  const list: Priority[] = [];
  if (counts.pendingConversations > 0) {
    const late = (counts.oldestPendingMs ?? 0) > 15 * 60_000;
    list.push({
      key: "fila",
      title: `${plural(counts.pendingConversations, "conversa esperando", "conversas esperando")} atendimento`,
      detail: counts.oldestPendingMs !== null ? `A mais antiga espera há ${waiting(counts.oldestPendingMs)}.` : "Assuma para o cliente ser respondido.",
      href: "/atendimento",
      tone: late ? "danger" : "warning",
    });
  }
  if (counts.staleLeads > 0) {
    list.push({ key: "parados", title: `${plural(counts.staleLeads, "lead parado", "leads parados")} no funil`, detail: "Estão na mesma etapa há mais tempo que o normal. Retome o contato.", href: "/crm", tone: "warning" });
  }
  if (counts.proposalsWaiting > 0) {
    list.push({ key: "propostas", title: `${plural(counts.proposalsWaiting, "proposta sem resposta", "propostas sem resposta")}`, detail: "Enviadas há mais de 5 dias. Vale um lembrete.", href: "/crm?etapa=proposta", tone: "info" });
  }
  if (counts.hotLeads > 0) {
    list.push({ key: "quentes", title: `${plural(counts.hotLeads, "lead quente", "leads quentes")} para contatar`, detail: "Já têm curso, ingresso e conversa: são os que mais perto estão de matricular.", href: "/crm?temp=quente", tone: "info" });
  }
  if (options.manager && counts.trialDaysLeft !== null && counts.trialDaysLeft <= 3) {
    list.push({
      key: "teste",
      title: counts.trialDaysLeft <= 0 ? "Seu teste grátis termina hoje" : `Seu teste grátis termina em ${plural(counts.trialDaysLeft, "dia", "dias")}`,
      detail: "Escolha um plano para a equipe não perder o acesso.",
      href: "/conta/plano",
      tone: "danger",
    });
  }
  if (options.manager && counts.nearLimit.length > 0) {
    list.push({ key: "limite", title: "Plano perto do limite", detail: `${counts.nearLimit.join(", ")}. Faça upgrade antes de travar o uso.`, href: "/conta/plano", tone: "warning" });
  }
  const order: Record<PriorityTone, number> = { danger: 0, warning: 1, info: 2 };
  return list.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** Itens do plano acima de 80% do limite. `usage` e `limits` usam as mesmas chaves (users, channels, analyses). */
export function nearLimitItems(usage: Record<string, number>, limits: Record<string, number>): string[] {
  const labels: Record<string, string> = { users: "usuários", channels: "canais", analyses: "análises no mês" };
  return Object.keys(labels)
    .filter((key) => typeof limits[key] === "number" && limits[key]! > 0 && (usage[key] ?? 0) / limits[key]! >= 0.8)
    .map((key) => `${labels[key]} ${usage[key]} de ${limits[key]}`);
}

export function trialDaysLeft(status: string | null | undefined, periodEnd: string | null | undefined, now: Date): number | null {
  if (status !== "trialing" || !periodEnd) return null;
  return Math.max(0, Math.ceil((new Date(periodEnd).getTime() - now.getTime()) / 86_400_000));
}
