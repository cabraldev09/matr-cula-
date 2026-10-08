import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
const backendRequire = createRequire(
  new URL("../backend/package.json", import.meta.url)
);
const frontendRequire = createRequire(
  new URL("../frontend/package.json", import.meta.url)
);
process.env.JWT_SECRET = "socket-test-secret-".repeat(3);
process.env.JWT_REFRESH_SECRET = "socket-refresh-secret-".repeat(3);
const users = new Map([
  [1, { id: 1, profile: "admin", tokenVersion: 0, queues: [] }],
  [2, { id: 2, profile: "user", tokenVersion: 0, queues: [{ id: 5 }] }],
  [3, { id: 3, profile: "user", tokenVersion: 0, queues: [{ id: 8 }] }],
]);
backendRequire("./dist/services/UserServices/ShowUserService.js").default =
  async (id) => {
    const user = users.get(Number(id));
    if (!user) throw new Error("Missing user");
    return user;
  };
backendRequire("./dist/services/TicketServices/ShowTicketService.js").default =
  async () => ({ userId: 2, queueId: 5 });
const { initIO, emitTicketEvent } = backendRequire("./dist/libs/socket.js");
const { sign } = backendRequire("jsonwebtoken");
const config = backendRequire("./dist/config/auth.js").default;
const { io: connect } = frontendRequire("socket.io-client");

const waitFor = (socket, event) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Missing event: ${event}`)),
      3000
    );
    socket.once(event, (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    });
  });

test("Community realtime authorizes socket connections and every ticket delivery", async (t) => {
  const http = createServer();
  const server = initIO(http);
  const clients = [];
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${http.address().port}`;
  try {
    const login = async (id) => {
      const token = sign({ id, tokenVersion: 0 }, config.secret, {
        expiresIn: "1h",
      });
      const socket = connect(url, {
        transports: ["websocket"],
        query: { token },
        forceNew: true,
      });
      clients.push(socket);
      await waitFor(socket, "connect");
      return socket;
    };
    const [admin, agent, stranger] = await Promise.all([
      login(1),
      login(2),
      login(3),
    ]);
    await t.test("unknown token is rejected during handshake", async () => {
      const socket = connect(url, {
        transports: ["websocket"],
        query: { token: "invalid" },
        forceNew: true,
        reconnection: false,
      });
      clients.push(socket);
      assert.equal(
        (await waitFor(socket, "connect_error")).message,
        "Unauthorized"
      );
    });
    await t.test("unauthorized ticket room cannot be joined", async () => {
      const event = waitFor(stranger, "accessDenied");
      stranger.emit("joinChatBox", "1");
      assert.equal((await event).resource, "ticket");
    });
    await t.test(
      "global status subscription does not leak ticket payloads",
      async () => {
        stranger.emit("joinTickets", "open");
        stranger.emit("joinNotification");
        const received = [];
        stranger.on("ticket", (event) => received.push(event));
        const adminEvent = waitFor(admin, "ticket"),
          agentEvent = waitFor(agent, "ticket");
        await emitTicketEvent(
          "ticket",
          { secret: "authorized" },
          { userId: 2, queueId: 5 }
        );
        assert.equal((await adminEvent).secret, "authorized");
        assert.equal((await agentEvent).secret, "authorized");
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.deepEqual(received, []);
      }
    );
    await t.test(
      "existing socket is rechecked after a session is revoked",
      async () => {
        users.get(2).tokenVersion = 1;
        const disconnect = waitFor(agent, "disconnect");
        await emitTicketEvent(
          "ticket",
          { secret: "revoked" },
          { userId: 2, queueId: 5 }
        );
        await disconnect;
        assert.equal(agent.connected, false);
      }
    );
  } finally {
    clients.forEach((socket) => socket.disconnect());
    await new Promise((resolve) => server.close(resolve));
  }
});
