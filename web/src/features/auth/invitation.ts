import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

export type InvitationPreview =
  | { valid: true; email: string; role: string; organizationName: string }
  | { valid: false };

/** Dados do convite para a tela de aceite. O aceite em si passa pela RPC accept_invitation. */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  if (!/^[0-9a-f-]{36}$/.test(token)) return { valid: false };
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data } = await createAdminClient()
    .from("invitations")
    .select("email, role, expires_at, accepted_at, revoked_at, organizations(name)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const row = data as
    | { email: string; role: string; expires_at: string; accepted_at: string | null; revoked_at: string | null; organizations: { name: string } | null }
    | null;
  if (!row || row.accepted_at || row.revoked_at || new Date(row.expires_at) <= new Date()) return { valid: false };
  return { valid: true, email: row.email, role: row.role, organizationName: row.organizations?.name ?? "" };
}
