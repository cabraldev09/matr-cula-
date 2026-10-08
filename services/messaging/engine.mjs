import { createRequire } from "node:module";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
const require = createRequire(
  new URL("../../backend/package.json", import.meta.url)
);
const { Pool } = require("pg");
export const createPool = (connectionString) =>
  new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

export function validSignature(raw, signature, secret) {
  if (
    !secret ||
    typeof signature !== "string" ||
    !/^sha256=[0-9a-f]{64}$/.test(signature)
  )
    return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}
export async function transaction(pool, action) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const result = await action(db);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}

export async function receiveWebhook(pool, raw) {
  const payload = JSON.parse(raw.toString("utf8"));
  if (
    payload.object !== "whatsapp_business_account" ||
    !Array.isArray(payload.entry)
  )
    throw new Error("INVALID_PAYLOAD");
  return transaction(pool, async (db) => {
    const receipt = createHash("sha256").update(raw).digest("hex");
    const inserted = await db.query(
      "insert into private.webhook_receipts(id,payload) values($1,$2) on conflict do nothing returning id",
      [receipt, payload]
    );
    if (!inserted.rowCount) return { duplicate: true };
    for (const entry of payload.entry)
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;
        const value = change.value || {};
        const channel = (
          await db.query(
            "select id from public.channels where phone_number_id = $1 and provider = 'whatsapp_cloud' and enabled",
            [value.metadata?.phone_number_id]
          )
        ).rows[0];
        if (!channel) continue; // Receipt preserves events for unconfigured or disabled numbers.
        for (const message of value.messages || []) {
          if (
            !/^\d{8,15}$/.test(message.from || "") ||
            !message.id ||
            !/^\d+$/.test(String(message.timestamp))
          )
            throw new Error("INVALID_MESSAGE");
          const name = value.contacts?.find(
            (contact) => contact.wa_id === message.from
          )?.profile?.name;
          const body =
            message.type === "text"
              ? message.text?.body
              : `[Mensagem ${
                  message.type || "não suportada"
                }: conteúdo preservado no servidor]`;
          await db.query("select private.ingest_text($1,$2,$3,$4,$5,$6)", [
            channel.id,
            message.from,
            name,
            body,
            message.id,
            new Date(Number(message.timestamp) * 1000),
          ]);
        }
        for (const status of value.statuses || []) {
          const ranks = { sent: 1, delivered: 2, read: 3 };
          if (["sent", "delivered", "read", "failed"].includes(status.status))
            await db.query(
              `insert into private.delivery_events(channel_id,provider_message_id,status,error_code)
          values($1,$2,$3,$4) on conflict do nothing`,
              [
                channel.id,
                status.id,
                status.status,
                status.status === "failed"
                  ? String(status.errors?.[0]?.code || "PROVIDER_REJECTED")
                  : null,
              ]
            );
          if (ranks[status.status])
            await db.query(
              `update public.messages set status = $3, error_code = null where channel_id = $1 and provider_message_id = $2 and direction = 'outgoing'
          and case status when 'read' then 3 when 'delivered' then 2 when 'sent' then 1 else 0 end < $4`,
              [channel.id, status.id, status.status, ranks[status.status]]
            );
          else if (status.status === "failed")
            await db.query(
              "update public.messages set status = 'failed', error_code = $3 where channel_id = $1 and provider_message_id = $2 and direction = 'outgoing' and status not in ('delivered','read')",
              [
                channel.id,
                status.id,
                String(status.errors?.[0]?.code || "PROVIDER_REJECTED"),
              ]
            );
        }
      }
    return { duplicate: false };
  });
}

