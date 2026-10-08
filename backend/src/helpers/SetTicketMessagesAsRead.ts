import { emitTicketEvent } from "../libs/socket";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import { logger } from "../utils/logger";
import { whatsappProvider } from "../providers/WhatsApp";

const SetTicketMessagesAsRead = async (ticket: Ticket): Promise<void> => {
  await Message.update(
    { read: true },
    {
      where: {
        ticketId: ticket.id,
        read: false
      }
    }
  );

  await ticket.update({ unreadMessages: 0 });

  try {
    if (ticket.whatsappId) {
      await whatsappProvider.sendSeen(
        ticket.whatsappId,
        `${ticket.contact.number}@${ticket.isGroup ? "g" : "c"}.us`
      );
    }
  } catch (err) {
    logger.warn(
      `Could not mark messages as read. Maybe whatsapp session disconnected? Err: ${err}`
    );
  }

  await emitTicketEvent("ticket", { action: "updateUnread", ticketId: ticket.id }, ticket);
};

export default SetTicketMessagesAsRead;
