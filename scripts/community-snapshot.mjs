import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
const require = createRequire(
  new URL("../backend/package.json", import.meta.url)
);
const mysql = require("mysql2/promise");
const env = parseEnv(readFileSync("backend/.env", "utf8"));
if (
  !["localhost", "127.0.0.1"].includes(env.DB_HOST) ||
  env.DB_NAME !== "whaticket"
)
  throw new Error("Snapshot requires this project local Community database.");
const db = await mysql.createConnection({
  host: env.DB_HOST,
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
});
const tables = [
  "Contacts",
  "ContactCustomFields",
  "Queues",
  "UserQueues",
  "Tickets",
  "Messages",
  "QuickAnswers",
];
const snapshot = {
  version: 1,
  source: "whaticket-community",
  createdAt: new Date().toISOString(),
  data: {},
};
try {
  await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
  await db.query("START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT");
  // Password hashes, JWTs, API tokens and provider session secrets are deliberately excluded.
  snapshot.data.Users = (
    await db.query(
      "SELECT id,name,email,profile,createdAt,updatedAt FROM Users ORDER BY id"
    )
  )[0];
  for (const table of tables) {
    const count = (
      await db.query(`SELECT count(*) count FROM \`${table}\``)
    )[0][0].count;
    if (count > 100000)
      throw new Error(
        `Table ${table} requires a streaming export (more than 100000 rows).`
      );
    snapshot.data[table] = (await db.query(`SELECT * FROM \`${table}\``))[0];
  }
  await db.commit();
  const path = `.local/community-snapshots/${snapshot.createdAt.replace(
    /[:.]/g,
    "-"
  )}`;
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const serialized = JSON.stringify(snapshot, null, 2) + "\n";
  writeFileSync(`${path}/history.json`, serialized, { mode: 0o600 });
  const report = {
    createdAt: snapshot.createdAt,
    sha256: createHash("sha256").update(serialized).digest("hex"),
    counts: Object.fromEntries(
      Object.entries(snapshot.data).map(([name, rows]) => [name, rows.length])
    ),
    prerequisites: [
      "Definir empresa de destino",
      "Vincular usuários através de convites e confirmação de e-mail",
      "Migrar arquivos privados separadamente",
      "Reconciliar IDs e validar contagens antes de mudar o atendimento",
    ],
    limitations: [
      "Exporta histórico e identidades sem senhas; não é um backup completo do MariaDB",
      "Não copia arquivos de mídia nem credenciais de sessões WhatsApp",
      "Nenhum registro foi importado ou alterado",
    ],
  };
  writeFileSync(
    `${path}/manifest.json`,
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 }
  );
  console.log(
    JSON.stringify(
      { path, counts: report.counts, sha256: report.sha256 },
      null,
      2
    )
  );
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
