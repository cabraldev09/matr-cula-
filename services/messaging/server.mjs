import { createWebhookServer } from "./http.mjs";
import { readFileSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { createPool, runOnce } from "./engine.mjs";
const env = {
  ...(existsSync(".local/messaging.env")
    ? parseEnv(readFileSync(".local/messaging.env", "utf8"))
    : {}),
  ...(existsSync("services/messaging/.env")
    ? parseEnv(readFileSync("services/messaging/.env", "utf8"))
    : {}),
  ...process.env,
};
if (!env.MESSAGING_DATABASE_URL)
  throw new Error("MESSAGING_DATABASE_URL is required");
const pool = createPool(env.MESSAGING_DATABASE_URL);
const config = {
  appSecret: env.META_APP_SECRET,
  graphVersion: env.META_GRAPH_VERSION,
  tokens: JSON.parse(env.WHATSAPP_CHANNEL_TOKENS || "{}"),
};
const server = createWebhookServer(pool, {
  ...config,
  verifyToken: env.META_VERIFY_TOKEN,
});
server.listen(
  Number(env.MESSAGING_PORT || 8081),
  env.MESSAGING_HOST || "127.0.0.1",
  () => console.log("Messaging service ready")
);
let stopping = false;
async function work() {
  if (stopping) return;
  try {
    let processed = 0;
    while (!stopping && processed++ < 20 && (await runOnce(pool, config))) {}
  } catch (error) {
    console.error("Worker paused:", error.code || error.name);
  }
  if (!stopping) setTimeout(work, 1000);
}
work();
async function stop() {
  stopping = true;
  server.close();
  await pool.end();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
