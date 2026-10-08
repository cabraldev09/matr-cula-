import { execFileSync, spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  openSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { randomBytes } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
mkdirSync(".local", { recursive: true });
const statePath = ".local/dev-state.json";
function stopOwned() {
  if (!existsSync(statePath)) return;
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  for (const service of state) {
    try {
      const command = execFileSync(
        "ps",
        ["-p", String(service.pid), "-o", "command="],
        { encoding: "utf8" }
      );
      if (command.includes(service.entry)) process.kill(service.pid, "SIGTERM");
    } catch {
      /* Already stopped. */
    }
  }
  writeFileSync(statePath, "[]\n");
}
if (process.argv.includes("--stop")) {
  stopOwned();
  console.log(
    "Servidores deste projeto encerrados. Os bancos permanecem ativos."
  );
  process.exit(0);
}
const run = (cmd, args, output = "inherit") =>
  execFileSync(cmd, args, {
    cwd: root,
    stdio: output,
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: "true" },
  });
const freshInstall = !existsSync(".env") && !existsSync("backend/.env");
if (freshInstall) {
  const dbPassword = randomBytes(32).toString("hex");
  writeFileSync(
    ".env",
    `MYSQL_PASSWORD=${dbPassword}\nMYSQL_ROOT_PASSWORD=${randomBytes(
      32
    ).toString("hex")}\n`,
    { mode: 0o600 }
  );
  writeFileSync(
    "backend/.env",
    `DB_HOST=127.0.0.1\nDB_DIALECT=mysql\nDB_PORT=3306\nDB_NAME=whaticket\nDB_USER=whaticket\nDB_PASS=${dbPassword}\nJWT_SECRET=${randomBytes(
      32
    ).toString("hex")}\nJWT_REFRESH_SECRET=${randomBytes(32).toString(
      "hex"
    )}\nBACKEND_URL=http://localhost\nPROXY_PORT=8080\nPORT=8080\nFRONTEND_URL=http://localhost:3002\nWHATSAPP_PROVIDER=wwebjs\n`,
    { mode: 0o600 }
  );
}
if (!existsSync(".env") || !existsSync("backend/.env"))
  throw new Error(
    "Configuração parcial: confira .env do Docker e backend/.env antes de iniciar."
  );
run("docker", [
  "compose",
  "-p",
  "whaticket-local",
  "-f",
  "docker-compose.local.yaml",
  "up",
  "-d",
  "--wait",
]);
// Capture startup output because it can include local service credentials.
try {
  run(
    "supabase",
    ["start", "--exclude", "logflare,vector,edge-runtime,supavisor"],
    ["ignore", "pipe", "pipe"]
  );
} catch (error) {
  writeFileSync(
    ".local/supabase-start.log",
    String(error.stderr || error.message)
  );
  throw new Error("Supabase falhou; consulte .local/supabase-start.log.");
}
run("supabase", ["migration", "up", "--local"]);
const status = JSON.parse(
  run(
    "supabase",
    ["status", "-o", "json"],
    ["ignore", "pipe", "pipe"]
  ).toString()
);
if (status.API_URL !== "http://127.0.0.1:56421")
  throw new Error("O ambiente local não corresponde a este projeto.");
writeFileSync(
  ".local/messaging.env",
  `MESSAGING_DATABASE_URL=${status.DB_URL}\n`,
  { mode: 0o600 }
);
const envPath = "frontend/.env";
let env = existsSync(envPath)
  ? readFileSync(envPath, "utf8")
  : "VITE_BACKEND_URL=http://localhost:8080/\n";
env = env
  .split("\n")
  .filter((line) => !/^VITE_SUPABASE_(URL|PUBLISHABLE_KEY)=/.test(line))
  .join("\n");
writeFileSync(
  envPath,
  `${env}\nVITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}\n`,
  { mode: 0o600 }
);
run("npm", ["--prefix", "backend", "run", "build"]);
execFileSync(resolve("backend/node_modules/.bin/sequelize"), ["db:migrate"], {
  cwd: resolve("backend"),
  stdio: "inherit",
});
if (freshInstall) run("npm", ["--prefix", "backend", "run", "db:seed"]);
stopOwned();
const services = [
  {
    name: "messaging",
    entry: resolve("services/messaging/server.mjs"),
    args: [],
    cwd: root,
  },
  {
    name: "frontend",
    entry: resolve("frontend/node_modules/vite/bin/vite.js"),
    args: [],
    cwd: resolve("frontend"),
  },
  {
    name: "backend",
    entry: resolve("backend/dist/server.js"),
    args: [],
    cwd: resolve("backend"),
  },
];
const state = [];
for (const service of services) {
  const log = openSync(`.local/${service.name}.log`, "a");
  const child = spawn(process.execPath, [service.entry, ...service.args], {
    cwd: service.cwd,
    detached: true,
    stdio: ["ignore", log, log],
  });
  child.unref();
  state.push({ pid: child.pid, entry: service.entry });
}
writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
await new Promise((resolve) => setTimeout(resolve, 1200));
try {
  for (const service of state) process.kill(service.pid, 0);
} catch {
  stopOwned();
  throw new Error("Um servidor encerrou. Confira os logs em .local.");
}
console.log(
  "SaaS: http://localhost:3002/saas\nCommunity: http://localhost:3002\nSupabase Studio: http://localhost:56423"
);
