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

test("home work panel: priorities from the queue and stale leads, empty state when all is well", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-home-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let organizationId;
  let userId;
  try {
    userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
    const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await owner.auth.signInWithPassword({ email, password });
    organizationId = (await owner.rpc("create_organization", { org_name: `Polo ${suffix}`, display_name: "Gestora Início" })).data;
    await activatePlan(admin, organizationId, "completo");

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/inicio/);

    // Sem leads nem fila, o painel diz que está tudo em dia.
    await expect(page.getByRole("heading", { name: "Agora" })).toBeVisible();
    await expect(page.getByText("Tudo em dia")).toBeVisible();

    // Um lead quente parado há 5 dias e uma conversa esperando entram nas prioridades.
    const contact = (await admin.from("contacts").insert({ organization_id: organizationId, name: "Carla Parada", phone: "5569950000001" }).select("id").single()).data;
    const lead = (await admin.from("leads").insert({ organization_id: organizationId, contact_id: contact.id, source: "manual", owner_id: userId, course_id: null, modality: "EAD - Graduação", entry_type: "enem", start_term: "2027.1", has_previous_studies: true, stage: "qualificado" }).select("id").single()).data;
    await admin.from("leads").update({ stage_changed_at: new Date(Date.now() - 5 * 86_400_000).toISOString() }).eq("id", lead.id);
    await admin.from("conversations").insert({ organization_id: organizationId, contact_id: contact.id, subject: "Quero saber do curso" });

    await page.reload();
    await expect(page.getByText("1 lead parado no funil")).toBeVisible();
    await expect(page.getByText("1 conversa esperando atendimento")).toBeVisible();
    await expect(page.getByRole("link", { name: /Carla Parada/ }).first()).toBeVisible();
    await expect(page.getByText("Uso do plano")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Seus módulos" })).toBeVisible();

    // Clicar na prioridade leva ao lugar certo.
    await page.getByRole("link", { name: /conversa esperando atendimento/ }).click();
    await expect(page).toHaveURL(/\/atendimento/);
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