export async function claimJob(pool, organizationId = null) {
  return transaction(pool, async (db) => {
    // A crashed sender may have reached Meta. Never resend an expired lease blindly.
    await db.query(
      `with expired as (update private.message_outbox set state = 'unknown' where state = 'processing' and lease_until < now() and ($1::uuid is null or organization_id=$1) returning message_id)
      update public.messages set status = 'unknown', error_code = 'LEASE_EXPIRED_REVIEW_REQUIRED' where id in (select message_id from expired)`,
      [organizationId]
    );
    const job = (
      await db.query(
        `select o.message_id, m.organization_id, m.conversation_id, m.sender_id, m.body, ch.id channel_id, ch.provider, ch.phone_number_id,
      ch.enabled, c.status conversation_status, c.assigned_to, ct.phone
      from private.message_outbox o join public.messages m on m.id = o.message_id
      join public.conversations c on c.id = m.conversation_id join public.contacts ct on ct.id = c.contact_id
      join public.channels ch on ch.id = m.channel_id
      where o.state = 'pending' and o.available_at <= now() and ($1::uuid is null or m.organization_id=$1) order by o.available_at limit 1 for update of o skip locked`,
        [organizationId]
      )
    ).rows[0];
    if (!job) return null;
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [
      job.sender_id,
    ]);
    const authority = (
      await db.query(
        "select private.can_access_conversation($1,$2) allowed, private.organization_role($1) role",
        [job.organization_id, job.conversation_id]
      )
    ).rows[0];
    let error;
    if (
      !authority.allowed ||
      !(
        job.assigned_to === job.sender_id ||
        ["owner", "admin", "supervisor"].includes(authority.role)
      )
    )
      error = "SENDER_ACCESS_REVOKED";
    else if (!job.enabled || job.conversation_status !== "open")
      error = "CHANNEL_OR_CONVERSATION_CLOSED";
    else if (job.provider === "whatsapp_cloud") {
      const window = (
        await db.query(
          "select exists(select 1 from public.messages where conversation_id = $1 and direction = 'incoming' and occurred_at > now() - interval '24 hours') allowed",
          [job.conversation_id]
        )
      ).rows[0];
      if (!window.allowed) error = "REPLY_WINDOW_EXPIRED";
    }
    if (error) {
      await db.query(
        "update private.message_outbox set state = 'failed' where message_id = $1",
        [job.message_id]
      );
      await db.query(
        "update public.messages set status = 'failed', error_code = $2 where id = $1",
        [job.message_id, error]
      );
      return { skipped: true };
    }
    const lease = (
      await db.query(
        "update private.message_outbox set state = 'processing', attempts = attempts+1, lease_token = gen_random_uuid(), lease_until = now() + interval '2 minutes' where message_id = $1 returning lease_token, attempts",
        [job.message_id]
      )
    ).rows[0];
    await db.query(
      "update public.messages set status = 'processing' where id = $1",
      [job.message_id]
    );
    return { ...job, ...lease };
  });
}

export async function sendCloud(job, config, fetcher = fetch) {
  const token = config.tokens?.[job.channel_id];
  if (
    !token ||
    !config.appSecret ||
    !/^v\d+\.\d+$/.test(config.graphVersion || "")
  )
    return {
      state: "failed",
      status: "failed",
      error: "CLOUD_CONFIGURATION_REQUIRED",
    };
  let response, payload;
  try {
    response = await fetcher(
      `https://graph.facebook.com/${config.graphVersion}/${job.phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: job.phone.replace(/^\+/, ""),
          type: "text",
          text: { body: job.body },
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    payload = await response.json();
  } catch {
    return {
      state: "unknown",
      status: "unknown",
      error: "NETWORK_RESULT_UNKNOWN",
    };
  }
  if (response.ok && typeof payload.messages?.[0]?.id === "string")
    return {
      state: "done",
      status: "sent",
      providerId: payload.messages[0].id,
    };
  if (response.status === 429 && payload.error && job.attempts < 5)
    return {
      state: "pending",
      status: "queued",
      error: "RATE_LIMITED",
      delay: Math.min(300, 2 ** job.attempts * 5),
    };
  if (response.status >= 500 || response.ok)
    return {
      state: "unknown",
      status: "unknown",
      error: "PROVIDER_RESULT_UNKNOWN",
    };
  return {
    state: "failed",
    status: "failed",
    error: String(payload.error?.code || "PROVIDER_REJECTED"),
  };
}

export async function runOnce(pool, config = {}, fetcher = fetch) {
  const job = await claimJob(pool, config.organizationId || null);
  if (!job || job.skipped) return Boolean(job);
  const result =
    job.provider === "simulator"
      ? { state: "done", status: "simulated" }
      : await sendCloud(job, config, fetcher);
  await transaction(pool, async (db) => {
    const changed = await db.query(
      `update private.message_outbox set state = $3, available_at = now() + $4 * interval '1 second', lease_until = null
      where message_id = $1 and lease_token = $2 and state = 'processing' returning message_id`,
      [job.message_id, job.lease_token, result.state, result.delay || 0]
    );
    if (!changed.rowCount) return;
    // A delivery webhook may beat the HTTP result: keep its stronger state.
    await db.query(
      `update public.messages set status = case when status in ('delivered','read') then status else $2 end,
      error_code = $3, provider_message_id = coalesce($4, provider_message_id) where id = $1`,
      [
        job.message_id,
        result.status,
        result.error || null,
        result.providerId || null,
      ]
    );
    if (result.providerId) {
      const event = (
        await db.query(
          `select status,error_code from private.delivery_events where channel_id = $1 and provider_message_id = $2
        order by case status when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 else 1 end desc limit 1`,
          [job.channel_id, result.providerId]
        )
      ).rows[0];
      if (event)
        await db.query(
          "update public.messages set status = $2,error_code = $3 where id = $1",
          [job.message_id, event.status, event.error_code]
        );
    }
  });
  return true;
}
