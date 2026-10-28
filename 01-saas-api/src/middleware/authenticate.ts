import { Request, Response, NextFunction } from "express";
import { UnauthorizedError } from "../lib/apiError";
import { verifyAccessToken } from "../lib/crypto";
import { getRequestContext } from "../lib/context";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    throw new UnauthorizedError(
      "Missing or Invalid Authorization header. Expected 'Bearer <token>",
      "MISSING_TOKEN",
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token) throw new UnauthorizedError("Bearer token is empty", "INVALID TOKEN");

  const decoded = verifyAccessToken(token);

  req.user = {
    id: decoded.sub,
    email: decoded.email,
  };

  const store = getRequestContext();
  if (store) store.userId = decoded.sub;

  next();
}
