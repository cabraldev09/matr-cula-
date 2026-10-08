import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createPool } from "../services/messaging/engine.mjs";
import { activatePlan } from "./helpers/plans.mjs";
const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
);
assert.equal(status.API_URL, "http://127.0.0.1:56421", "Tests must use the dedicated local Supabase");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const ok = (result) => {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
};
const denied = (result, pattern) => {
  assert.ok(result.error, "Expected the request to be rejected");
  if (pattern) assert.match(result.error.message, pattern);
};

test("Resale: empty accounts, plans, entitlements, quotas and platform admin", async (t) => {
  const pool = createPool(status.DB_URL),
    users = [],
    orgs = [],
    plans = [];
  const fixture = async (prefix) => {
    const email = `${prefix}-${randomUUID()}@example.test`,
      password = `Pass-${randomUUID()}!`;
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    const result = { user, client, email };
    users.push(result);
    return result;
  };
  // Each owner may create at most five organizations, so most cases use a dedicated owner.
  const newOrg = async (owner, name) => {
    const id = ok(await owner.client.rpc("create_organization", { org_name: name, display_name: "Dono" }));
    orgs.push(id);
    return id;
  };
  const testPlan = async (fields) => {
    const plan = ok(
      await admin
        .from("plans")
        .insert({ code: `t-${randomUUID().slice(0, 8)}`, name: "Plano teste", price_cents: 100, ...fields })
        .select()
        .single()
    );
    plans.push(plan.id);
    return plan;
  };
  try {
    const [owner, other, agent] = [await fixture("owner"), await fixture("other"), await fixture("agent")];

    await t.test("new organization starts empty, without modules, with a public slug", async () => {
      const org = await newOrg(owner, "Escola Ação Modelo");
      const entitlements = ok(await owner.client.rpc("my_entitlements", { org }));
      assert.equal(entitlements.access, "none");
      assert.deepEqual(entitlements.modules, []);
      assert.equal(entitlements.plan, null);
      const created = ok(await owner.client.from("organizations").select("slug").eq("id", org).single());
      assert.match(created.slug, /^escola-acao-modelo-[0-9a-f]{4}$/);
      denied(await owner.client.from("contacts").insert({ organization_id: org, name: "Contato" }), /Module not available/);
      assert.deepEqual(ok(await owner.client.from("contacts").select("id").eq("organization_id", org)), []);
    });

    await t.test("anyone reads public plans and modules; nobody but the server writes them", async () => {
      const anonymous = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
      const publicPlans = ok(await anonymous.from("plans").select("code"));
      assert.ok(publicPlans.some((p) => p.code === "completo"));
      const hidden = await testPlan({ is_public: false });
      assert.ok(!ok(await owner.client.from("plans").select("id")).some((p) => p.id === hidden.id));
      assert.ok(ok(await anonymous.from("modules").select("code")).length >= 4);
      denied(await owner.client.from("plans").insert({ code: "hack", name: "Hack", price_cents: 0 }));
      const org = await newOrg(owner, "Sem permissao");
      const completo = ok(await owner.client.from("plans").select("id").eq("code", "completo").single());
      denied(
        await owner.client.from("subscriptions").insert({
          organization_id: org,
          plan_id: completo.id,
          status: "active",
          current_period_end: new Date(Date.now() + 864e5).toISOString(),
        })
      );
      denied(await owner.client.from("organization_addons").insert({ organization_id: org, module: "atendimento" }));
    });

    await t.test("only the owner starts a trial, once, and gets exactly the plan modules", async () => {
      const org = await newOrg(owner, "Trial");
      const invite = ok(await owner.client.rpc("invite_member", { org, invite_email: agent.email, invite_role: "agent" }));
      ok(await agent.client.rpc("accept_invitation", { invite_token: invite.token, display_name: "Agente" }));
      denied(await agent.client.rpc("start_trial", { org, plan_code: "analise" }), /owner/);
      denied(await other.client.rpc("start_trial", { org, plan_code: "analise" }));
      ok(await owner.client.rpc("start_trial", { org, plan_code: "analise" }));
      const entitlements = ok(await owner.client.rpc("my_entitlements", { org }));
      assert.equal(entitlements.status, "trialing");
      assert.deepEqual(entitlements.modules, ["analise_curricular", "grades_comerciais"]);
      denied(await owner.client.rpc("start_trial", { org, plan_code: "completo" }), /Trial already used/);
      denied(await owner.client.from("contacts").insert({ organization_id: org, name: "Fora do plano" }), /Module not available/);
      denied(await other.client.rpc("my_entitlements", { org }));
    });

    await t.test("past due becomes read-only after grace; suspension blocks reads", async () => {
      const org = await newOrg(owner, "Inadimplente");
      await activatePlan(admin, org, "atendimento");
      const contact = ok(
        await owner.client.from("contacts").insert({ organization_id: org, name: "Antes" }).select().single()
      );
      ok(
        await admin
          .from("subscriptions")
          .update({ status: "past_due", current_period_end: new Date(Date.now() - 8 * 864e5).toISOString() })
          .eq("organization_id", org)
      );
      assert.equal(ok(await owner.client.rpc("my_entitlements", { org })).access, "read_only");
      assert.equal(ok(await owner.client.from("contacts").select("id").eq("id", contact.id)).length, 1);
      denied(await owner.client.from("contacts").insert({ organization_id: org, name: "Depois" }), /Module not available/);
      ok(await admin.from("subscriptions").update({ status: "suspended" }).eq("organization_id", org));
      assert.equal(ok(await owner.client.from("contacts").select("id").eq("id", contact.id)).length, 0);
    });

    await t.test("platform admin can grant an add-on module", async () => {
      const org = await newOrg(owner, "Addon");
      ok(await admin.from("organization_addons").insert({ organization_id: org, module: "atendimento" }));
      assert.deepEqual(ok(await owner.client.rpc("my_entitlements", { org })).modules, ["atendimento"]);
      ok(await owner.client.from("contacts").insert({ organization_id: org, name: "Liberado" }));
      ok(
        await admin
          .from("organization_addons")
          .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
          .eq("organization_id", org)
      );
      denied(await owner.client.from("contacts").insert({ organization_id: org, name: "Expirado" }));
    });

    await t.test("concurrent quota consumption never exceeds the plan limit", async () => {
      const plan = await testPlan({ modules: ["analise_curricular"], limits: { analyses: 5 } });
      const quotaOwner = await fixture("quota");
      const org = await newOrg(quotaOwner, "Cota");
      await activatePlan(admin, org, plan.code);
      const results = await Promise.all(
        Array.from({ length: 12 }, () => quotaOwner.client.rpc("consume_quota", { org, metric: "analyses", amount: 1 }))
      );
      assert.equal(results.filter((r) => !r.error).length, 5);
      assert.ok(results.filter((r) => r.error).every((r) => /Quota exceeded/.test(r.error.message)));
      denied(await other.client.rpc("consume_quota", { org, metric: "analyses", amount: 1 }));
    });

    await t.test("user and channel limits come from the plan", async () => {
      const plan = await testPlan({ modules: ["atendimento"], limits: { users: 1, channels: 1 } });
      const limitOwner = await fixture("limits");
      const org = await newOrg(limitOwner, "Limites");
      await activatePlan(admin, org, plan.code);
      const invite = ok(await limitOwner.client.rpc("invite_member", { org, invite_email: other.email, invite_role: "agent" }));
      denied(
        await other.client.rpc("accept_invitation", { invite_token: invite.token, display_name: "Outro" }),
        /User limit reached/
      );
      ok(await limitOwner.client.rpc("create_channel", { org, channel_name: "Canal 1", channel_provider: "simulator" }));
      denied(
        await limitOwner.client.rpc("create_channel", { org, channel_name: "Canal 2", channel_provider: "simulator" }),
        /Channel limit reached/
      );
    });

    await t.test("payment events are idempotent, ordered and server-only", async () => {
      const billingOwner = await fixture("billing");
      const org = await newOrg(billingOwner, "Pagamentos");
      const yearly = await testPlan({ modules: ["atendimento"], billing_interval: "year", price_cents: 100000 });
      const monthly = await testPlan({ modules: ["atendimento", "analise_curricular"], price_cents: 9900 });
      const efiSubscription = Math.floor(Math.random() * 1e9);
      ok(
        await admin.from("subscriptions").insert({
          organization_id: org,
          plan_id: monthly.id,
          status: "incomplete",
          current_period_end: new Date().toISOString(),
          efi_subscription_id: efiSubscription,
          payment_method: "boleto",
        })
      );
      assert.equal(ok(await billingOwner.client.rpc("my_entitlements", { org })).access, "none");
      const event = (id, kind, charge, occurredAt) => ({
        event_id: `test:${org}:${id}`,
        kind,
        org: null,
        efi_subscription: efiSubscription,
        efi_charge: charge,
        amount: 9900,
        occurred_at: occurredAt,
        payload: { test: true },
      });
      denied(await billingOwner.client.rpc("billing_apply_event", event("forged", "paid", 1, new Date().toISOString())));
      const firstCharge = Math.floor(Math.random() * 1e9);
      assert.equal(ok(await admin.rpc("billing_apply_event", event("1", "paid", firstCharge, new Date().toISOString()))), true);
      assert.equal(ok(await admin.rpc("billing_apply_event", event("1", "paid", firstCharge, new Date().toISOString()))), false);
      let sub = ok(await admin.from("subscriptions").select("*").eq("organization_id", org).single());
      assert.equal(sub.status, "active");
      const firstEnd = new Date(sub.current_period_end).getTime();
      assert.ok(firstEnd > Date.now() + 27 * 864e5 && firstEnd < Date.now() + 32 * 864e5);
      assert.equal(ok(await admin.from("invoices").select("id").eq("organization_id", org)).length, 1);
      // Renewal paid early extends from the end of the current period, never shrinking it.
      ok(await admin.rpc("billing_apply_event", event("2", "paid", firstCharge + 1, new Date().toISOString())));
      sub = ok(await admin.from("subscriptions").select("*").eq("organization_id", org).single());
      assert.ok(new Date(sub.current_period_end).getTime() > firstEnd + 27 * 864e5);
      // A pending downgrade takes effect on the next paid renewal.
      ok(await admin.from("subscriptions").update({ pending_plan_id: yearly.id }).eq("organization_id", org));
      ok(await admin.rpc("billing_apply_event", event("3", "paid", firstCharge + 2, new Date().toISOString())));
      sub = ok(await admin.from("subscriptions").select("*").eq("organization_id", org).single());
      assert.equal(sub.plan_id, yearly.id);
      assert.equal(sub.pending_plan_id, null);
      assert.deepEqual(ok(await billingOwner.client.rpc("my_entitlements", { org })).modules, ["atendimento"]);
      ok(await admin.rpc("billing_apply_event", event("4", "unpaid", firstCharge + 3, null)));
      assert.equal(ok(await admin.from("subscriptions").select("status").eq("organization_id", org).single()).status, "past_due");
      ok(await admin.rpc("billing_apply_event", event("5", "canceled", null, null)));
      sub = ok(await admin.from("subscriptions").select("*").eq("organization_id", org).single());
      assert.equal(sub.status, "canceled");
      assert.equal(ok(await billingOwner.client.rpc("my_entitlements", { org })).access, "full");
      // Events from a replaced provider subscription are recorded but change nothing.
      ok(await admin.from("subscriptions").update({ efi_subscription_id: efiSubscription + 1 }).eq("organization_id", org));
      ok(await admin.rpc("billing_apply_event", { ...event("6", "unpaid", null, null), org }));
      assert.equal(ok(await admin.from("subscriptions").select("status").eq("organization_id", org).single()).status, "canceled");
      denied(await billingOwner.client.from("billing_profiles").insert({ organization_id: org, payer_name: "X", document: "12345678901", email: "a@b.c", phone: "11999999999" }));
    });

    await t.test("only registered platform admins are recognized", async () => {
      assert.equal(ok(await owner.client.rpc("am_platform_admin")), false);
      await pool.query("insert into private.platform_admins(user_id) values ($1)", [other.user.id]);
      assert.equal(ok(await other.client.rpc("am_platform_admin")), true);
      assert.equal(ok(await owner.client.rpc("am_platform_admin")), false);
      denied(await owner.client.schema("private").from("platform_admins").insert({ user_id: owner.user.id }));
    });
  } finally {
    for (const id of orgs) ok(await admin.from("organizations").delete().eq("id", id));
    if (plans.length) ok(await admin.from("plans").delete().in("id", plans));
    for (const user of users) ok(await admin.auth.admin.deleteUser(user.user.id));
    await pool.end();
  }
});
