import { Request, Response } from "express";
import { emitTicketEvent } from "../libs/socket";

import CreateTicketService from "../services/TicketServices/CreateTicketService";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import AppError from "../errors/AppError";
import ShowUserService from "../services/UserServices/ShowUserService";
import formatBody from "../helpers/Mustache";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
  date: string;
  showAll: string;
  withUnreadMessages: string;
  queueIds: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    withUnreadMessages
  } = req.query as IndexQuery;

  const userId = req.user.id;

  let queueIds: number[] = [];

  if (queueIdsStringified) {
    try {
      queueIds = JSON.parse(queueIdsStringified);
      if (!Array.isArray(queueIds) || queueIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error();
    } catch { throw new AppError("ERR_INVALID_QUEUE_IDS", 400); }
  }

  const { tickets, count, hasMore } = await ListTicketsService({
    searchParam,
    pageNumber,
    status,
    date,
    showAll,
    userId,
    queueIds,
    withUnreadMessages
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status }: TicketData = req.body;
  const userId = req.user.profile === "admin" ? (req.body.userId || Number(req.user.id)) : Number(req.user.id);

  const ticket = await CreateTicketService({ contactId, status, userId });

  await emitTicketEvent("ticket", { action: "update", ticket }, ticket);

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const contact = await ShowTicketService(ticketId);

  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;
  const ticketData: TicketData = req.body;
  if (req.user.profile !== "admin") {
    const actor = await ShowUserService(req.user.id);
    if (ticketData.userId !== undefined && ticketData.userId !== null && ticketData.userId !== Number(req.user.id)) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
    if (ticketData.queueId !== undefined && ticketData.queueId !== null && !actor.queues.some(queue => queue.id === ticketData.queueId)) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
  }

  const { ticket } = await UpdateTicketService({
    ticketData,
    ticketId
  });

  if (ticket.status === "closed") {
    const whatsapp = await ShowWhatsAppService(ticket.whatsappId);

    const { farewellMessage } = whatsapp;

    if (farewellMessage) {
      await SendWhatsAppMessage({
        body: formatBody(farewellMessage, ticket.contact),
        ticket
      });
    }
  }

  return res.status(200).json(ticket);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const ticket = await DeleteTicketService(ticketId);

  await emitTicketEvent("ticket", { action: "delete", ticketId: +ticketId }, ticket);

  return res.status(200).json({ message: "ticket deleted" });
};
