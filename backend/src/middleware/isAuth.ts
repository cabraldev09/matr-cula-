import { verify } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import authConfig from "../config/auth";
import ShowUserService from "../services/UserServices/ShowUserService";

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  iat: number;
  exp: number;
  tokenVersion: number;
}

const isAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }

  const [, token] = authHeader.split(" ");

  try {
    const decoded = verify(token, authConfig.secret);
    const { id, tokenVersion } = decoded as TokenPayload;
    const currentUser = await ShowUserService(id);
    if (tokenVersion !== currentUser.tokenVersion) throw new Error("Revoked session");

    req.user = {
      id,
      profile: currentUser.profile
    };
  } catch (err) {
    throw new AppError(
      "Invalid token. We'll try to assign a new one on next request",
      403
    );
  }

  return next();
};

export default isAuth;
