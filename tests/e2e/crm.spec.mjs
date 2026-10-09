import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { activatePlan } from "../helpers/plans.mjs";
const require = createRequire(new URL("../../frontend/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (status.API_URL !== "http://127.0.0.1:56421") throw new Error("E2E requires the dedicated local Supabase");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);

test("WhatsApp message becomes a lead, gets a scholarship proposal and pays the enrollment fee", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-crm-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let organizationId;
  let userId;
  try {
    userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
    const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await owner.auth.signInWithPassword({ email, password });
    organizationId = (await owner.rpc("create_organization", { org_name: `Polo ${suffix}`, display_name: "Gestora E2E" })).data;
    await activatePlan(admin, organizationId, "completo");
    await admin.from("proposal_settings").insert({ organization_id: organizationId, institution_name: `Polo ${suffix}`, pix_key: "pix@polo.test", pix_merchant_name: "Polo E2E", pix_city: "Porto Velho" });

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/inicio/);

    // Tabela de cursos do polo.
    await page.goto("/crm/cursos");
    // Planilha .xlsx pela área de envio: a prévia mostra o que entra antes de gravar.
    await page.getByLabel("Arquivo da planilha de cursos").setInputFiles(fileURLToPath(new URL("../fixtures/cursos.xlsx", import.meta.url)));
    await expect(page.getByText("2 linha(s) prontas")).toBeVisible();
    await page.getByRole("button", { name: /^Importar 2$/ }).click();
    await expect(page.getByText("69,77%")).toBeVisible();

    // Mensagem no WhatsApp (canal de teste) cria o lead na hora, com o curso reconhecido.
    await page.goto("/atendimento/canais");
    await page.getByLabel("Nome do canal").fill("WhatsApp E2E");
    await page.getByRole("button", { name: "Criar canal" }).click();
    await page.getByLabel("Telefone do cliente de teste").fill("5569977770000");
    await page.getByLabel("Nome do cliente de teste").fill("Maira E2E");
    await page.getByLabel("Mensagem de teste").fill("Oi! Quero fazer biomedicina, tem bolsa?");
    await page.getByRole("button", { name: "Receber mensagem de teste" }).click();
    await expect(page.getByText("Mensagem de teste recebida. Veja em Conversas.")).toBeVisible();

    await page.goto("/crm");
    const card = page.getByRole("button", { name: /Maira E2E/ });
    await expect(card).toContainText("Biomedicina");
    await expect(page.getByRole("region", { name: "Novo lead" })).toContainText("Maira E2E");

    // Tela própria da proposta, com os valores do modelo da Biomedicina.
    await card.click();
    await page.getByRole("dialog").getByRole("link", { name: "Proposta", exact: true }).click();
    await expect(page).toHaveURL(/\/crm\/leads\/[0-9a-f-]+\/proposta/);
    await expect(page.getByText("69,77%").first()).toBeVisible();
    await expect(page.locator("#tier-untilDue")).toHaveValue("306,75");
    await expect(page.locator("#tier-lateTier1")).toHaveValue("352,76");
    await expect(page.locator("#tier-lateTier2")).toHaveValue("383,44");
    await page.getByRole("button", { name: "Salvar proposta" }).click();
    await expect(page.getByText("Proposta nº 1 criada.")).toBeVisible();
    const { data: proposal } = await admin.from("proposals").select("public_token").eq("organization_id", organizationId).single();

    // Volta para o lead e cobra a taxa por Pix, com confirmação manual.
    await page.getByRole("link", { name: "Cancelar" }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("tab", { name: "Matrículas e pagamentos" }).click();
    await sheet.getByRole("button", { name: "Gerar Pix" }).click();
    await expect(sheet.getByText(/^00020126/)).toBeVisible();
    await sheet.getByRole("button", { name: "Marcar como pago" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Sim, já entrou" }).click();
    await expect(page.getByText(/Pagamento confirmado/)).toBeVisible();
    await expect.poll(async () => (await admin.from("leads").select("stage").eq("organization_id", organizationId).single()).data.stage).toBe("taxa_paga");

    // Página pública da proposta, sem login.
    await page.context().clearCookies();
    await page.goto(`/proposta/${proposal.public_token}`);
    await expect(page.getByRole("heading", { name: "Proposta de Bolsa - Biomedicina" })).toBeVisible();
    for (const value of ["R$ 1.014,70", "69,77%", "R$ 306,75", "R$ 352,76", "R$ 383,44", "R$ 99,00"]) await expect(page.getByText(value).first()).toBeVisible();
    const pdf = await page.request.get(`/proposta/${proposal.public_token}/pdf`);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
