import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export function requireResult(result) {
  if (result.error) throw result.error;
  return result.data;
}

export function readableError(error) {
  const message = error?.message || "Não foi possível concluir a operação.";
  if (
    message.includes("row-level security") ||
    message.includes("Permission denied") ||
    message.includes("permission denied")
  )
    return "Você não tem permissão para esta operação.";
  if (message.includes("duplicate key"))
    return "Este registro já existe nesta empresa.";
  if (message.includes("Invalid login credentials"))
    return "E-mail ou senha incorretos.";
  if (message.includes("Conversation already assigned"))
    return "Outro atendente já assumiu esta conversa. Atualize a lista.";
  if (message.includes("Invalid, expired or mismatched invitation"))
    return "Convite inválido ou expirado. Entre com o e-mail que recebeu o convite.";
  if (message.includes("Already a member"))
    return "Você já participa desta empresa.";
  if (message.includes("check constraint"))
    return "Confira os dados preenchidos. Um dos campos não atende ao formato exigido.";
  return message;
}
