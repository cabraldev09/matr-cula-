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

test("destructive actions ask first in an alert dialog and honor Cancel", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-confirm-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  const errors = [];
  const nativeDialogs = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => { nativeDialogs.push(dialog.message()); dialog.dismiss(); });
  let organizationId;
  let userId;
  try {
    userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
    const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await owner.auth.signInWithPassword({ email, password });
    organizationId = (await owner.rpc("create_organization", { org_name: `Polo ${suffix}`, display_name: "Gestora Confirma" })).data;
    await activatePlan(admin, organizationId, "completo");
    await admin.from("contacts").insert({ organization_id: organizationId, name: "Contato Descartável", phone: "5569930000001" });
    await admin.from("quick_answers").insert({ organization_id: organizationId, shortcut: "oi", body: "Olá! Como posso ajudar?" });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/inicio/);

    // Contato: cancelar mantém, confirmar exclui.
    await page.goto("/atendimento/contatos");
    await page.getByRole("button", { name: "Excluir Contato Descartável" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Excluir Contato Descartável?");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Contato Descartável")).toBeVisible();
    await page.getByRole("button", { name: "Excluir Contato Descartável" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Contato excluído.")).toBeVisible();
    expect((await admin.from("contacts").select("id").eq("organization_id", organizationId)).data).toEqual([]);

    // Resposta rápida: antes excluía sem perguntar.
    await page.goto("/atendimento/configuracoes");
    await page.getByRole("button", { name: "Excluir /oi" }).click();
    await expect(page.getByRole("alertdialog")).toContainText("Excluir a resposta /oi?");
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect((await admin.from("quick_answers").select("id").eq("organization_id", organizationId)).data).toHaveLength(1);
    await page.getByRole("button", { name: "Excluir /oi" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
    await expect.poll(async () => (await admin.from("quick_answers").select("id").eq("organization_id", organizationId)).data.length).toBe(0);

    expect(nativeDialogs).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
