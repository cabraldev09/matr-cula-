import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createPool } from "../../services/messaging/engine.mjs";
import { activatePlan } from "../helpers/plans.mjs";
const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:56421") throw new Error("E2E requires the dedicated local Supabase");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);

test("platform admin changes a company's plan, status and add-ons through the select lists", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const adminEmail = `e2e-admin-${suffix}@example.test`;
  const ownerEmail = `e2e-owner-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  const pool = createPool(status.DB_URL);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let adminId;
  let ownerId;
  let organizationId;
  let adminOrganizationId;
  try {
    adminId = (await admin.auth.admin.createUser({ email: adminEmail, password, email_confirm: true })).data.user.id;
    ownerId = (await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true })).data.user.id;
    await pool.query("insert into private.platform_admins(user_id) values ($1)", [adminId]);
    // O administrador da plataforma também precisa ter uma empresa para entrar no sistema.
    const adminClient = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await adminClient.auth.signInWithPassword({ email: adminEmail, password });
    adminOrganizationId = (await adminClient.rpc("create_organization", { org_name: `Admin ${suffix}`, display_name: "Admin Plataforma" })).data;
    const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await owner.auth.signInWithPassword({ email: ownerEmail, password });
    organizationId = (await owner.rpc("create_organization", { org_name: `Empresa ${suffix}`, display_name: "Dono Alvo" })).data;
    await activatePlan(admin, organizationId, "atendimento");

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(adminEmail);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/(inicio|admin|onboarding)/);
    await page.goto(`/admin/empresas/${organizationId}`);

    // Trocar plano e situação pelas listas novas e salvar.
    await page.getByRole("combobox", { name: "Plano" }).click();
    await page.getByRole("option", { name: "Completo" }).click();
    await page.getByRole("combobox", { name: "Situação" }).click();
    await page.getByRole("option", { name: "Suspensa (sem acesso)" }).click();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect.poll(async () => {
      const { data } = await admin.from("subscriptions").select("status, plan_id").eq("organization_id", organizationId).single();
      const plan = data ? (await admin.from("plans").select("code").eq("id", data.plan_id).single()).data : null;
      return `${plan?.code}/${data?.status}`;
    }).toBe("completo/suspended");

    // Módulo avulso: escolhe o módulo na lista e libera.
    await page.getByRole("combobox", { name: "Módulo" }).click();
    await page.getByRole("option", { name: "Chatbot" }).click();
    await page.getByRole("button", { name: "Liberar" }).click();
    await expect.poll(async () => (await admin.from("organization_addons").select("module").eq("organization_id", organizationId)).data?.map((r) => r.module)).toContain("chatbot");

    // Lista de empresas: filtro por situação e busca pelo nome.
    await page.goto(`/admin/empresas?situacao=suspended&q=Empresa+${suffix}`);
    await expect(page.getByRole("link", { name: `Empresa ${suffix}` })).toBeVisible();
    await expect(page.getByText("1 empresa", { exact: true })).toBeVisible();
    await page.goto(`/admin/empresas?situacao=active&q=Empresa+${suffix}`);
    await expect(page.getByText("Nenhuma empresa encontrada.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Filtrar por situação" }).getByRole("link", { name: "Ativa" })).toHaveAttribute("aria-current", "true");
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (adminOrganizationId) await admin.from("organizations").delete().eq("id", adminOrganizationId);
    if (adminId) {
      await pool.query("delete from private.platform_admins where user_id = $1", [adminId]);
      await admin.auth.admin.deleteUser(adminId);
    }
    if (ownerId) await admin.auth.admin.deleteUser(ownerId);
    await pool.end();
  }
});
