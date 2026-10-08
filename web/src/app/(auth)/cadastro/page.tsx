import type { Metadata } from "next";
import { AuthShell } from "@/features/auth/auth-shell";
import { SignUpForm } from "@/features/auth/signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default async function SignUpPage({ searchParams }: PageProps<"/cadastro">) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : undefined;
  return (
    <AuthShell
      title="Criar conta"
      description={next ? "Crie sua conta para aceitar o convite." : "Sua empresa começa com um espaço vazio e só seu. Depois você escolhe o plano."}
    >
      <SignUpForm next={next} />
    </AuthShell>
  );
}
