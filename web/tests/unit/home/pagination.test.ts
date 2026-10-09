import { describe, expect, it } from "vitest";
import { pageHref, pageRange, parsePage, totalPages } from "@/features/platform/pagination";

describe("paginação do painel", () => {
  it("lê a página da URL com segurança", () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-2")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage(["4"])).toBe(1);
  });

  it("calcula faixa e total de páginas", () => {
    expect(pageRange(1)).toEqual({ from: 0, to: 24 });
    expect(pageRange(3)).toEqual({ from: 50, to: 74 });
    expect(totalPages(0)).toBe(1);
    expect(totalPages(25)).toBe(1);
    expect(totalPages(26)).toBe(2);
  });

  it("monta o endereço sem parâmetros vazios nem página 1", () => {
    expect(pageHref("/admin/empresas", { q: "", situacao: "", pagina: 1 })).toBe("/admin/empresas");
    expect(pageHref("/admin/empresas", { q: "polo", situacao: "active", pagina: 2 })).toBe("/admin/empresas?q=polo&situacao=active&pagina=2");
  });
});
