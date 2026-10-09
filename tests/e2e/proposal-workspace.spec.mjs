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

test("proposal workspace: pick the course, adjust values for this lead, save and share", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-proposal-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let organizationId;
  let userId;
  try {
    userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
    const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await owner.auth.signInWithPassword({ email, password });
    organizationId = (await owner.rpc("create_organization", { org_name: `Polo ${suffix}`, display_name: "Gestora Proposta" })).data;
    await activatePlan(admin, organizationId, "completo");
    await admin.from("courses").insert([
      { organization_id: organizationId, name: "Biomedicina", modality: "Semipresencial - Graduação", semesters: 8, gross_monthly_cents: 101470, default_first_monthly_cents: 30675 },
      { organization_id: organizationId, name: "Administração", modality: "EAD - Graduação", semesters: 8, gross_monthly_cents: 75630, default_first_monthly_cents: 14990 },
    ]);
    const contact = (await admin.from("contacts").insert({ organization_id: organizationId, name: "Paula Proposta", phone: "5569920000001" }).select("id").single()).data;
    const lead = (await admin.from("leads").insert({ organization_id: organizationId, contact_id: contact.id, source: "manual", start_term: "2026.2" }).select("id").single()).data;

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/inicio/);
    await page.goto(`/crm/leads/${lead.id}/proposta`);

    // Sem curso no lead, os valores começam vazios e a prévia pede o curso.
    await expect(page.getByLabel("Aluno", { exact: true })).toHaveValue("Paula Proposta");
    await expect(page.getByText("Preencha curso, valores e início para ver a projeção.")).toBeVisible();
    await page.getByRole("button", { name: "Salvar proposta" }).click();
    await expect(page.locator("#f-courseName-error")).toHaveText("Escolha o curso ou informe o nome.");

    // Escolher o curso preenche tudo com os valores da tabela.
    await page.getByRole("combobox", { name: "Curso da tabela" }).click();
    await page.getByRole("option", { name: /Biomedicina/ }).click();
    await expect(page.getByLabel("Nome do curso na proposta", { exact: true })).toHaveValue("Biomedicina");
    await expect(page.locator("#tier-lateTier1")).toHaveValue("352,76");

    // Ajustes só para este lead: valor à mão, projeção parcial e observação.
    await page.locator("#tier-lateTier1").fill("36000");
    await expect(page.locator("#pct-lateTier1")).toHaveValue("17,36");
    await page.getByLabel("Observação da proposta", { exact: true }).fill("Condição especial para matrícula até sexta.");
    await page.getByLabel("Definir período da projeção", { exact: true }).click();
    await page.getByLabel("Primeiro semestre", { exact: true }).fill("2");
    await page.getByLabel("Último semestre", { exact: true }).fill("4");
    await page.getByLabel("Vencimento da 1ª mensalidade", { exact: true }).fill("2026-10-12");
    await page.getByRole("button", { name: "Salvar proposta" }).click();
    await expect(page.getByText("Proposta nº 1 criada.")).toBeVisible();
    await expect(page.getByText(/Nenhuma alteração pendente/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Salvar proposta" })).toBeDisabled();

    // Editar de novo habilita salvar (nova versão) e avisa da alteração pendente.
    await page.getByLabel("Mensagem final", { exact: true }).fill("Proposta válida por 3 dias.");
    await expect(page.getByText("Há alterações que ainda não foram salvas.")).toBeVisible();
    await page.getByRole("button", { name: "Salvar proposta" }).click();
    await expect(page.getByText("Proposta nº 2 criada.")).toBeVisible();

    // A página pública traz os ajustes: valor à mão, observação, data e só os semestres 2 a 4.
    const { data: proposals } = await admin.from("proposals").select("number, public_token, id").eq("organization_id", organizationId).order("number");
    expect(proposals).toHaveLength(2);
    await page.goto(`/proposta/${proposals[1].public_token}`);
    await expect(page.getByText("R$ 360,00").first()).toBeVisible();
    await expect(page.getByText("Condição especial para matrícula até sexta.")).toBeVisible();
    await expect(page.getByText("vencimento em 12/10/2026")).toBeVisible();
    await expect(page.getByText("Proposta válida por 3 dias.")).toBeVisible();
    await expect(page.locator("table tbody tr")).toHaveCount(3);

    // PDF da versão salva.
    const pdf = await page.request.get(`/proposta/${proposals[1].public_token}/pdf`);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
