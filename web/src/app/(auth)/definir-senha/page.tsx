import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/features/auth/auth-shell";
import { SetPasswordForm } from "@/features/auth/set-password-form";
import { getSessionContext } from "@/lib/session";

export const metadata: Metadata = { title: "Definir senha" };
export const dynamic = "force-dynamic";

/** Chega-se aqui pelo link do e-mail (convite ou redefinição), já com a sessão criada em /auth/confirm. */
export default async function SetPasswordPage({ searchParams }: PageProps<"/definir-senha">) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/inicio";
  const context = await getSessionContext();
  if (!context) {
    return (
      <AuthShell title="Link inválido" description="Este link expirou ou já foi usado.">
        <div className="flex gap-3 text-sm">
          <Link href="/esqueci-senha" className="text-brand-cyan-700 underline">Pedir um novo link</Link>
          <Link href="/login" className="text-muted-foreground underline">Ir para o login</Link>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Definir senha" description={<>Escolha a senha da conta <span className="font-mono">{context.email}</span>.</>}>
      <SetPasswordForm next={next} />
    </AuthShell>
  );
}
