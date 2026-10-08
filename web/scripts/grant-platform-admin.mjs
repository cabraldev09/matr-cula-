// Torna uma conta administradora da plataforma (painel /admin).
// Uso: node scripts/grant-platform-admin.mjs email@dominio.com   (usa DATABASE_URL de .env.local)
// Em produção, rode no SQL Editor do Supabase:
//   insert into private.platform_admins(user_id) select id from auth.users where email = 'email@dominio.com';
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email.includes("@")) {
  console.error("Informe o e-mail da conta: node scripts/grant-platform-admin.mjs voce@empresa.com");
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const result = await client.query(
  "insert into private.platform_admins(user_id) select id from auth.users where lower(email) = $1 on conflict do nothing returning user_id",
  [email],
);
const exists = await client.query("select 1 from auth.users where lower(email) = $1", [email]);
await client.end();
if (!exists.rowCount) {
  console.error("Conta não encontrada. Crie a conta em /cadastro primeiro.");
  process.exit(1);
}
console.log(result.rowCount ? `${email} agora é administrador da plataforma.` : `${email} já era administrador da plataforma.`);
