import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Esqueci minha senha"
      description="Informe seu e-mail de login. Se ele estiver cadastrado, enviaremos um link para criar uma nova senha."
    >
      <ForgotPasswordForm />
      <p className="mt-6 text-sm">
        <Link href="/login" className="text-muted-foreground underline">Voltar ao login</Link>
      </p>
    </AuthShell>
  );
}
