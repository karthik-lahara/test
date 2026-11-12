import { Request, Response, NextFunction } from "express";
import { AuthorizeError } from "@utils/errors";
import { JWTUserHandler, TokenPayload } from "@utils/jwt";

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

const jwtHandler = new JWTUserHandler();

/**
 * Protects routes: expects "Authorization: Bearer <accessToken>"
 * (or an "accessToken" cookie) and attaches the decoded payload to req.user
 */
export const authenticate = (req: AuthRequest, _res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.cookies?.accessToken;

  if (!token) return next(new AuthorizeError("Access token missing"));

  try {
    req.user = jwtHandler.verifyAccessToken(token);
    next();
  } catch (error) {
    next(error);
  }
};
