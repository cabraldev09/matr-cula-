import "server-only";
import { prismaUnscoped } from "@/lib/prisma";

/**
 * Encerra todas as sessões (refresh tokens) de uma conta no Supabase Auth. Usado ao bloquear um
 * acesso: reativar depois não ressuscita sessões antigas. O access token já emitido expira sozinho
 * (no máximo 1 hora) e, enquanto isso, a sessão é recusada pelo perfil inativo.
 */
export async function revokeAuthSessions(authUserId: string): Promise<number> {
  return prismaUnscoped.$executeRaw`delete from auth.sessions where user_id = ${authUserId}::uuid`;
}
