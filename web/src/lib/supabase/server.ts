import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "@/lib/supabase/config";

/** Cliente com a sessão do usuário (cookies): as consultas respeitam o RLS. */
export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const { url, key } = publicSupabaseConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components não podem gravar cookies; o proxy renova a sessão.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

/**
 * Cliente com a chave secreta: ignora o RLS. Somente para o painel da plataforma e webhooks de
 * pagamento, sempre depois de verificar quem chama.
 */
export function createAdminClient(): SupabaseClient {
  if (admin) return admin;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SUPABASE_SECRET_KEY não configurada.");
  admin = createSupabaseClient(publicSupabaseConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
