import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { activatePlan } from "../helpers/plans.mjs";
const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:56421") throw new Error("E2E requires the dedicated local Supabase");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);

test("proposal settings: unsaved bar, field validation and saved values survive a reload", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-settings-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let organizationId;
  let userId;
  try {
    userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
    const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await owner.auth.signInWithPassword({ email, password });
    organizationId = (await owner.rpc("create_organization", { org_name: `Polo ${suffix}`, display_name: "Gestora Config" })).data;
    await activatePlan(admin, organizationId, "completo");

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/inicio/);
    await page.goto("/crm/configuracoes");

    const bar = page.getByRole("status").filter({ hasText: "Alterações não salvas" });
    await expect(bar).toBeHidden();

    // Mexer em qualquer campo mostra a barra; trocar de aba não perde o que foi digitado.
    await page.getByLabel("Instituição").fill("Polo Teste Config");
    await expect(bar).toBeVisible();
    await page.getByRole("tab", { name: "Condições" }).click();
    await page.getByLabel("Vencimento (dia)").fill("31");
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(page.getByText("Dia de 1 a 28.")).toBeVisible();

    // Corrigido, salva. Pix completo na aba de recebimento.
    await page.getByLabel("Vencimento (dia)").fill("12");
    await page.getByRole("tab", { name: "Recebimento" }).click();
    await page.getByLabel("Chave Pix").fill("pix@config.test");
    await page.getByLabel("Nome do recebedor").fill("Polo Config");
    await page.getByLabel("Cidade do recebedor").fill("Porto Velho");
    await page.getByRole("button", { name: "Salvar configurações" }).click();
    await expect(page.getByText("Configurações da proposta salvas.")).toBeVisible();
    await expect(bar).toBeHidden();

    await page.reload();
    await expect(page.getByLabel("Instituição")).toHaveValue("Polo Teste Config");
    await page.getByRole("tab", { name: "Condições" }).click();
    await expect(page.getByLabel("Vencimento (dia)")).toHaveValue("12");
    const saved = (await admin.from("proposal_settings").select("institution_name, pix_key, rules").eq("organization_id", organizationId).single()).data;
    expect(saved.institution_name).toBe("Polo Teste Config");
    expect(saved.pix_key).toBe("pix@config.test");
    expect(saved.rules.dueDay).toBe(12);
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
