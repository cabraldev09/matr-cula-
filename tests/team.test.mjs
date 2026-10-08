import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
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

test("Team: role changes follow the organization's authority rules", async () => {
  const users = [];
  let org;
  const fixture = async (prefix) => {
    const email = `${prefix}-${randomUUID()}@example.test`,
      password = `Pass-${randomUUID()}!`;
    const user = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user;
    const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
    ok(await client.auth.signInWithPassword({ email, password }));
    users.push({ user, client, email });
    return { user, client, email };
  };
  const join = async (owner, member, role) => {
    const invite = ok(await owner.client.rpc("invite_member", { org, invite_email: member.email, invite_role: role }));
    ok(await member.client.rpc("accept_invitation", { invite_token: invite.token, display_name: "Membro" }));
  };
  try {
    const owner = await fixture("owner");
    const manager = await fixture("manager");
    const agent = await fixture("agent");
    const outsider = await fixture("outsider");
    org = ok(await owner.client.rpc("create_organization", { org_name: "Equipe", display_name: "Dono" }));
    await join(owner, manager, "admin");
    await join(owner, agent, "agent");
    const roleOf = async (user) =>
      ok(await admin.from("memberships").select("role").eq("organization_id", org).eq("user_id", user.user.id).single()).role;

    ok(await manager.client.rpc("set_member_role", { org, member: agent.user.id, new_role: "supervisor" }));
    assert.equal(await roleOf(agent), "supervisor");
    denied(await manager.client.rpc("set_member_role", { org, member: agent.user.id, new_role: "admin" }), /owner/);
    denied(await manager.client.rpc("set_member_role", { org, member: owner.user.id, new_role: "agent" }));
    denied(await manager.client.rpc("set_member_role", { org, member: manager.user.id, new_role: "agent" }));
    denied(await agent.client.rpc("set_member_role", { org, member: manager.user.id, new_role: "agent" }));
    denied(await outsider.client.rpc("set_member_role", { org, member: agent.user.id, new_role: "agent" }));
    denied(await owner.client.rpc("set_member_role", { org, member: agent.user.id, new_role: "owner" }), /Invalid role/);
    ok(await owner.client.rpc("set_member_role", { org, member: agent.user.id, new_role: "admin" }));
    assert.equal(await roleOf(agent), "admin");
    denied(await manager.client.rpc("set_member_role", { org, member: agent.user.id, new_role: "agent" }), /owner/);
    ok(await owner.client.rpc("set_member_role", { org, member: manager.user.id, new_role: "agent" }));
    assert.equal(await roleOf(manager), "agent");
  } finally {
    if (org) ok(await admin.from("organizations").delete().eq("id", org));
    for (const { user } of users) ok(await admin.auth.admin.deleteUser(user.id));
  }
});
