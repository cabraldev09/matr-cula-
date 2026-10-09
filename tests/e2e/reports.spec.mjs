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

test("reports: charts, previous-period comparison and the period filter", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-reports-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let organizationId;
  let userId;
  try {
    userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
    const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await owner.auth.signInWithPassword({ email, password });
    organizationId = (await owner.rpc("create_organization", { org_name: `Polo ${suffix}`, display_name: "Gestora Relatório" })).data;
    await activatePlan(admin, organizationId, "completo");
    for (const [name, phone] of [["Lead Um", "5569960000001"], ["Lead Dois", "5569960000002"]]) {
      const contact = (await admin.from("contacts").insert({ organization_id: organizationId, name, phone }).select("id").single()).data;
      await admin.from("leads").insert({ organization_id: organizationId, contact_id: contact.id, source: "manual", owner_id: userId });
    }

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/inicio/);
    await page.goto("/relatorios");

    await expect(page.getByRole("heading", { name: "Relatórios" })).toBeVisible();
    await expect(page.getByText("Funil de matrículas · Este mês")).toBeVisible();
    await expect(page.getByText("Leads no período").locator("..")).toContainText("2");
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
    // Sem leads no período anterior, a variação aparece como "novo".
    await expect(page.getByText("novo").first()).toBeVisible();

    // Abas por módulo contratado.
    await page.getByRole("tab", { name: "Atendimento" }).click();
    await expect(page.getByText("Atendimento · Este mês")).toBeVisible();

    // Período pronto muda a URL e o título.
    await page.getByRole("combobox", { name: "Período" }).click();
    await page.getByRole("option", { name: "Últimos 30 dias" }).click();
    await expect(page).toHaveURL(/periodo=30d/);
    await expect(page.getByText("Últimos 30 dias").first()).toBeVisible();

    // Datas próprias: campos aparecem e o botão só vale com intervalo correto.
    await page.getByRole("combobox", { name: "Período" }).click();
    await page.getByRole("option", { name: "Datas próprias" }).click();
    await page.getByLabel("De", { exact: true }).fill("2026-01-01");
    await page.getByLabel("Até", { exact: true }).fill("2025-12-01");
    await expect(page.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    await page.getByLabel("Até", { exact: true }).fill("2026-01-31");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page).toHaveURL(/de=2026-01-01&ate=2026-01-31/);
    await expect(page.getByText("Período escolhido").first()).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
