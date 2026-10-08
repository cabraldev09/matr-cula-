import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { PORTAL_ORGANIZATION_COOKIE } from "@/features/auth/constants";

/**
 * Destino dos links enviados pelo Supabase Auth (confirmação de cadastro, convite e redefinição de
 * senha). Aceita o fluxo PKCE (?code=) e o de token (?token_hash=&type=).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const rawNext = url.searchParams.get("next") ?? "/inicio";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/inicio";
  const supabase = await createClient();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : { error: new Error("missing token") };

  if (error) return NextResponse.redirect(new URL("/login?link=invalido", url));
  // Convites e recuperação levam à definição de senha antes de seguir.
  const destination = type === "invite" || type === "recovery" ? `/definir-senha?next=${encodeURIComponent(next)}` : next;
  const response = NextResponse.redirect(new URL(destination, url));
  // Links do portal do aluno informam a empresa; a sessão só vale se houver perfil de aluno nela.
  const organization = url.searchParams.get("org");
  if (organization && /^[0-9a-f-]{36}$/.test(organization)) {
    response.cookies.set(PORTAL_ORGANIZATION_COOKIE, organization, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
  }
  return response;
}
