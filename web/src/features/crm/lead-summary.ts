import { daysInStage } from "@/features/crm/board-rules";
import type { Lead } from "@/features/crm/labels";

export interface NextStep {
  title: string;
  hint: string;
}

const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

/** O que a equipe deve fazer agora com o lead, escrito a partir da etapa e dos dados já preenchidos. */
export function nextStep(lead: Lead, now: Date): NextStep {
  switch (lead.stage) {
    case "novo":
      return { title: "Responder e qualificar", hint: "Preencha curso e forma de ingresso para o lead avançar sozinho para Qualificado." };
    case "contato":
      return { title: "Definir curso e forma de ingresso", hint: "Com os dois preenchidos, o lead passa para Qualificado." };
    case "qualificado":
      return lead.has_previous_studies
        ? { title: "Analisar o histórico antes da proposta", hint: "Quem já cursou faculdade pode aproveitar disciplinas e terminar mais cedo. Use Analisar histórico." }
        : { title: "Gerar a proposta de bolsa", hint: "Escolha o curso e a bolsa na aba Proposta e taxa." };
    case "analise":
      return { title: "Concluir a análise curricular", hint: "Depois de analisar o histórico, gere a proposta de bolsa." };
    case "proposta": {
      const days = daysInStage(lead, now);
      const value = lead.proposals ? `Proposta nº ${lead.proposals.number} de ${brl(lead.proposals.first_monthly_cents)}/mês` : "Proposta enviada";
      return { title: "Acompanhar a decisão", hint: `${value}, ${days === 0 ? "enviada hoje" : `há ${days} dia${days === 1 ? "" : "s"}`}. Gere a cobrança da taxa quando o aluno aceitar.` };
    }
    case "taxa_paga":
      return { title: "Confirmar a matrícula", hint: "A taxa está paga. Quando a matrícula sair na instituição, mova o lead para Matriculado." };
    case "matriculado":
      return { title: "Matrícula concluída", hint: "Nada pendente neste lead." };
    case "perdido":
      return { title: "Lead perdido", hint: lead.lost_reason ? `Motivo: ${lead.lost_reason}.` : "Para retomar, mova o lead para outra etapa." };
  }
}
