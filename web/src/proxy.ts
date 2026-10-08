import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/** Rotas abertas: site, planos, login/cadastro, portal público do aluno, webhooks e cron. */
const PUBLIC_PATHS = [
  "/",
  "/planos",
  "/login",
  "/cadastro",
  "/esqueci-senha",
  "/definir-senha",
  "/auth",
  "/convite",
  "/p",
  "/api/webhooks",
  "/api/cron",
  "/api/health",
];

function isPublic(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || (p !== "/" && path.startsWith(`${p}/`)));
}

/**
 * Renova a sessão do Supabase e exige login nas áreas internas. Permissões, empresa e módulos são
 * verificados no servidor (páginas, server actions e route handlers), onde há acesso ao banco.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const path = request.nextUrl.pathname;
  if (userId || isPublic(path)) return response;
  if (path.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const loginUrl = new URL("/login", request.nextUrl);
  loginUrl.searchParams.set("next", path + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!brand/|_vercel/|monitoring|app-icon/|icon|apple-icon|\\.well-known/|manifest\\.webmanifest|_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:png|svg|jpg|jpeg|ico|webp|woff2?)$).*)",
  ],
};
