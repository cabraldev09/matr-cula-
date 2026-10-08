import { cookies } from "next/headers";
import Link from "next/link";
import { PortalAuthShell } from "@/features/student-portal/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { PORTAL_ORGANIZATION_COOKIE } from "@/features/auth/constants";
import { getPortalOrganizationById } from "@/services/student-portal/portal-organization";

export const dynamic = "force-dynamic";

export default async function StudentRecoveryPage() {
  const id = (await cookies()).get(PORTAL_ORGANIZATION_COOKIE)?.value;
  const organization = id ? await getPortalOrganizationById(id) : null;
  return (
    <PortalAuthShell
      organization={organization}
      title="Recuperar acesso"
      description="Informe o e-mail cadastrado pela equipe acadêmica para receber as instruções de recuperação."
    >
      <ForgotPasswordForm />
      <Link href={organization ? `/p/${organization.slug}` : "/portal/login"} className="mt-6 block text-center text-sm text-[#003B71] underline">
        Voltar para entrar
      </Link>
    </PortalAuthShell>
  );
}
