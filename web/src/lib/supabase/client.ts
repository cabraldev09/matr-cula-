import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "@/lib/supabase/config";

let client: SupabaseClient | null = null;

/** Cliente do navegador (login, Realtime). Uma instância por aba. */
export function createClient(): SupabaseClient {
  if (client) return client;
  const { url, key } = publicSupabaseConfig();
  client = createBrowserClient(url, key);
  return client;
}
