import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalAuthShell } from "@/features/student-portal/auth-shell";
import { LoginForm } from "@/features/auth/login-form";
import { getPortalOrganizationBySlug } from "@/services/student-portal/portal-organization";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const organization = await getPortalOrganizationBySlug((await params).slug);
  return { title: organization ? `Portal do aluno · ${organization.name}` : "Portal do aluno" };
}

/** Endereço público do portal do aluno de cada empresa (compartilhado pela instituição). */
export default async function OrganizationPortalPage({ params, searchParams }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const { senha } = await searchParams;
  const organization = await getPortalOrganizationBySlug(slug);
  if (!organization) notFound();
  return (
    <PortalAuthShell
      organization={organization}
      title="Acompanhe sua jornada."
      description="Entre com o e-mail ou RGM cadastrado pela equipe acadêmica para consultar sua análise e os próximos passos do curso."
    >
      {senha === "ok" && <p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Senha atualizada. Entre com sua nova senha.</p>}
      <LoginForm portalSlug={organization.slug} />
      <p className="mt-6 text-center text-sm text-slate-500">
        Primeiro acesso? <Link href="/portal/primeiro-acesso" className="underline">Veja como ativar</Link>
      </p>
    </PortalAuthShell>
  );
}
