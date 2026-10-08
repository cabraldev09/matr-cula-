import type { MemberRole } from "@/lib/session";

/** Papéis na empresa (public.memberships). */
export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  supervisor: "Supervisor",
  agent: "Atendente",
};

export const MEMBER_ROLE_DESCRIPTIONS: Record<Exclude<MemberRole, "owner">, string> = {
  admin: "Gerencia a empresa, a equipe, o plano e todas as configurações.",
  supervisor: "Vê todos os departamentos e encerra qualquer conversa.",
  agent: "Atende as conversas dos seus departamentos.",
};
