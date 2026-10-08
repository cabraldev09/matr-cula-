import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { canAccessTicket } = require("../backend/dist/security/ticketAccess.js");
const agent = { id: "2", profile: "user", queues: [{ id: 5 }] };
test("Community: agent is denied tickets assigned to another user", () => {
  assert.equal(canAccessTicket(agent, { userId: 3, queueId: 5 }), false);
});
test("Community: queue assignment is checked even for personal tickets", () => {
  assert.equal(canAccessTicket(agent, { userId: 2, queueId: 9 }), false);
});
test("Community: agent can access their tickets and unassigned queue tickets", () => {
  assert.equal(canAccessTicket(agent, { userId: 2, queueId: 5 }), true);
  assert.equal(canAccessTicket(agent, { userId: null, queueId: 5 }), true);
  assert.equal(canAccessTicket(agent, { userId: null, queueId: null }), true);
});
test("Community: administrator can supervise all tickets", () => {
  assert.equal(
    canAccessTicket({ ...agent, profile: "admin" }, { userId: 3, queueId: 9 }),
    true
  );
});
