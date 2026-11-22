import { Request, Response, NextFunction } from "express";
import { uuidv7 } from "uuidv7";
import { asyncLocalStorage } from "../lib/context";

export const CORRELATION_HEADER = "x-correlation-id";

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId =
    (req.headers[CORRELATION_HEADER] as string | undefined) ||
    (req.headers["x-request-id"] as string | undefined);

  const correlationId = incomingId || uuidv7();

  res.setHeader(CORRELATION_HEADER, correlationId);

  asyncLocalStorage.run({ correlationId }, () => {
    next();
  });
}
