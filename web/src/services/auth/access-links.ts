import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/app-url";

export type AccessLinkPurpose = "INVITE" | "RESET";

/**
 * Cria (ou reutiliza) a conta no Supabase Auth e gera um link de uso único para definir a senha.
 * O link aponta para /auth/confirm, que valida o token e abre a tela de senha.
 * `organizationId` é anexado para o portal do aluno saber de qual empresa é o acesso.
 */
export async function issueAccessLink(input: {
  email: string;
  name: string;
  purpose: AccessLinkPurpose;
  next: string;
  organizationId?: string;
}): Promise<{ authUserId: string; url: string; purpose: AccessLinkPurpose }> {
  const admin = createAdminClient();
  const options = { data: { display_name: input.name } };
  let purpose = input.purpose;
  let result = await admin.auth.admin.generateLink(
    purpose === "INVITE"
      ? { type: "invite", email: input.email, options }
      : { type: "recovery", email: input.email },
  );
  // A pessoa já tem conta (por exemplo, em outra empresa): basta um link para definir a senha.
  if (result.error && purpose === "INVITE" && /registered|exists/i.test(result.error.message)) {
    purpose = "RESET";
    result = await admin.auth.admin.generateLink({ type: "recovery", email: input.email });
  }
  if (result.error || !result.data.user || !result.data.properties?.hashed_token) {
    throw new Error(`Não foi possível gerar o link de acesso: ${result.error?.message ?? "resposta vazia"}`);
  }
  const params = new URLSearchParams({
    token_hash: result.data.properties.hashed_token,
    type: purpose === "INVITE" ? "invite" : "recovery",
    next: input.next,
  });
  if (input.organizationId) params.set("org", input.organizationId);
  return { authUserId: result.data.user.id, url: appUrl(`/auth/confirm?${params.toString()}`), purpose };
}
