import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import { verify } from "jsonwebtoken";
import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import ShowUserService from "../services/UserServices/ShowUserService";
import { assertTicketAccess } from "../middleware/ticketAccess";
import { canAccessTicket, TicketAccessResource } from "../security/ticketAccess";

let io: SocketIO;
const identities = new Map<string, { id: number; tokenVersion: number }>();

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, { cors: { origin: process.env.FRONTEND_URL } });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.query.token;
      if (typeof token !== "string") throw new Error("Missing token");
      const decoded = verify(token, authConfig.secret) as { id: number; tokenVersion: number };
      const user = await ShowUserService(decoded.id);
      if (decoded.tokenVersion !== user.tokenVersion) throw new Error("Revoked token");
      identities.set(socket.id, { id: user.id, tokenVersion: user.tokenVersion });
      next();
    } catch { next(new Error("Unauthorized")); }
  });
  io.on("connection", socket => {
    socket.on("joinChatBox", async (ticketId: string) => {
      try {
        if (!/^\d+$/.test(String(ticketId))) throw new Error("Invalid ticket");
        await assertTicketAccess(identities.get(socket.id)!.id, ticketId);
        socket.join(String(ticketId));
      } catch { socket.emit("accessDenied", { resource: "ticket" }); }
    });
    // Ticket events are delivered to authorized sockets individually, never global status rooms.
    socket.on("joinNotification", () => {});
    socket.on("joinTickets", () => {});
    socket.on("disconnect", () => { identities.delete(socket.id); });
  });
  return io;
};

export const getIO = (): SocketIO => {
  if (!io) throw new AppError("Socket IO not initialized");
  return io;
};

export const emitTicketEvent = async (
  event: string,
  payload: unknown,
  ticket: TicketAccessResource
): Promise<void> => {
  const server = getIO();
  await Promise.all(Array.from(server.sockets.sockets.values()).map(async socket => {
    const identity = identities.get(socket.id);
    if (!identity) return;
    try {
      const user = await ShowUserService(identity.id);
      if (identity.tokenVersion !== user.tokenVersion) { socket.disconnect(true); return; }
      if (canAccessTicket(user, ticket)) socket.emit(event, payload);
    } catch { socket.disconnect(true); }
  }));
};
