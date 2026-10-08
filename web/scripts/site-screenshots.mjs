// Capturas das telas reais do sistema para o site público (web/public/site/*.webp).
// SOMENTE no Supabase local: preenche a empresa demo com leads de vitrine e fotografa as telas.
// Uso: npm run dev (porta 3010) e, em outro terminal, npm run site:screenshots
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";
import sharp from "sharp";
import { chromium } from "playwright";

config({ path: ".env.local", quiet: true });
const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, DEMO_OWNER_EMAIL, DEMO_OWNER_PASSWORD } = process.env;
const BASE = process.env.SITE_BASE_URL ?? "http://localhost:3010";
if (!/@(127\.0\.0\.1|localhost):56422\//.test(DATABASE_URL ?? "") || !/127\.0\.0\.1:56421/.test(NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  console.error("site:screenshots só roda contra o Supabase local (portas 56421/56422).");
  process.exit(1);
}
if (!DEMO_OWNER_EMAIL || !DEMO_OWNER_PASSWORD) {
  console.error("Rode npm run seed:demo antes.");
  process.exit(1);
}

const COURSES = [
  ["Biomedicina", "Semipresencial - Graduação", 8, 101470, 30675],
  ["Nutrição", "Semipresencial - Graduação", 8, 107380, 28493],
  ["Cst Em Análise E Desenvolvimento De Sistemas", "EAD - Graduação", 4, 75630, 14528],
  ["Cst Em Gestão Pública", "EAD - Graduação", 4, 75630, 14243],
  ["Relações Internacionais", "EAD - Graduação", 6, 101460, 16493],
  ["Administração", "EAD - Graduação", 8, 75630, 14990],
  ["Pedagogia", "EAD - Graduação", 8, 75630, 13990],
];

// Pessoas fictícias. stage/campos aplicados depois que a mensagem cria o lead.
const SHOWCASE = [
  { name: "Juliana Prado", phone: "5569990000101", messages: ["Boa tarde! Quero fazer Pedagogia EAD", "Começa quando?"], stage: "novo" },
  { name: "Rafael Nunes", phone: "5569990000102", messages: ["Oi, tem Administração?"], stage: "novo" },
  { name: "Camila Rocha", phone: "5569990000103", messages: ["Quero informações de Nutrição", "Tem bolsa?", "Posso usar o ENEM?"], stage: "contato", modality: "Semipresencial - Graduação" },
  { name: "Bruno Martins", phone: "5569990000104", messages: ["Já fiz 3 semestres de Administração em outra faculdade"], stage: "analise", entry: "transferencia", previous: true, modality: "EAD - Graduação" },
  { name: "Larissa Mendes", phone: "5569990000105", messages: ["Quero Biomedicina", "Prefiro semipresencial", "Pode me mandar a proposta?"], stage: "qualificado", entry: "enem", modality: "Semipresencial - Graduação", term: true },
  { name: "Diego Alves", phone: "5569990000106", messages: ["Relações Internacionais, qual o valor?", "Ok, vou ver com minha família"], stage: "proposta", entry: "vestibular", modality: "EAD - Graduação", term: true },
  { name: "Patrícia Lima", phone: "5569990000107", messages: ["Paguei a taxa da Gestão Pública!"], stage: "taxa_paga", entry: "segunda_graduacao", previous: true, modality: "EAD - Graduação", term: true },
  { name: "Thiago Costa", phone: "5569990000108", messages: ["Quero Análise e Desenvolvimento de Sistemas", "Tenho nota do ENEM", "Quero começar agora"], stage: "qualificado", entry: "enem", modality: "EAD - Graduação", term: true, course: "Análise e Desenvolvimento de Sistemas" },
];

const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
const { rows: owners } = await db.query(
  "select m.organization_id, u.id as user_id from auth.users u join public.memberships m on m.user_id = u.id and m.role = 'owner' where lower(u.email) = lower($1) limit 1",
  [DEMO_OWNER_EMAIL],
);
if (!owners[0]) throw new Error("Empresa demo não encontrada. Rode npm run seed:demo.");
const { organization_id: org, user_id: owner } = owners[0];

