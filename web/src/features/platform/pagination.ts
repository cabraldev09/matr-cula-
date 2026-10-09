export const PAGE_SIZE = 25;

/** Número da página pedido na URL (1 por padrão, nunca menor que 1). */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(typeof value === "string" ? value : "1");
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

export function pageRange(page: number, size = PAGE_SIZE): { from: number; to: number } {
  return { from: (page - 1) * size, to: page * size - 1 };
}

export function totalPages(count: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(count / size));
}

/** Endereço da página com os mesmos filtros; vazios são omitidos. */
export function pageHref(base: string, params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "" && !(key === "pagina" && value === 1)) qs.set(key, String(value));
  const text = qs.toString();
  return text ? `${base}?${text}` : base;
}
