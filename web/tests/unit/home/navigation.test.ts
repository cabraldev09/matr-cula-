import { describe, expect, it } from "vitest";
import { buildCrumbs, isNavVisible, type NavContext } from "@/components/layout/nav-items";
import { destinationsFor, filterDestinations } from "@/components/layout/command-palette";

const manager: NavContext = { role: null, modules: ["crm", "atendimento"], manager: true, platformAdmin: false };
const agent: NavContext = { role: null, modules: ["crm", "atendimento"], manager: false, platformAdmin: false };

describe("navegação", () => {
  it("monta a trilha a partir do endereço", () => {
    expect(buildCrumbs("/inicio")).toEqual([]);
    expect(buildCrumbs("/crm")).toEqual([{ label: "CRM" }, { label: "Funil de matrículas", href: "/crm" }]);
    expect(buildCrumbs("/crm/propostas")).toEqual([{ label: "CRM" }, { label: "Propostas", href: "/crm/propostas" }]);
    expect(buildCrumbs("/atendimento/contatos")).toEqual([{ label: "Atendimento" }, { label: "Contatos", href: "/atendimento/contatos" }]);
    expect(buildCrumbs("/analyses/123")).toEqual([{ label: "Análise curricular" }, { label: "Análises", href: "/analyses" }, { label: "Detalhe" }]);
    expect(buildCrumbs("/conta/plano")).toEqual([{ label: "Configurações" }, { label: "Plano e faturas", href: "/conta/plano" }]);
    expect(buildCrumbs("/pagina-que-nao-existe")).toEqual([]);
  });

  it("respeita módulo e papel na visibilidade", () => {
    expect(isNavVisible({ module: "crm" }, manager)).toBe(true);
    expect(isNavVisible({ module: "analise_curricular" }, manager)).toBe(false);
    expect(isNavVisible({ managerOnly: true }, agent)).toBe(false);
    expect(isNavVisible({ managerOnly: true }, manager)).toBe(true);
  });

  it("a paleta só oferece o que o usuário pode abrir e busca sem acento", () => {
    const managerPages = destinationsFor(manager).map((p) => p.href);
    const agentPages = destinationsFor(agent).map((p) => p.href);
    expect(managerPages).toContain("/crm/configuracoes");
    expect(agentPages).not.toContain("/crm/configuracoes");
    expect(managerPages).not.toContain("/analyses");
    expect(filterDestinations(destinationsFor(manager), "proposta").map((p) => p.href)).toContain("/crm/propostas");
    expect(filterDestinations(destinationsFor(manager), "ATENDIMENTO").length).toBeGreaterThan(2);
    expect(filterDestinations(destinationsFor(manager), "xyz-nada")).toEqual([]);
  });
});
