import { Request, Response, NextFunction } from "express";
import { verify } from "jsonwebtoken";
import authConfig from "../config/auth";
import AppError from "../errors/AppError";

export default function mediaAccess(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = req.query.mediaToken;
    if (typeof token !== "string") throw new Error("Missing capability");
    const payload = verify(token, authConfig.secret, { algorithms: ["HS256"] }) as {
      scope: string; filename: string;
    };
    const filename = decodeURIComponent(req.path.slice(1));
    if (payload.scope !== "media" || payload.filename !== filename || /[\\/]/.test(filename)) {
      throw new Error("Invalid capability");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    if (!/\.(png|jpe?g|webp|gif|mp3|ogg|wav|mp4|m4a|pdf)$/i.test(filename)) {
      res.setHeader("Content-Disposition", "attachment");
    }
    next();
  } catch { throw new AppError("ERR_NO_PERMISSION", 403); }
}
