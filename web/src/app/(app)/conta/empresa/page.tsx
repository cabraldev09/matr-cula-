import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/app-url";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { LogoForm, OrganizationForm } from "@/features/organization/organization-form";

export const metadata: Metadata = { title: "Empresa" };
export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const context = await getSessionContext();
  if (!context) redirect("/login");
  if (!context.organization) redirect("/onboarding");
  const organization = context.organization;
  if (organization.role !== "owner" && organization.role !== "admin") redirect("/inicio?forbidden=1");
  const { data } = await (await createClient()).from("organizations").select("email_domain").eq("id", organization.organizationId).single();
  const logoUrl = organization.logoPath ? `${publicSupabaseConfig().url}/storage/v1/object/public/branding/${organization.logoPath}` : null;
  const portalUrl = appUrl(`/p/${organization.slug}`);
  const hasPortal = context.entitlements?.modules.includes("portal_aluno");
  return (
    <>
      <PageHeader eyebrow="Configurações" title="Empresa" description="Dados e marca da sua empresa. Cada empresa tem um espaço próprio e isolado." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Dados</CardTitle>
          </CardHeader>
          <CardContent>
            <OrganizationForm
              initial={{ name: organization.name, brandColor: organization.brandColor, timezone: organization.timezone, emailDomain: (data?.email_domain as string | null) ?? "" }}
            />
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Logo</CardTitle>
              <CardDescription>Sua marca no lugar da marca da plataforma.</CardDescription>
            </CardHeader>
            <CardContent>
              <LogoForm logoUrl={logoUrl} name={organization.name} />
            </CardContent>
          </Card>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Portal do aluno</CardTitle>
              <CardDescription>
                {hasPortal ? "Endereço para os alunos entrarem. Compartilhe com eles." : "Disponível nos planos com o módulo Portal do aluno."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hasPortal ? (
                <Link href={`/p/${organization.slug}`} className="break-all font-mono text-sm text-brand-cyan-700 underline">{portalUrl}</Link>
              ) : (
                <Link href="/conta/plano?modulo=portal_aluno" className="text-sm text-brand-cyan-700 underline">Ver planos</Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
