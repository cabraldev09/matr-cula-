export interface Polo {
  code: string;
  name: string;
}

/**
 * Unidades (polos) de atendimento. Cada empresa cadastra as suas em Configurações → Análise: geral;
 * não há lista fixa na plataforma.
 */
export const POLOS: readonly Polo[] = [];

export function findPolo(code: string | null | undefined): Polo | null {
  if (!code) return null;
  return POLOS.find((p) => p.code === code) ?? null;
}

export function isPoloCode(code: string): boolean {
  return findPolo(code) !== null;
}

/** "2085 · Centro" */
export function formatPolo(code: string | null | undefined, name?: string | null): string {
  if (!code) return "—";
  return `${code} · ${name ?? findPolo(code)?.name ?? "Unidade não cadastrada"}`;
}
