import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  createPool,
  claimJob,
  runOnce,
  receiveWebhook,
  validSignature,
  sendCloud,
} from "../services/messaging/engine.mjs";
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url)
);
const { createClient } = require("@supabase/supabase-js");
import { activatePlan } from "./helpers/plans.mjs";
const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
);
assert.equal(status.API_URL, "http://127.0.0.1:56421");
assert.equal(new URL(status.DB_URL).port, "56422");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const ok = (result) => {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
};
const denied = (result) =>
  assert.ok(result.error, "Expected operation to be denied");

test("Messaging: isolated inbox, persistent outbox, webhook deduplication and safe delivery", async (t) => {
  const pool = createPool(status.DB_URL),
    users = [],
    orgs = [],
    receipts = [];
  const fixture = async () => {
    const email = `messages-${randomUUID()}@example.test`,
      password = `Pass-${randomUUID()}!`;
    const user = ok(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
    ).user;
    const client = createClient(
      status.API_URL,
      status.PUBLISHABLE_KEY,
      options
    );
    ok(await client.auth.signInWithPassword({ email, password }));
    const result = { user, client, email };
    users.push(result);
    return result;
  };
  const receive = async (raw) => {
    receipts.push(createHash("sha256").update(raw).digest("hex"));
    return receiveWebhook(pool, raw);
  };
  try {
    const [owner, stranger, agent] = await Promise.all([
      fixture(),
      fixture(),
      fixture(),
    ]);
    const org = ok(
      await owner.client.rpc("create_organization", {
        org_name: "Messaging Test",
        display_name: "Owner",
      })
    );
    orgs.push(org);
    const otherOrg = ok(
      await stranger.client.rpc("create_organization", {
        org_name: "Other Company",
        display_name: "Stranger",
      })
    );
    orgs.push(otherOrg);
    for (const id of [org, otherOrg]) await activatePlan(admin, id);
    const invite = ok(
      await owner.client.rpc("invite_member", {
        org,
        invite_email: agent.email,
        invite_role: "agent",
      })
    );
    ok(
      await agent.client.rpc("accept_invitation", {
        invite_token: invite.token,
        display_name: "Agent",
      })
    );
    const once = (config = {}, fetcher) =>
      runOnce(pool, { ...config, organizationId: org }, fetcher);
    const claim = () => claimJob(pool, org);
    const team = ok(
      await owner.client
        .from("teams")
        .insert({ organization_id: org, name: "Support" })
        .select()
        .single()
    );
    const channel = ok(
      await owner.client.rpc("create_channel", {
        org,
        channel_name: "Local Test",
        channel_provider: "simulator",
        team: team.id,
      })
    );
    let conversation;
    await t.test(
      "only managers can create channels and inject test messages",
      async () => {
        denied(
          await stranger.client.rpc("create_channel", {
            org,
            channel_name: "Forged",
            channel_provider: "simulator",
          })
        );
        denied(
          await agent.client.rpc("create_channel", {
            org,
            channel_name: "Forged",
            channel_provider: "simulator",
          })
        );
        denied(
          await stranger.client.rpc("simulate_incoming", {
            channel,
            phone: "5569999999911",
            contact_name: "Forged",
            message_body: "Forged",
            event_id: randomUUID(),
          })
        );
      }
    );
    await t.test(
      "repeated inbound events create one contact, conversation and message",
      async () => {
        const args = {
          channel,
          phone: "5569999999911",
          contact_name: "Customer",
          message_body: "Hello from customer",
          event_id: randomUUID(),
        };
        const results = await Promise.all([
          owner.client.rpc("simulate_incoming", args),
          owner.client.rpc("simulate_incoming", args),
        ]);
        assert.equal(ok(results[0]), ok(results[1]));
        const rows = ok(
          await owner.client
            .from("conversations")
            .select("*")
            .eq("channel_id", channel)
        );
        assert.equal(rows.length, 1);
        conversation = rows[0];
        assert.equal(
          ok(
            await owner.client
              .from("messages")
              .select("*")
              .eq("conversation_id", conversation.id)
          ).length,
          1
        );
      }
    );
    await t.test(
      "messages cannot be forged and are hidden from other companies or departments",
      async () => {
        assert.deepEqual(
          ok(
            await stranger.client
              .from("messages")
              .select("*")
              .eq("channel_id", channel)
          ),
          []
        );
        assert.deepEqual(
          ok(
            await agent.client
              .from("messages")
              .select("*")
              .eq("channel_id", channel)
          ),
          []
        );
        denied(
          await owner.client
            .from("messages")
            .insert({
              organization_id: org,
              conversation_id: conversation.id,
              channel_id: channel,
              direction: "incoming",
              body: "Forged",
              status: "received",
            })
        );
        denied(
          await owner.client
            .from("messages")
            .update({ status: "delivered" })
            .eq("channel_id", channel)
        );
        denied(
          await owner.client.rpc("queue_message", {
            conversation: conversation.id,
            message_body: "Before claim",
            idempotency_key: randomUUID(),
          })
        );
      }
    );
    await t.test(
      "request keys deduplicate sends and cannot be reused for different content",
      async () => {
        ok(
          await owner.client.rpc("claim_conversation", {
            conversation: conversation.id,
          })
        );
        const args = {
          conversation: conversation.id,
          message_body: "Reply",
          idempotency_key: randomUUID(),
        };
        const results = await Promise.all([
          owner.client.rpc("queue_message", args),
          owner.client.rpc("queue_message", args),
        ]);
        assert.equal(ok(results[0]), ok(results[1]));
        denied(
          await owner.client.rpc("queue_message", {
            ...args,
            message_body: "Changed",
          })
        );
        const rows = (
          await pool.query(
            "select * from private.message_outbox where organization_id=$1",
            [org]
          )
        ).rows;
        assert.equal(rows.length, 1);
      }
    );
    await t.test(
      "simulator worker records simulated delivery without external requests",
      async () => {
        let called = false;
        await once({}, async () => {
          called = true;
          throw new Error("External network forbidden");
        });
        assert.equal(called, false);
        const outgoing = ok(
          await owner.client
            .from("messages")
            .select("*")
            .eq("channel_id", channel)
            .eq("direction", "outgoing")
        );
        assert.equal(outgoing[0].status, "simulated");
      }
    );
    await t.test(
      "two workers cannot claim the same job and expired claims are held for review",
      async () => {
        const id = ok(
          await owner.client.rpc("queue_message", {
            conversation: conversation.id,
            message_body: "Lease check",
            idempotency_key: randomUUID(),
          })
        );
        const claims = await Promise.all([claim(), claim()]);
        assert.equal(claims.filter(Boolean).length, 1);
        await pool.query(
          "update private.message_outbox set lease_until=now()-interval '1 second' where message_id=$1",
          [id]
        );
        assert.equal(await claim(), null);
        assert.equal(
          ok(
            await owner.client
              .from("messages")
              .select("status")
              .eq("id", id)
              .single()
          ).status,
          "unknown"
        );
      }
    );
    await t.test(
      "pausing a channel blocks queued sends before provider delivery",
      async () => {
        const id = ok(
          await owner.client.rpc("queue_message", {
            conversation: conversation.id,
            message_body: "Paused",
            idempotency_key: randomUUID(),
          })
        );
        ok(
          await owner.client.rpc("set_channel_enabled", {
            channel,
            active: false,
          })
        );
        await once();
        assert.equal(
          ok(
            await owner.client
              .from("messages")
              .select("error_code")
              .eq("id", id)
              .single()
          ).error_code,
          "CHANNEL_OR_CONVERSATION_CLOSED"
        );
        ok(
          await owner.client.rpc("set_channel_enabled", {
            channel,
            active: true,
          })
        );
      }
    );
    await t.test(
      "revoked sender is rejected even if their job was already queued",
      async () => {
        ok(
          await owner.client
            .from("team_members")
            .insert({
              organization_id: org,
              team_id: team.id,
              user_id: agent.user.id,
            })
        );
        const event = ok(
          await owner.client.rpc("simulate_incoming", {
            channel,
            phone: "5569999999922",
            contact_name: "Other Customer",
            message_body: "Hello",
            event_id: randomUUID(),
          })
        );
        const target = ok(
          await owner.client
            .from("messages")
            .select("conversation_id")
            .eq("id", event)
            .single()
        ).conversation_id;
        ok(
          await agent.client.rpc("claim_conversation", { conversation: target })
        );
        const id = ok(
          await agent.client.rpc("queue_message", {
            conversation: target,
            message_body: "Revoked later",
            idempotency_key: randomUUID(),
          })
        );
        ok(
          await owner.client.rpc("remove_member", {
            org,
            member: agent.user.id,
          })
        );
        await once();
        assert.equal(
          ok(
            await owner.client
              .from("messages")
              .select("error_code")
              .eq("id", id)
              .single()
          ).error_code,
          "SENDER_ACCESS_REVOKED"
        );
      }
    );
    const phoneId = String(
      BigInt("0x" + randomUUID().replace(/-/g, "").slice(0, 12))
    );
    const cloud = ok(
      await owner.client.rpc("create_channel", {
        org,
        channel_name: "Cloud Test",
        channel_provider: "whatsapp_cloud",
        phone_id: phoneId,
      })
    );
    const webhook = (messages = [], statuses = []) =>
      Buffer.from(
        JSON.stringify({
          object: "whatsapp_business_account",
          entry: [
            {
              changes: [
                {
                  field: "messages",
                  value: {
                    metadata: { phone_number_id: phoneId },
                    messages,
                    statuses,
                  },
                },
              ],
            },
          ],
        })
      );
    const incoming = {
      id: `wamid.${randomUUID()}`,
      from: "5569999999933",
      type: "text",
      text: { body: "Cloud inbound" },
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    await t.test(
      "signature validates raw bytes and rejects modified payloads",
      () => {
        const raw = webhook([incoming]),
          secret = "server-only-test-secret";
        const signature =
          "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
        assert.equal(validSignature(raw, signature, secret), true);
        assert.equal(
          validSignature(
            Buffer.concat([raw, Buffer.from(" ")]),
            signature,
            secret
          ),
          false
        );
        assert.equal(validSignature(raw, signature, ""), false);
      }
    );
    await t.test(
      "signed webhook processing is durable and deduplicates both deliveries and message IDs",
      async () => {
        const raw = webhook([incoming]);
        assert.equal((await receive(raw)).duplicate, false);
        assert.equal((await receive(raw)).duplicate, true);
        await receive(webhook([incoming], []));
        assert.equal(
          ok(
            await owner.client
              .from("messages")
              .select("*")
              .eq("channel_id", cloud)
          ).length,
          1
        );
      }
    );
    let cloudConversation, cloudMessage;
    await t.test(
      "cloud send uses the channel token and reconciles a delivery webhook that arrives first",
      async () => {
        cloudConversation = ok(
          await owner.client
            .from("conversations")
            .select("id")
            .eq("channel_id", cloud)
            .single()
        ).id;
        ok(
          await owner.client.rpc("claim_conversation", {
            conversation: cloudConversation,
          })
        );
        cloudMessage = ok(
          await owner.client.rpc("queue_message", {
            conversation: cloudConversation,
            message_body: "Cloud reply",
            idempotency_key: randomUUID(),
          })
        );
        const providerId = `wamid.${randomUUID()}`;
        await once(
          {
            tokens: { [cloud]: "channel-token" },
            appSecret: "app-secret",
            graphVersion: "v25.0",
          },
          async (url, options) => {
            assert.equal(
              url,
              `https://graph.facebook.com/v25.0/${phoneId}/messages`
            );
            assert.equal(options.headers.Authorization, "Bearer channel-token");
            await receive(webhook([], [{ id: providerId, status: "read" }]));
            return new Response(
              JSON.stringify({ messages: [{ id: providerId }] }),
              { status: 200 }
            );
          }
        );
        assert.equal(
          ok(
            await owner.client
              .from("messages")
              .select("status")
              .eq("id", cloudMessage)
              .single()
          ).status,
          "read"
        );
        await receive(webhook([], [{ id: providerId, status: "sent" }]));
        assert.equal(
          ok(
            await owner.client
              .from("messages")
              .select("status")
              .eq("id", cloudMessage)
              .single()
          ).status,
          "read"
        );
      }
    );
    await t.test(
      "WhatsApp text reply window is enforced by the database",
      async () => {
        await pool.query(
          "update public.messages set occurred_at=now()-interval '25 hours' where channel_id=$1 and direction='incoming'",
          [cloud]
        );
        denied(
          await owner.client.rpc("queue_message", {
            conversation: cloudConversation,
            message_body: "Too late",
            idempotency_key: randomUUID(),
          })
        );
      }
    );
    await t.test(
      "uncertain network outcomes are not retried automatically",
      async () => {
        const result = await sendCloud(
          {
            channel_id: cloud,
            phone_number_id: phoneId,
            phone: "5569999999933",
            body: "Hello",
            attempts: 1,
          },
          {
            tokens: { [cloud]: "token" },
            appSecret: "secret",
            graphVersion: "v25.0",
          },
          async () => {
            throw new Error("Timeout after provider accepted");
          }
        );
        assert.equal(result.state, "unknown");
      }
    );
  } finally {
    for (const id of orgs)
      ok(await admin.from("organizations").delete().eq("id", id));
    if (receipts.length)
      await pool.query(
        "delete from private.webhook_receipts where id=any($1::text[])",
        [receipts]
      );
    for (const fixture of users) {
      await fixture.client.auth.signOut();
      ok(await admin.auth.admin.deleteUser(fixture.user.id));
    }
    await pool.end();
  }
});
