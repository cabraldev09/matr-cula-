import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { requireContextModule } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CoursesManager } from "@/features/crm/courses-manager";
import type { Course } from "@/features/crm/labels";

export const metadata: Metadata = { title: "Cursos e preços" };
export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  const context = await requireContextModule("crm");
  if (!["owner", "admin"].includes(context.organization.role)) redirect("/crm");
  const { data } = await (await createClient())
    .from("courses")
    .select("id, name, modality, semesters, gross_monthly_cents, default_first_monthly_cents, active")
    .eq("organization_id", context.organization.organizationId)
    .order("name");
  return (
    <>
      <PageHeader eyebrow="CRM" title="Cursos e preços" description="Tabela usada nas propostas. O nome do curso também é reconhecido automaticamente nas mensagens dos leads." />
      <CoursesManager organizationId={context.organization.organizationId} courses={(data ?? []) as Course[]} />
    </>
  );
}
