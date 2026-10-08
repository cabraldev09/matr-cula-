import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import ticketAccess from "../middleware/ticketAccess";
import uploadConfig from "../config/upload";

import * as MessageController from "../controllers/MessageController";

const messageRoutes = Router();

const upload = multer({ ...uploadConfig, limits: { fileSize: 20 * 1024 * 1024, files: 10 } });

messageRoutes.get("/messages/:ticketId", isAuth, ticketAccess, MessageController.index);

messageRoutes.post(
  "/messages/:ticketId",
  isAuth,
  ticketAccess,
  upload.array("medias"),
  MessageController.store
);

messageRoutes.delete("/messages/:messageId", isAuth, ticketAccess, MessageController.remove);

export default messageRoutes;
