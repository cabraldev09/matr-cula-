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

test("navigation: Ctrl+K palette finds pages and leads, breadcrumbs, and the remembered sidebar mode", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-nav-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let organizationId;
  let userId;
  try {
    userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
    const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await owner.auth.signInWithPassword({ email, password });
    organizationId = (await owner.rpc("create_organization", { org_name: `Polo ${suffix}`, display_name: "Gestora Menu" })).data;
    await activatePlan(admin, organizationId, "completo");
    const contact = (await admin.from("contacts").insert({ organization_id: organizationId, name: "Zuleica Procurada", phone: "5569940000001" }).select("id").single()).data;
    const lead = (await admin.from("leads").insert({ organization_id: organizationId, contact_id: contact.id, source: "manual" }).select("id").single()).data;

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/inicio/);

    // Migalhas no desktop.
    await page.goto("/crm/propostas");
    const crumbs = page.getByRole("navigation", { name: "Você está em" });
    await expect(crumbs).toContainText("Início");
    await expect(crumbs).toContainText("CRM");
    await expect(crumbs.getByText("Propostas")).toHaveAttribute("aria-current", "page");

    // Paleta: página por nome sem acento.
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog");
    await palette.getByRole("combobox").fill("PAGAMENTOS");
    await expect(palette.getByRole("option", { name: "Proposta e pagamentos" })).toBeVisible();
    await palette.getByRole("combobox").fill("proposta e pag");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/crm\/configuracoes/);

    // Paleta: lead pelo nome abre a ficha do lead no funil.
    await page.keyboard.press("Control+k");
    await page.getByRole("dialog").getByRole("combobox").fill("zulei");
    await page.getByRole("option", { name: /Zuleica Procurada/ }).click();
    await expect(page).toHaveURL(new RegExp(`/crm\\?lead=${lead.id}`));
    await expect(page.getByRole("dialog")).toContainText("Zuleica Procurada");
    await page.keyboard.press("Escape");

    // Menu: recolher e lembrar depois de recarregar.
    const sidebar = page.locator("aside[data-sidebar]");
    await page.getByRole("button", { name: "Expandir ou recolher menu lateral" }).click();
    await expect(sidebar).toHaveClass(/w-16/);
    await page.reload();
    await expect(page.locator("aside[data-sidebar]")).toHaveClass(/w-16/);
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
