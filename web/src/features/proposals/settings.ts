import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseProposalRules, type LogoSource } from "@/domain/proposal/document";
import { DEFAULT_PROPOSAL_RULES, type ProposalRules } from "@/domain/proposal/pricing";
import { publicSupabaseConfig } from "@/lib/supabase/config";

export const PRESET_LOGOS = {
  preset_cruzeiro: { label: "Cruzeiro do Sul Virtual", file: "presets/cruzeiro-do-sul-virtual.png" },
} as const;

export interface ProposalSettings {
  institutionName: string;
  institutionDocument: string;
  logoSource: LogoSource;
  logoPath: string | null;
  rules: ProposalRules;
  projectionNote: string;
  finalMessage: string;
  pixKey: string | null;
  pixMerchantName: string | null;
  pixCity: string | null;
}

const DEFAULT_NOTE =
  "Apresente ao aluno uma faixa de planejamento: 5% é o cenário anual mínimo e 11% é o teto. A projeção é uma estimativa de planejamento, não uma promessa de mensalidade futura.";

/** Configurações da proposta da empresa, com os padrões do modelo quando ainda não foram salvas. */
export async function loadProposalSettings(supabase: SupabaseClient, organizationId: string, fallbackName: string): Promise<ProposalSettings> {
  const { data } = await supabase.from("proposal_settings").select("*").eq("organization_id", organizationId).maybeSingle();
  return {
    institutionName: (data?.institution_name as string) || fallbackName,
    institutionDocument: (data?.institution_document as string) ?? "",
    logoSource: (data?.logo_source as LogoSource) ?? "none",
    logoPath: (data?.logo_path as string | null) ?? null,
    rules: data ? parseProposalRules(data.rules) : DEFAULT_PROPOSAL_RULES,
    projectionNote: (data?.projection_note as string) ?? DEFAULT_NOTE,
    finalMessage: (data?.final_message as string) ?? "Condições válidas na data de hoje.",
    pixKey: (data?.pix_key as string | null) ?? null,
    pixMerchantName: (data?.pix_merchant_name as string | null) ?? null,
    pixCity: (data?.pix_city as string | null) ?? null,
  };
}

/** URL pública da logo da proposta (para HTML). */
export function proposalLogoUrl(logo: { source: LogoSource; path: string | null }): string | null {
  if (logo.source === "preset_cruzeiro") return `/${PRESET_LOGOS.preset_cruzeiro.file}`;
  if (logo.source === "upload" && logo.path) return `${publicSupabaseConfig().url}/storage/v1/object/public/branding/${logo.path}`;
  return null;
}

/** Bytes da logo para o PDF (o gerador aceita PNG/JPG). */
export async function proposalLogoBytes(logo: { source: LogoSource; path: string | null }): Promise<Buffer | null> {
  try {
    if (logo.source === "preset_cruzeiro") {
      return await readFile(path.join(process.cwd(), "public", PRESET_LOGOS.preset_cruzeiro.file));
    }
    if (logo.source === "upload" && logo.path) {
      const response = await fetch(proposalLogoUrl(logo)!, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return null;
      const type = response.headers.get("content-type") ?? "";
      if (!/image\/(png|jpe?g)/.test(type)) return null;
      return Buffer.from(await response.arrayBuffer());
    }
  } catch {
    return null;
  }
  return null;
}
