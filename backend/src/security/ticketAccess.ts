export interface TicketAccessUser {
  id: string | number;
  profile: string;
  queues: Array<{ id: number }>;
}

export interface TicketAccessResource {
  userId: number | null;
  queueId: number | null;
}

export const canAccessTicket = (
  user: TicketAccessUser,
  ticket: TicketAccessResource
): boolean => {
  if (user.profile === "admin") return true;
  const belongsToQueue = ticket.queueId === null ||
    user.queues.some(queue => queue.id === ticket.queueId);
  return belongsToQueue && (ticket.userId === null || ticket.userId === Number(user.id));
};