for (const [name, modality, semesters, gross, first] of COURSES) {
  await db.query(
    `insert into public.courses(organization_id, name, modality, semesters, gross_monthly_cents, default_first_monthly_cents)
     values ($1, $2, $3, $4, $5, $6) on conflict (organization_id, name, modality) do nothing`,
    [org, name, modality, semesters, gross, first],
  );
}
await db.query(
  `insert into public.proposal_settings(organization_id, institution_name, logo_source) values ($1, 'Polo Demonstração', 'preset_cruzeiro')
   on conflict (organization_id) do nothing`,
  [org],
);
let { rows: channels } = await db.query("select id from public.channels where organization_id = $1 and provider = 'simulator' order by created_at limit 1", [org]);
if (!channels[0]) ({ rows: channels } = await db.query("insert into public.channels(organization_id, name, provider) values ($1, 'WhatsApp do polo', 'simulator') returning id", [org]));
const channel = channels[0].id;

for (const [index, person] of SHOWCASE.entries()) {
  for (const [i, body] of person.messages.entries()) {
    await db.query("select private.ingest_text($1, $2, $3, $4, $5, now() - make_interval(mins => $6))", [
      channel, person.phone, person.name, body, `showcase:${person.phone}:${i}`, (SHOWCASE.length - index) * 37 - i,
    ]);
  }
  await db.query(
    `update public.leads l set stage = $3, owner_id = $4, entry_type = coalesce($5, l.entry_type), has_previous_studies = coalesce($6, l.has_previous_studies),
       modality = coalesce($7, l.modality), start_term = case when $8 then case when extract(month from now()) <= 6 then to_char(now(), 'YYYY') || '.2' else (extract(year from now())::int + 1)::text || '.1' end else l.start_term end,
       course_id = coalesce(l.course_id, (select k.id from public.courses k where k.organization_id = $1 and private.course_key(k.name) = private.course_key($9) limit 1))
     from public.contacts c
     where c.id = l.contact_id and l.organization_id = $1 and c.phone = $2 and l.stage not in ('matriculado', 'perdido')`,
    [org, person.phone, person.stage, index % 3 === 0 ? null : owner, person.entry ?? null, person.previous ?? null, person.modality ?? null, Boolean(person.term), person.course ?? ""],
  );
}
const { rows: proposals } = await db.query("select public_token from public.proposals where organization_id = $1 order by created_at desc limit 1", [org]);
const { rows: focus } = await db.query(
  "select l.id from public.leads l join public.contacts c on c.id = l.contact_id where l.organization_id = $1 and c.phone = $2",
  [org, SHOWCASE[4].phone],
);
await db.end();

const out = path.resolve("public/site");
mkdirSync(out, { recursive: true });
// Sem o Chromium do Playwright baixado, usa o Google Chrome instalado.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}/login`);
await page.getByLabel("E-mail").fill(DEMO_OWNER_EMAIL);
await page.getByLabel("Senha", { exact: true }).fill(DEMO_OWNER_PASSWORD);
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL(/\/(inicio|crm|conta|atendimento)/);

async function shot(name, url, prepare) {
  await page.goto(`${BASE}${url}`);
  await page.waitForLoadState("networkidle");
  // Indicador do modo de desenvolvimento do Next não entra na imagem.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  if (prepare) await prepare();
  await page.waitForTimeout(800);
  const png = await page.screenshot();
  await sharp(png).resize({ width: 1600 }).webp({ quality: 80 }).toFile(path.join(out, `${name}.webp`));
  console.log(`✓ ${name}.webp`);
}

await shot("crm", "/crm");
if (focus[0]) await shot("crm-lead", `/crm?lead=${focus[0].id}`, () => page.getByRole("tab", { name: "Proposta e taxa" }).click());
await shot("atendimento", "/atendimento", async () => {
  await page.getByRole("button", { name: /Larissa Mendes/ }).first().click();
});
await shot("relatorios", "/relatorios");
if (proposals[0]) await shot("proposta", `/proposta/${proposals[0].public_token}`);
await browser.close();
