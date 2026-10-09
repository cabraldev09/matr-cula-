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

/** Arrasta com o mouse em passos, como uma pessoa (o sensor só ativa depois de alguns pixels). */
async function drag(page, from, to) {
  await page.waitForTimeout(500); // deixa o quadro assentar (Realtime refaz a linha do cartão)
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + 20);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + 30, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + 80, { steps: 12 });
  await page.mouse.up();
}

test("funnel board: drag between stages, blocked automatic stages, loss reason, list view and URL filters", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8);
  const email = `e2e-board-${suffix}@example.test`;
  const password = `Pass-${randomUUID()}!`;
  // Janela larga: as 8 colunas precisam caber para o mouse alcançar todas.
  await page.setViewportSize({ width: 2700, height: 1000 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let organizationId;
  let userId;
  try {
    userId = (await admin.auth.admin.createUser({ email, password, email_confirm: true })).data.user.id;
    const owner = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    await owner.auth.signInWithPassword({ email, password });
    organizationId = (await owner.rpc("create_organization", { org_name: `Polo ${suffix}`, display_name: "Gestora Board" })).data;
    await activatePlan(admin, organizationId, "completo");
    const people = [
      ["Ana Quadro", "5569970000001", userId],
      ["Beto Quadro", "5569970000002", null],
    ];
    for (const [name, phone, ownerId] of people) {
      const contact = (await admin.from("contacts").insert({ organization_id: organizationId, name, phone }).select("id").single()).data;
      await admin.from("leads").insert({ organization_id: organizationId, contact_id: contact.id, source: "manual", owner_id: ownerId });
    }
    const stageOf = async (name) =>
      (await admin.from("leads").select("stage, lost_reason, contacts!inner(name)").eq("organization_id", organizationId).eq("contacts.name", name).single()).data;

    await page.goto("/login");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/inicio/);
    await page.goto("/crm");
    // O quadro fica em um contêiner de largura máxima; sem isso "Taxa paga" está fora da área visível.
    await page.addStyleTag({ content: ".max-w-7xl{max-width:none!important}" });

    const card = (name) => page.getByRole("button", { name: new RegExp(`^${name}`) }).first();
    const column = (label) => page.getByRole("region", { name: label });
    await expect(column("Novo lead")).toContainText("Ana Quadro");

    // Arrastar para uma etapa manual funciona e grava.
    await drag(page, card("Ana Quadro"), column("Em contato"));
    await expect.poll(async () => (await stageOf("Ana Quadro")).stage).toBe("contato");
    await expect(column("Em contato")).toContainText("Ana Quadro");

    // Etapas preenchidas pelo sistema não aceitam arrastar.
    await drag(page, card("Ana Quadro"), column("Taxa paga"));
    await expect(page.getByText(/preenchida sozinha quando o pagamento é confirmado/)).toBeVisible();
    expect((await stageOf("Ana Quadro")).stage).toBe("contato");

    // Perdido pede o motivo em um diálogo.
    await drag(page, card("Beto Quadro"), column("Perdido"));
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Marcar Beto Quadro como perdido");
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "Preço" }).click();
    await dialog.getByLabel(/Observação/).fill("achou cara");
    await dialog.getByRole("button", { name: "Marcar como perdido" }).click();
    await expect.poll(async () => (await stageOf("Beto Quadro")).lost_reason).toBe("Preço: achou cara");
    await expect(column("Perdido")).toContainText("Beto Quadro");

    // Filtros e visão ficam na URL e sobrevivem ao recarregamento.
    await page.getByRole("combobox", { name: "Filtrar por responsável" }).click();
    await page.getByRole("option", { name: "Meus leads" }).click();
    await page.getByRole("button", { name: "lista" }).click();
    await expect(page).toHaveURL(/resp=me/);
    await expect(page).toHaveURL(/vista=lista/);
    await page.reload();
    await expect(page.getByRole("table")).toContainText("Ana Quadro");
    await expect(page.getByRole("table")).not.toContainText("Beto Quadro");
    expect(errors).toEqual([]);
  } finally {
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  }
});
