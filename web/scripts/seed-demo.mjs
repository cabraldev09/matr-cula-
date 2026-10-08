// Dados de demonstração SOMENTE no Supabase local: dono, empresa com plano Completo em teste e
// acesso ao painel da plataforma. Usa DEMO_OWNER_EMAIL/DEMO_OWNER_PASSWORD de .env.local.
// Uso: npm run seed:demo
import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import { config } from "dotenv";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local", quiet: true });
const { DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!/@(127\.0\.0\.1|localhost):56422\//.test(DATABASE_URL ?? "") || !/127\.0\.0\.1:56421/.test(NEXT_PUBLIC_SUPABASE_URL ?? "")) {
  console.error("seed:demo só roda contra o Supabase local (portas 56421/56422).");
  process.exit(1);
}
let email = process.env.DEMO_OWNER_EMAIL;
let password = process.env.DEMO_OWNER_PASSWORD;
if (!email || !password) {
  email = "dono.demo@example.test";
  password = `Demo-${randomBytes(6).toString("hex")}!`;
  const env = readFileSync(".env.local", "utf8");
  appendFileSync(".env.local", `${env.endsWith("\n") ? "" : "\n"}DEMO_OWNER_EMAIL=${email}\nDEMO_OWNER_PASSWORD=${password}\n`);
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
let { rows } = await db.query("select id from auth.users where lower(email) = $1", [email]);
let userId = rows[0]?.id;
if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "Dono Demo" } });
  if (error) throw error;
  userId = data.user.id;
}
({ rows } = await db.query("select organization_id from public.memberships where user_id = $1 and role = 'owner' limit 1", [userId]));
let organizationId = rows[0]?.organization_id;
if (!organizationId) {
  await db.query("insert into public.profiles(id, display_name) values ($1, 'Dono Demo') on conflict (id) do nothing", [userId]);
  ({ rows } = await db.query("insert into public.organizations(name) values ('Escola Demo') returning id"));
  organizationId = rows[0].id;
  await db.query("insert into public.memberships(organization_id, user_id, role) values ($1, $2, 'owner')", [organizationId, userId]);
  await db.query(
    `insert into public.subscriptions(organization_id, plan_id, status, current_period_end, trial_used)
     select $1, id, 'trialing', now() + interval '7 days', true from public.plans where code = 'completo'`,
    [organizationId],
  );
}
await db.query("insert into private.platform_admins(user_id) values ($1) on conflict do nothing", [userId]);
await db.end();
console.log(`Demo pronta: ${email} (senha em web/.env.local, DEMO_OWNER_PASSWORD). Empresa ${organizationId}.`);
