import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { publicSupabaseConfig } from "@/lib/supabase/config";

export interface PortalOrganization {
  id: string;
  slug: string;
  name: string;
  brandColor: string;
  logoUrl: string | null;
}

function logoUrl(path: string | null): string | null {
  return path ? `${publicSupabaseConfig().url}/storage/v1/object/public/branding/${path}` : null;
}

/** Dados públicos da empresa para a página do portal (nome, logo e cor). */
export const getPortalOrganizationBySlug = cache(async (slug: string): Promise<PortalOrganization | null> => {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return null;
  const { data } = await createAdminClient()
    .from("organizations")
    .select("id, slug, name, brand_color, logo_path")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, slug: data.slug, name: data.name, brandColor: data.brand_color, logoUrl: logoUrl(data.logo_path) };
});

export const getPortalOrganizationById = cache(async (id: string): Promise<PortalOrganization | null> => {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await createAdminClient()
    .from("organizations")
    .select("id, slug, name, brand_color, logo_path")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, slug: data.slug, name: data.name, brandColor: data.brand_color, logoUrl: logoUrl(data.logo_path) };
});
