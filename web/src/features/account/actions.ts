"use server";

import { z } from "zod";
import { createClient as createStandaloneClient } from "@supabase/supabase-js";
import { getSessionContext, getSessionUser, UnauthorizedError } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { recordAudit } from "@/services/audit-log/audit-log";
import { rateLimit } from "@/services/rate-limit/rate-limit";
import { fail, ok, toActionError, type ActionResult } from "@/lib/action-result";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(10, "A nova senha deve ter ao menos 10 caracteres.").max(200),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, { message: "A confirmação não confere.", path: ["confirm"] })
  .refine((d) => d.newPassword !== d.currentPassword, { message: "A nova senha deve ser diferente da atual.", path: ["newPassword"] });

/** Troca da própria senha: confere a senha atual sem mexer na sessão e então atualiza no Supabase Auth. */
export async function changeOwnPasswordAction(input: unknown): Promise<ActionResult<{ loginUrl: string }>> {
  try {
    const context = await getSessionContext();
    if (!context) throw new UnauthorizedError();
    const limit = rateLimit(`pwchange:${context.authUserId}`, { capacity: 5, refillPerMinute: 5 });
    if (!limit.allowed) return fail(`Muitas tentativas. Aguarde ${limit.retryAfterSeconds}s.`);
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const { url, key } = publicSupabaseConfig();
    const verifier = createStandaloneClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const check = await verifier.auth.signInWithPassword({ email: context.email, password: parsed.data.currentPassword });
    if (check.error) return fail("Senha atual incorreta.");
    await verifier.auth.signOut({ scope: "local" });

    const { error } = await (await createClient()).auth.updateUser({ password: parsed.data.newPassword });
    if (error) return fail("Não foi possível alterar a senha.");
    const user = await getSessionUser({ allowStudent: true });
    if (user) await recordAudit({ userId: user.id, action: "user.password_changed", entityType: "User", entityId: user.id });
    return ok({ loginUrl: "" }, "Senha alterada.");
  } catch (err) {
    return toActionError(err);
  }
}
