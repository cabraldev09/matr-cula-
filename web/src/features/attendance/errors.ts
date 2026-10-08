/** Mensagens amigáveis para os erros do banco (RLS, regras e limites do plano). */
export function readableError(error: unknown): string {
  const message = (error as { message?: string } | null)?.message ?? "Não foi possível concluir a operação.";
  if (/Module not available/i.test(message)) return "O atendimento não está ativo no plano da empresa.";
  if (/row-level security|Permission denied|permission denied/i.test(message)) return "Você não tem permissão para esta operação.";
  if (/duplicate key|already exists/i.test(message)) return "Este registro já existe nesta empresa.";
  if (/Conversation already assigned/.test(message)) return "Outro atendente já assumiu esta conversa.";
  if (/reply window expired/.test(message)) return "Passaram 24 horas da última mensagem do cliente: use um modelo aprovado pelo WhatsApp.";
  if (/Open an active channel conversation/.test(message)) return "Assuma a conversa (e confira se o canal está ativo) antes de responder.";
  if (/Channel limit reached/.test(message)) return "O plano atingiu o limite de canais.";
  if (/check constraint/.test(message)) return "Confira os dados: um dos campos não está no formato esperado.";
  return message;
}

export function requireResult<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw result.error;
  return result.data;
}
