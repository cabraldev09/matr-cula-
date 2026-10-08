import { createServer } from "node:http";
import { validSignature, receiveWebhook } from "./engine.mjs";
export function createWebhookServer(pool, config) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const reply = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      });
      res.end(body);
    };
    if (req.method === "GET" && url.pathname === "/health") {
      try {
        await pool.query("select 1");
        reply(200, "ok");
      } catch {
        reply(503, "database unavailable");
      }
      return;
    }
    if (url.pathname !== "/webhooks/whatsapp") return reply(404, "not found");
    if (!config.appSecret || !config.verifyToken)
      return reply(503, "webhook configuration required");
    if (req.method === "GET")
      return url.searchParams.get("hub.mode") === "subscribe" &&
        url.searchParams.get("hub.verify_token") === config.verifyToken
        ? reply(200, url.searchParams.get("hub.challenge") || "")
        : reply(403, "forbidden");
    if (req.method !== "POST") return reply(405, "method not allowed");
    try {
      const parts = [];
      let size = 0;
      for await (const part of req) {
        size += part.length;
        if (size > 1024 * 1024) return reply(413, "payload too large");
        parts.push(part);
      }
      const raw = Buffer.concat(parts);
      if (
        !validSignature(
          raw,
          req.headers["x-hub-signature-256"],
          config.appSecret
        )
      )
        return reply(401, "invalid signature");
      await receiveWebhook(pool, raw);
      reply(200, "accepted");
    } catch (error) {
      console.error("Webhook rejected:", error.code || error.name);
      reply(503, "event could not be persisted");
    }
  });
  server.requestTimeout = 30000;
  return server;
}
