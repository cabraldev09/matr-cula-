import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Pessoas ativas da empresa com o nome de exibição (lido pelo RLS de profiles). */
export async function loadMembers(supabase: SupabaseClient, organizationId: string) {
  const { data: memberships } = await supabase.from("memberships").select("user_id, role").eq("organization_id", organizationId).eq("active", true);
  const ids = (memberships ?? []).map((m) => m.user_id as string);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  return (memberships ?? []).map((m) => ({ id: m.user_id as string, role: m.role as string, name: names.get(m.user_id) ?? "Pessoa" }));
}
