import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/features/auth/auth-shell";
import { CreateOrganizationForm } from "@/features/auth/signup-form";
import { getSessionContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sua empresa" };
export const dynamic = "force-dynamic";

/** Primeira empresa da conta (ou uma adicional, com ?nova=1). */
export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const params = await searchParams;
  const context = await getSessionContext();
  if (!context) redirect("/login?next=/onboarding");
  if (context.organization && params.nova !== "1") redirect("/inicio");
  const { data } = await (await createClient()).auth.getUser();
  const pendingCompany = typeof data.user?.user_metadata?.pending_company === "string" ? data.user.user_metadata.pending_company : undefined;
  const name = typeof data.user?.user_metadata?.display_name === "string" ? data.user.user_metadata.display_name : context.displayName;
  return (
    <AuthShell
      title={context.organization ? "Nova empresa" : "Crie sua empresa"}
      description="Cada empresa tem dados, equipe e plano próprios. Ninguém de fora vê o que acontece nela."
    >
      <CreateOrganizationForm defaultName={name} defaultCompany={context.organization ? undefined : pendingCompany} />
    </AuthShell>
  );
}
