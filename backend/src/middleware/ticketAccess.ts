import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import Message from "../models/Message";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import ShowUserService from "../services/UserServices/ShowUserService";
import { canAccessTicket } from "../security/ticketAccess";

export const assertTicketAccess = async (userId: string | number, ticketId: string | number): Promise<void> => {
  const [user, ticket] = await Promise.all([
    ShowUserService(userId), ShowTicketService(ticketId)
  ]);
  if (!canAccessTicket(user, ticket)) throw new AppError("ERR_NO_PERMISSION", 403);
};

export default async function ticketAccess(req: Request, _: Response, next: NextFunction): Promise<void> {
  let ticketId = req.params.ticketId;
  if (req.params.messageId) {
    const message = await Message.findByPk(req.params.messageId);
    if (!message) throw new AppError("ERR_NO_MESSAGE_FOUND", 404);
    ticketId = String(message.ticketId);
  }
  await assertTicketAccess(req.user.id, ticketId);
  next();
}
