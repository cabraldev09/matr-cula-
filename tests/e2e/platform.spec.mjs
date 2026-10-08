import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:56421") throw new Error("E2E requires the dedicated local Supabase");
const admin = createClient(status.API_URL, status.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

test("signup, empty company, trial, attendance end to end and suspension", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let organizationId;
  try {
    // Cadastro cria a conta e a empresa vazia, sem módulos.
    await page.goto("/cadastro");
    await page.getByLabel("Seu nome").fill("Ana Silva");
    await page.getByLabel("Nome da empresa").fill(`Escola ${suffix}`);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha").fill(password);
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByRole("heading", { name: "Plano e faturas" })).toBeVisible();
    await expect(page.getByText("Escolha um plano para liberar os módulos")).toBeVisible();
    const user = (await admin.from("profiles").select("id").eq("display_name", "Ana Silva").order("created_at", { ascending: false }).limit(1).single()).data;
    organizationId = (await admin.from("memberships").select("organization_id").eq("user_id", user.id).single()).data.organization_id;

    // Teste grátis do plano Completo libera os módulos.
    await page.getByRole("button", { name: /Testar grátis/ }).last().click();
    await expect(page.getByRole("heading", { name: /Olá, Ana/ })).toBeVisible();
    await expect(page.getByText("Contratado")).toHaveCount(4);

    // Atendimento: canal de teste, mensagem do cliente, assumir e responder.
    await page.goto("/atendimento/canais");
    await page.getByLabel("Nome do canal").fill("Canal E2E");
    await page.getByRole("button", { name: "Criar canal" }).click();
    await expect(page.getByLabel("Telefone do cliente de teste")).toBeVisible();
    await page.getByLabel("Telefone do cliente de teste").fill("5569988887777");
    await page.getByLabel("Nome do cliente de teste").fill("Cliente E2E");
    await page.getByLabel("Mensagem de teste").fill("Quero me matricular");
    await page.getByRole("button", { name: "Receber mensagem de teste" }).click();
    await page.goto("/atendimento");
    await page.getByRole("button", { name: /Cliente E2E/ }).click();
    await page.getByRole("button", { name: "Assumir" }).click();
    await expect(page.getByText(/Com você/)).toBeVisible();
    const reply = page.getByPlaceholder(/Escreva a resposta/);
    await reply.fill("Olá! Vamos começar sua matrícula.");
    await reply.press("Enter");
    await expect(page.getByText("Olá! Vamos começar sua matrícula.")).toBeVisible();

    // Suspensão pela plataforma: os módulos somem e o atendimento fica bloqueado.
    await admin.from("subscriptions").update({ status: "suspended" }).eq("organization_id", organizationId);
    await page.goto("/inicio");
    await expect(page.getByText("Não incluído")).toHaveCount(4);
    await page.goto("/atendimento");
    await expect(page).toHaveURL(/\/conta\/plano/);
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    const account = data?.users.find((u) => u.email === email);
    if (account) await admin.auth.admin.deleteUser(account.id);
  }
});
