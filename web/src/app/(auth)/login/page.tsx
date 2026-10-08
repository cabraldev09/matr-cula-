import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const passwordSet = params.senha === "ok";
  return (
    <AuthShell title="Entrar" description="Acesse a conta da sua empresa.">
      {passwordSet && (
        <p className="mb-4 rounded-md bg-status-success-bg px-3 py-2 text-sm text-status-success">Senha definida. Entre com seu e-mail e a nova senha.</p>
      )}
      <LoginForm next={next} />
    </AuthShell>
  );
}
