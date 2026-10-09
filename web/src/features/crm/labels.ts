export const STAGES = [
  { key: "novo", label: "Novo lead", hint: "Chegou agora", color: "#64748b" },
  { key: "contato", label: "Em contato", hint: "Conversa iniciada", color: "#0ea5e9" },
  { key: "qualificado", label: "Qualificado", hint: "Curso e ingresso definidos", color: "#6366f1" },
  { key: "analise", label: "Análise curricular", hint: "Aproveitamento de estudos", color: "#8b5cf6" },
  { key: "proposta", label: "Proposta enviada", hint: "Aguardando decisão", color: "#f59e0b" },
  { key: "taxa_paga", label: "Taxa paga", hint: "Vaga garantida", color: "#10b981" },
  { key: "matriculado", label: "Matriculado", hint: "Matrícula concluída", color: "#059669" },
  { key: "perdido", label: "Perdido", hint: "Não seguiu", color: "#ef4444" },
] as const;

export type Stage = (typeof STAGES)[number]["key"];

export const ENTRY_TYPES = [
  ["vestibular", "Vestibular"],
  ["enem", "Nota do ENEM"],
  ["transferencia", "Transferência"],
  ["segunda_graduacao", "Segunda graduação"],
  ["retorno", "Retorno ao curso"],
] as const;

export const EDUCATION_LEVELS = [
  ["medio_cursando", "Ensino médio em curso"],
  ["medio_completo", "Ensino médio completo"],
  ["superior_incompleto", "Superior incompleto"],
  ["superior_completo", "Superior completo"],
  ["pos", "Pós-graduação"],
] as const;

export const MODALITIES = ["EAD - Graduação", "Semipresencial - Graduação", "Presencial - Graduação", "EAD - Pós-graduação", "EAD - Tecnólogo"] as const;

export const TEMPERATURE = {
  quente: { label: "Quente", className: "bg-orange-100 text-orange-700 ring-orange-200" },
  morno: { label: "Morno", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  frio: { label: "Frio", className: "bg-sky-50 text-sky-700 ring-sky-200" },
} as const;

export const LOST_REASONS = ["Preço", "Escolheu outra instituição", "Sem retorno", "Adiou para outro semestre", "Curso indisponível", "Outro"] as const;

export const EVENT_LABELS: Record<string, string> = {
  created: "Lead criado",
  stage: "Mudou de etapa",
  note: "Nota",
  qualified: "Qualificação",
  proposal: "Proposta gerada",
  charge: "Cobrança da taxa",
  paid: "Taxa paga",
};

export interface Lead {
  id: string;
  contact_id: string;
  owner_id: string | null;
  source: "whatsapp" | "manual";
  stage: Stage;
  stage_changed_at: string;
  course_id: string | null;
  modality: string | null;
  entry_type: string | null;
  has_previous_studies: boolean | null;
  education_level: string | null;
  city: string | null;
  start_term: string | null;
  best_time: string | null;
  incoming_messages: number;
  score: number;
  temperature: keyof typeof TEMPERATURE;
  lost_reason: string | null;
  notes: string;
  proposal_id: string | null;
  created_at: string;
  updated_at: string;
  contacts: { name: string; phone: string | null; email: string | null } | null;
  proposals?: { number: number; first_monthly_cents: number } | null;
}

export interface Course {
  id: string;
  name: string;
  modality: string;
  semesters: number;
  gross_monthly_cents: number;
  default_first_monthly_cents: number;
  active: boolean;
}
