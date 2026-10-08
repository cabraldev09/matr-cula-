import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PortalAuthShell } from "@/features/student-portal/auth-shell";
import { PORTAL_ORGANIZATION_COOKIE } from "@/features/auth/constants";
import { getPortalOrganizationById } from "@/services/student-portal/portal-organization";

export const dynamic = "force-dynamic";

/** Sem empresa conhecida não há como saber qual portal abrir: o aluno usa o link da instituição. */
export default async function StudentLoginPage() {
  const id = (await cookies()).get(PORTAL_ORGANIZATION_COOKIE)?.value;
  const organization = id ? await getPortalOrganizationById(id) : null;
  if (organization) redirect(`/p/${organization.slug}`);
  return (
    <PortalAuthShell title="Entre pelo link da sua instituição" description="Cada instituição tem um endereço próprio para o portal do aluno. Use o link enviado no seu convite ou peça o endereço à secretaria." >
      <p className="text-sm text-slate-500">O link tem o formato <span className="font-mono">/p/nome-da-instituicao</span>.</p>
    </PortalAuthShell>
  );
}
