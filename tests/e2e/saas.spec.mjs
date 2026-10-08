import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../frontend/package.json", import.meta.url)
);
const { createClient } = require("@supabase/supabase-js");
const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
);
if (status.API_URL !== "http://127.0.0.1:56421")
  throw new Error("E2E requires dedicated localhost Supabase");
const admin = createClient(status.API_URL, status.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("create company, contacts, teams, tags, invitations and an internal conversation", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8),
    email = `browser-${suffix}@example.test`,
    password = `Pass-${randomUUID()}!`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  let org;
  try {
    await page.goto("/saas");
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.getByLabel("Seu nome", { exact: true }).fill("Ana Silva");
    await page
      .getByLabel("Nome da empresa", { exact: true })
      .fill(`Empresa ${suffix}`);
    await page.getByRole("button", { name: "Criar meu espaço" }).click();
    await expect(
      page.getByRole("heading", { name: "Prepare sua operação" })
    ).toBeVisible();
    org = (
      await admin
        .from("memberships")
        .select("organization_id")
        .eq("user_id", created.data.user.id)
        .single()
    ).data.organization_id;
    await page
      .getByRole("button", { name: "Departamentos", exact: true })
      .click();
    await page.getByLabel("Nome", { exact: true }).fill("Comercial");
    await page
      .getByLabel("Mensagem de boas-vindas")
      .fill("Olá! Como podemos ajudar?");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Comercial", exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "Contatos", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Cliente de teste");
    await page.getByLabel("Telefone").fill("5569999999999");
    await page
      .getByLabel("E-mail", { exact: true })
      .fill("cliente@example.test");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Cliente de teste", exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: "Etiquetas", exact: true }).click();
    await page.getByLabel("Nome", { exact: true }).fill("Interessado");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      page.getByRole("button", {
        name: "Excluir etiqueta Interessado",
        exact: true,
      })
    ).toBeVisible();
    await page.getByRole("button", { name: "Contatos", exact: true }).click();
    await page
      .getByLabel("Adicionar etiqueta a Cliente de teste")
      .selectOption({ label: "Interessado" });
    await expect(
      page.getByRole("button", { name: "Interessado ×" })
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Respostas rápidas", exact: true })
      .click();
    await page.getByLabel("Atalho").fill("ola");
    await page
      .getByLabel("Mensagem", { exact: true })
      .fill("Bem-vindo ao atendimento.");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("/ola", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Equipe e convites", exact: true })
      .click();
    await page
      .getByLabel("E-mail do destinatário")
      .fill(`convite-${suffix}@example.test`);
    await page.getByRole("button", { name: "Gerar convite" }).click();
    await expect(page.getByLabel("Link do convite")).toHaveValue(
      /saas\?invite=/
    );
    await page
      .getByRole("button", { name: "Atendimentos", exact: true })
      .click();
    await page.getByLabel("Assunto").fill("Dúvida sobre matrícula");
    await page
      .getByLabel("Contato", { exact: true })
      .selectOption({ label: "Cliente de teste" });
    await page
      .getByLabel("Departamento", { exact: true })
      .selectOption({ label: "Comercial" });
    await page
      .getByRole("button", { name: "Criar atendimento", exact: true })
      .click();
    await page.getByRole("button", { name: "Assumir", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Resolver", exact: true })
    ).toBeVisible();
    await page.getByRole("button", { name: /Dúvida sobre matrícula/ }).click();
    await page
      .getByLabel("Nota", { exact: true })
      .fill("Cliente pediu uma proposta.");
    await page.getByRole("button", { name: "Adicionar nota" }).click();
    await expect(
      page.getByText("Cliente pediu uma proposta.", { exact: true })
    ).toBeVisible();
    await page.screenshot({
      path: ".local/saas-atendimentos.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Visão geral", exact: true })
      .click();
    await page.screenshot({ path: ".local/saas-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator(".saas-sidebar")).toHaveCount(1);
    await page.screenshot({
      path: ".local/saas-mobile.png",
      animations: "disabled",
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
    expect(errors).toEqual([]);
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(
      page.getByRole("heading", { name: "Entre no seu espaço" })
    ).toBeVisible();
  } finally {
    if (org) {
      const removed = await admin.from("organizations").delete().eq("id", org);
      if (removed.error) throw removed.error;
    }
    const removed = await admin.auth.admin.deleteUser(created.data.user.id);
    if (removed.error) throw removed.error;
  }
});
