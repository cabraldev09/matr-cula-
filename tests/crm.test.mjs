import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { activatePlan } from "./helpers/plans.mjs";
const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
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

test("CRM: immediate leads, qualification, proposals and enrollment fee", async (t) => {
  const users = [],
    orgs = [],
    plans = [];
  const fixture = async (prefix) => {
    const email = `${prefix}-${randomUUID()}@example.test`,
      password = `Pass-${randomUUID()}!`;
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    users.push(user);
    return { user, client, email };
  };
  const newOrg = async (owner, name, plan = "completo") => {
    const id = ok(await owner.client.rpc("create_organization", { org_name: name, display_name: "Dono" }));
    orgs.push(id);
    await activatePlan(admin, id, plan);
    return id;
  };
  const simulate = async (owner, channel, body, phone = "5569991110000") =>
    ok(await owner.client.rpc("simulate_incoming", { channel, phone, contact_name: "Maria Lead", message_body: body, event_id: randomUUID() }));
  try {
    const owner = await fixture("crm-owner");
    const agent = await fixture("crm-agent");
    const other = await fixture("crm-other");
    const org = await newOrg(owner, "Polo CRM");
    const invite = ok(await owner.client.rpc("invite_member", { org, invite_email: agent.email, invite_role: "agent" }));
    ok(await agent.client.rpc("accept_invitation", { invite_token: invite.token, display_name: "Consultora" }));
    const course = ok(
      await owner.client
        .from("courses")
        .insert({ organization_id: org, name: "Administração", modality: "EAD - Graduação", semesters: 8, gross_monthly_cents: 101470, default_first_monthly_cents: 30675 })
        .select()
        .single()
    );
    const channel = ok(await owner.client.rpc("create_channel", { org, channel_name: "WhatsApp", channel_provider: "simulator" }));
    let lead;

    await t.test("a WhatsApp conversation creates the lead immediately and detects the course", async () => {
      await simulate(owner, channel, "Olá! Quero saber sobre a graduação em ADMINISTRACAO, por favor.");
      lead = ok(await agent.client.from("leads").select("*").eq("organization_id", org).single());
      assert.equal(lead.source, "whatsapp");
      assert.equal(lead.stage, "novo");
      assert.equal(lead.course_id, course.id);
      assert.equal(lead.incoming_messages, 1);
      assert.equal(lead.score, 25);
      assert.equal(lead.temperature, "frio");
      const events = ok(await agent.client.from("lead_events").select("kind").eq("lead_id", lead.id));
      assert.deepEqual(events.map((e) => e.kind), ["created"]);
      // A second conversation message does not create a second open lead.
      await simulate(owner, channel, "Tenho interesse");
      await simulate(owner, channel, "Começo no próximo semestre?");
      assert.equal(ok(await agent.client.from("leads").select("id").eq("organization_id", org)).length, 1);
    });

    await t.test("catalog prefixes such as 'CST em' are ignored when detecting the course", async () => {
      const tech = ok(
        await owner.client
          .from("courses")
          .insert({ organization_id: org, name: "Cst Em Análise E Desenvolvimento De Sistemas", modality: "EAD - Graduação", semesters: 4, gross_monthly_cents: 75630, default_first_monthly_cents: 14528 })
          .select()
          .single()
      );
      await simulate(owner, channel, "Quero fazer Análise e Desenvolvimento de Sistemas!", "5569991110099");
      const other = ok(await agent.client.from("leads").select("id, course_id, contacts!inner(phone)").eq("organization_id", org).eq("contacts.phone", "5569991110099").single());
      assert.equal(other.course_id, tech.id);
      ok(await owner.client.from("leads").delete().eq("id", other.id));
      ok(await owner.client.from("courses").delete().eq("id", tech.id));
    });

    await t.test("qualification answers raise the score and stage changes are logged", async () => {
      ok(
        await agent.client
          .from("leads")
          .update({ modality: "EAD - Graduação", entry_type: "transferencia", has_previous_studies: true, start_term: "2026.2", stage: "qualificado" })
          .eq("id", lead.id)
      );
      lead = ok(await agent.client.from("leads").select("*").eq("id", lead.id).single());
      assert.equal(lead.incoming_messages, 3);
      assert.equal(lead.score, 90);
      assert.equal(lead.temperature, "quente");
      const events = ok(await agent.client.from("lead_events").select("kind, payload").eq("lead_id", lead.id).eq("kind", "stage"));
      assert.deepEqual(events[0].payload, { from: "novo", to: "qualificado", reason: null });
      denied(await agent.client.from("leads").update({ score: 5 }).eq("id", lead.id));
      denied(await agent.client.from("lead_events").insert({ organization_id: org, lead_id: lead.id, kind: "paid", actor_id: agent.user.id }));
      ok(await agent.client.from("lead_events").insert({ organization_id: org, lead_id: lead.id, kind: "note", payload: { text: "Ligar amanhã" }, actor_id: agent.user.id }));
    });

    await t.test("proposals are numbered per organization and move the lead", async () => {
      const proposal = (n) => ({
        organization_id: org,
        lead_id: lead.id,
        student_name: "Maria Lead",
        course_name: "Administração",
        modality: "EAD - Graduação",
        semesters: 8,
        gross_monthly_cents: 101470,
        first_monthly_cents: 30675 + n,
        enrollment_fee_cents: 9900,
        start_term: "2026.2",
        created_by: agent.user.id,
      });
      const first = ok(await agent.client.from("proposals").insert(proposal(0)).select().single());
      const second = ok(await agent.client.from("proposals").insert(proposal(1)).select().single());
      assert.equal(first.number, 1);
      assert.equal(second.number, 2);
      assert.match(first.public_token, /^[0-9a-f]{36}$/);
      lead = ok(await agent.client.from("leads").select("*").eq("id", lead.id).single());
      assert.equal(lead.stage, "proposta");
      assert.equal(lead.proposal_id, second.id);
      assert.equal(lead.score, 100);
      denied(await agent.client.from("proposals").insert({ ...proposal(2), created_by: owner.user.id }));
    });

    await t.test("the enrollment fee is confirmed once and moves the lead to taxa_paga", async () => {
      denied(await agent.client.from("enrollment_charges").insert({ organization_id: org, lead_id: lead.id, amount_cents: 9900, method: "pix_manual", status: "paid" }));
      denied(await agent.client.from("enrollment_charges").insert({ organization_id: org, lead_id: lead.id, amount_cents: 9900, method: "efi_link" }));
      const charge = ok(await agent.client.from("enrollment_charges").insert({ organization_id: org, lead_id: lead.id, amount_cents: 9900, method: "pix_manual", pix_payload: "000201" }).select().single());
      assert.equal(ok(await agent.client.rpc("confirm_enrollment_charge", { charge: charge.id })), true);
      assert.equal(ok(await agent.client.rpc("confirm_enrollment_charge", { charge: charge.id })), false);
      lead = ok(await agent.client.from("leads").select("id, stage").eq("id", lead.id).single());
      assert.equal(lead.stage, "taxa_paga");
      assert.equal(ok(await agent.client.from("lead_events").select("id").eq("lead_id", lead.id).eq("kind", "paid")).length, 1);
      // Efí charges are confirmed only by the server (provider notification).
      const efi = ok(await admin.from("enrollment_charges").insert({ organization_id: org, lead_id: lead.id, amount_cents: 9900, method: "efi_link", efi_charge_id: Math.floor(Math.random() * 1e9) }).select().single());
      denied(await agent.client.rpc("confirm_enrollment_charge", { charge: efi.id }), /Permission denied/);
      assert.equal(ok(await admin.rpc("confirm_enrollment_charge", { efi_charge: efi.efi_charge_id })), true);
    });

    await t.test("other organizations and plans without CRM see nothing", async () => {
      assert.deepEqual(ok(await other.client.from("leads").select("id").eq("organization_id", org)), []);
      denied(await other.client.from("leads").update({ stage: "perdido" }).eq("id", lead.id).select().single());
      denied(await other.client.rpc("confirm_enrollment_charge", { charge: lead.id }));
      const attendanceOnly = ok(await admin.from("plans").insert({ code: `att-${randomUUID().slice(0, 6)}`, name: "Só atendimento", price_cents: 100, modules: ["atendimento"] }).select().single());
      plans.push(attendanceOnly.id);
      const plainOrg = await newOrg(other, "Sem CRM", attendanceOnly.code);
      const plainChannel = ok(await other.client.rpc("create_channel", { org: plainOrg, channel_name: "Canal", channel_provider: "simulator" }));
      await simulate(other, plainChannel, "Quero administração");
      assert.equal(ok(await admin.from("leads").select("id").eq("organization_id", plainOrg)).length, 0);
      denied(await other.client.from("courses").insert({ organization_id: plainOrg, name: "Direito", semesters: 10, gross_monthly_cents: 100, default_first_monthly_cents: 50 }), /Module not available/);
    });
  } finally {
    for (const id of orgs) ok(await admin.from("organizations").delete().eq("id", id));
    if (plans.length) ok(await admin.from("plans").delete().in("id", plans));
    for (const user of users) ok(await admin.auth.admin.deleteUser(user.id));
  }
});
