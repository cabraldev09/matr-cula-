import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../frontend/package.json", import.meta.url)
);
const { createClient } = require("@supabase/supabase-js");
const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
);
assert.equal(
  new URL(status.API_URL).hostname,
  "127.0.0.1",
  "Tests must use the dedicated local Supabase"
);
assert.equal(new URL(status.API_URL).port, "56421");
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(status.API_URL, status.SECRET_KEY, options);
const ok = (result) => {
  assert.equal(result.error, null, result.error?.message);
  return result.data;
};
const denied = (result) =>
  assert.ok(result.error, "Expected database/API to reject the request");

export async function createFixtureUser(prefix = "test") {
  const email = `${prefix}-${randomUUID()}@example.test`,
    password = `T-${randomUUID()}-x9!`;
  const user = ok(
    await admin.auth.admin.createUser({ email, password, email_confirm: true })
  ).user;
  const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
  ok(await client.auth.signInWithPassword({ email, password }));
  return { user, client, email, password };
}

test("SaaS: isolation, permissions, onboarding and durable records", async (t) => {
  const users = [],
    organizations = [],
    uploaded = [];
  try {
    for (const prefix of ["owner-a", "owner-b", "agent", "outsider"])
      users.push(await createFixtureUser(prefix));
    const [a, b, agent, outsider] = users;
    const orgA = ok(
      await a.client.rpc("create_organization", {
        org_name: "Empresa A",
        display_name: "Dono A",
      })
    );
    organizations.push(orgA);
    const orgB = ok(
      await b.client.rpc("create_organization", {
        org_name: "Empresa B",
        display_name: "Dono B",
      })
    );
    organizations.push(orgB);
    const contactA = ok(
      await a.client
        .from("contacts")
        .insert({
          organization_id: orgA,
          name: "Cliente A",
          phone: "5569999999999",
        })
        .select()
        .single()
    );
    const contactB = ok(
      await b.client
        .from("contacts")
        .insert({
          organization_id: orgB,
          name: "Cliente B",
          phone: "5569999999999",
        })
        .select()
        .single()
    );
    const teamA = ok(
      await a.client
        .from("teams")
        .insert({ organization_id: orgA, name: "Equipe A" })
        .select()
        .single()
    );
    const teamB = ok(
      await b.client
        .from("teams")
        .insert({ organization_id: orgB, name: "Equipe B" })
        .select()
        .single()
    );

    await t.test(
      "organization is created with exactly one owner bound to current identity",
      async () => {
        const rows = ok(
          await a.client
            .from("memberships")
            .select("*")
            .eq("organization_id", orgA)
        );
        assert.equal(rows.length, 1);
        assert.equal(rows[0].user_id, a.user.id);
        assert.equal(rows[0].role, "owner");
      }
    );
    await t.test(
      "another company is invisible even with a known ID",
      async () => {
        assert.deepEqual(
          ok(await a.client.from("contacts").select("*").eq("id", contactB.id)),
          []
        );
        assert.deepEqual(
          ok(await a.client.from("organizations").select("*").eq("id", orgB)),
          []
        );
        assert.deepEqual(
          ok(await outsider.client.from("memberships").select("*")),
          []
        );
      }
    );
    await t.test(
      "cross-tenant writes and updates are rejected or affect zero rows",
      async () => {
        denied(
          await a.client
            .from("contacts")
            .insert({ organization_id: orgB, name: "Intruso" })
        );
        assert.deepEqual(
          ok(
            await a.client
              .from("contacts")
              .update({ name: "Hack" })
              .eq("id", contactB.id)
              .select()
          ),
          []
        );
        assert.equal(
          ok(
            await b.client
              .from("contacts")
              .select("name")
              .eq("id", contactB.id)
              .single()
          ).name,
          "Cliente B"
        );
      }
    );
    await t.test(
      "ownership cannot be moved by editing organization_id",
      async () => {
        denied(
          await a.client
            .from("contacts")
            .update({ organization_id: orgB })
            .eq("id", contactA.id)
        );
      }
    );
    await t.test(
      "memberships cannot be forged or promoted through Data API",
      async () => {
        denied(
          await outsider.client
            .from("memberships")
            .insert({
              organization_id: orgA,
              user_id: outsider.user.id,
              role: "owner",
            })
        );
        denied(
          await a.client
            .from("memberships")
            .update({ role: "owner" })
            .eq("user_id", agent.user.id)
        );
      }
    );
    let invitation;
    await t.test(
      "invites reject owner role and never expose plaintext token in list",
      async () => {
        denied(
          await a.client.rpc("invite_member", {
            org: orgA,
            invite_email: agent.email,
            invite_role: "owner",
          })
        );
        invitation = ok(
          await a.client.rpc("invite_member", {
            org: orgA,
            invite_email: agent.email,
            invite_role: "agent",
          })
        );
        const row = ok(
          await a.client
            .from("invitations")
            .select("*")
            .eq("id", invitation.id)
            .single()
        );
        assert.ok(row.token_hash);
        assert.ok(!JSON.stringify(row).includes(invitation.token));
        assert.deepEqual(
          ok(
            await b.client
              .from("invitations")
              .select("*")
              .eq("id", invitation.id)
          ),
          []
        );
      }
    );
    await t.test(
      "wrong email cannot accept invite and cannot spoof identity through user metadata",
      async () => {
        ok(
          await outsider.client.auth.updateUser({
            data: { email: agent.email, role: "owner", organization_id: orgA },
          })
        );
        denied(
          await outsider.client.rpc("accept_invitation", {
            invite_token: invitation.token,
            display_name: "Intruso",
          })
        );
      }
    );
    await t.test("intended recipient can accept once", async () => {
      assert.equal(
        ok(
          await agent.client.rpc("accept_invitation", {
            invite_token: invitation.token,
            display_name: "Atendente",
          })
        ),
        orgA
      );
      denied(
        await agent.client.rpc("accept_invitation", {
          invite_token: invitation.token,
          display_name: "Atendente",
        })
      );
    });
    await t.test(
      "agent can create contacts but cannot edit configuration or invite",
      async () => {
        ok(
          await agent.client
            .from("contacts")
            .insert({ organization_id: orgA, name: "Contato do atendente" })
        );
        denied(
          await agent.client
            .from("teams")
            .insert({ organization_id: orgA, name: "Equipe proibida" })
        );
        denied(
          await agent.client.rpc("invite_member", {
            org: orgA,
            invite_email: outsider.email,
            invite_role: "agent",
          })
        );
      }
    );
    await t.test(
      "same-tenant foreign keys prevent mixing contacts and departments",
      async () => {
        denied(
          await a.client
            .from("conversations")
            .insert({
              organization_id: orgA,
              contact_id: contactB.id,
              team_id: teamA.id,
            })
        );
        denied(
          await a.client
            .from("conversations")
            .insert({
              organization_id: orgA,
              contact_id: contactA.id,
              team_id: teamB.id,
            })
        );
      }
    );
    const conversation = ok(
      await a.client
        .from("conversations")
        .insert({
          organization_id: orgA,
          contact_id: contactA.id,
          team_id: teamA.id,
          subject: "Teste",
        })
        .select()
        .single()
    );
    await t.test(
      "agent outside department cannot read conversation or notes",
      async () => {
        assert.deepEqual(
          ok(
            await agent.client
              .from("conversations")
              .select("*")
              .eq("id", conversation.id)
          ),
          []
        );
        denied(
          await agent.client.rpc("claim_conversation", {
            conversation: conversation.id,
          })
        );
        denied(
          await agent.client
            .from("internal_notes")
            .insert({
              organization_id: orgA,
              conversation_id: conversation.id,
              body: "No access",
            })
        );
      }
    );
    await t.test(
      "assignment is atomic with two simultaneous claim attempts",
      async () => {
        ok(
          await a.client
            .from("team_members")
            .insert({
              organization_id: orgA,
              team_id: teamA.id,
              user_id: agent.user.id,
            })
        );
        const results = await Promise.all([
          a.client.rpc("claim_conversation", { conversation: conversation.id }),
          agent.client.rpc("claim_conversation", {
            conversation: conversation.id,
          }),
        ]);
        assert.equal(results.filter((r) => !r.error).length, 1);
        assert.equal(results.filter((r) => r.error).length, 1);
        const ticket = ok(
          await a.client
            .from("conversations")
            .select("*")
            .eq("id", conversation.id)
            .single()
        );
        assert.equal(ticket.status, "open");
        assert.ok([a.user.id, agent.user.id].includes(ticket.assigned_to));
        denied(
          await agent.client
            .from("conversations")
            .update({ assigned_to: agent.user.id })
            .eq("id", conversation.id)
        );
      }
    );
    await t.test(
      "unassigned agent cannot resolve a pending conversation",
      async () => {
        const pending = ok(
          await a.client
            .from("conversations")
            .insert({ organization_id: orgA, contact_id: contactA.id })
            .select()
            .single()
        );
        denied(
          await agent.client.rpc("close_conversation", {
            conversation: pending.id,
          })
        );
      }
    );
    await t.test(
      "notes use caller identity and cannot be attributed to someone else",
      async () => {
        ok(
          await agent.client
            .from("internal_notes")
            .insert({
              organization_id: orgA,
              conversation_id: conversation.id,
              author_id: agent.user.id,
              body: "Nota interna",
            })
        );
        denied(
          await agent.client
            .from("internal_notes")
            .insert({
              organization_id: orgA,
              conversation_id: conversation.id,
              author_id: a.user.id,
              body: "Forged",
            })
        );
        assert.deepEqual(
          ok(
            await b.client
              .from("internal_notes")
              .select("*")
              .eq("conversation_id", conversation.id)
          ),
          []
        );
      }
    );
    await t.test(
      "private files enforce company and conversation permissions",
      async () => {
        const path = `${orgA}/${conversation.id}/${randomUUID()}.txt`;
        uploaded.push(path);
        ok(
          await a.client.storage
            .from("attachments")
            .upload(path, new Blob(["private test"]), {
              contentType: "text/plain",
            })
        );
        assert.equal(
          (await a.client.storage.from("attachments").createSignedUrl(path, 60))
            .error,
          null
        );
        denied(
          await b.client.storage.from("attachments").createSignedUrl(path, 60)
        );
        denied(
          await b.client.storage
            .from("attachments")
            .upload(
              `${orgA}/${conversation.id}/${randomUUID()}.txt`,
              new Blob(["forged"])
            )
        );
        const anonymous = createClient(
          status.API_URL,
          status.PUBLISHABLE_KEY,
          options
        );
        const publicUrl = anonymous.storage
          .from("attachments")
          .getPublicUrl(path).data.publicUrl;
        assert.notEqual((await fetch(publicUrl)).status, 200);
      }
    );
    await t.test("revoked and expired invites cannot be redeemed", async () => {
      const revoked = ok(
        await a.client.rpc("invite_member", {
          org: orgA,
          invite_email: outsider.email,
          invite_role: "agent",
        })
      );
      ok(
        await a.client.rpc("revoke_invitation", { invitation_id: revoked.id })
      );
      denied(
        await outsider.client.rpc("accept_invitation", {
          invite_token: revoked.token,
          display_name: "Teste",
        })
      );
      const expired = ok(
        await a.client.rpc("invite_member", {
          org: orgA,
          invite_email: outsider.email,
          invite_role: "agent",
        })
      );
      ok(
        await admin
          .from("invitations")
          .update({ expires_at: "2020-01-01T00:00:00Z" })
          .eq("id", expired.id)
      );
      denied(
        await outsider.client.rpc("accept_invitation", {
          invite_token: expired.token,
          display_name: "Teste",
        })
      );
    });
    await t.test(
      "removing membership immediately denies existing JWT while preserving authorship",
      async () => {
        const token = (await agent.client.auth.getSession()).data.session
          .access_token;
        ok(
          await a.client.rpc("remove_member", {
            org: orgA,
            member: agent.user.id,
          })
        );
        assert.equal(
          (await agent.client.auth.getSession()).data.session.access_token,
          token
        );
        assert.deepEqual(
          ok(
            await agent.client
              .from("contacts")
              .select("*")
              .eq("organization_id", orgA)
          ),
          []
        );
        denied(
          await agent.client.rpc("claim_conversation", {
            conversation: conversation.id,
          })
        );
        const notes = ok(
          await a.client
            .from("internal_notes")
            .select("*")
            .eq("conversation_id", conversation.id)
        );
        assert.equal(notes[0].author_id, agent.user.id);
        denied(
          await a.client.rpc("remove_member", { org: orgA, member: a.user.id })
        );
      }
    );
    await t.test(
      "anon cannot call onboarding RPCs or access tenant tables",
      async () => {
        const anonymous = createClient(
          status.API_URL,
          status.PUBLISHABLE_KEY,
          options
        );
        denied(
          await anonymous.rpc("create_organization", {
            org_name: "Intruder",
            display_name: "Anonymous",
          })
        );
        denied(await anonymous.from("contacts").select("*"));
      }
    );
  } finally {
    if (uploaded.length)
      ok(await admin.storage.from("attachments").remove(uploaded));
    for (const id of organizations)
      ok(await admin.from("organizations").delete().eq("id", id));
    for (const { user, client } of users) {
      await client.auth.signOut();
      ok(await admin.auth.admin.deleteUser(user.id));
    }
  }
});
