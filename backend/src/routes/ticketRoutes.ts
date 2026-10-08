import express from "express";
import isAuth from "../middleware/isAuth";
import ticketAccess from "../middleware/ticketAccess";

import * as TicketController from "../controllers/TicketController";

const ticketRoutes = express.Router();

ticketRoutes.get("/tickets", isAuth, TicketController.index);

ticketRoutes.get("/tickets/:ticketId", isAuth, ticketAccess, TicketController.show);

ticketRoutes.post("/tickets", isAuth, TicketController.store);

ticketRoutes.put("/tickets/:ticketId", isAuth, ticketAccess, TicketController.update);

ticketRoutes.delete("/tickets/:ticketId", isAuth, ticketAccess, TicketController.remove);

export default ticketRoutes;
