import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { ApiError, FieldError, sendProblemDetails } from "../lib/apiError";
import { logger } from "../config/logger";
import { getCorrelationId } from "../lib/context";
import { env } from "../config/env";

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const correlationId = getCorrelationId() || "unknown";

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const fieldErrors: FieldError[] = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));

    sendProblemDetails(res, {
      title: "Unprocessable Entity",
      status: 422,
      detail: "The request payload failed schema validation",
      instance: req.originalUrl,
      code: "VALIDATION_ERROR",
      correlationId,
      errors: fieldErrors,
    });
    return;
  }

  // 2. Known Operational ApiErrors (BadRequest, NotFound, Unauthorized, etc.)
  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, correlationId }, `Operational server error: ${err.message}`);
    } else {
      logger.warn({ err: err.detail, statusCode: err.statusCode, correlationId }, err.message);
    }

    sendProblemDetails(res, {
      title: err.message,
      status: err.statusCode,
      detail: err.detail,
      instance: req.originalUrl,
      code: err.code,
      correlationId,
      ...(err.errors && { errors: err.errors }),
    });
    return;
  }

  // 3. Unexpected Programmer Errors
  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
      correlationId,
    },
    `Unhandled Exception on ${req.method} ${req.originalUrl}`,
  );

  const isProd = env.NODE_ENV === "production";

  sendProblemDetails(res, {
    title: "Internal Server Error",
    status: 500,
    detail: isProd ? "An unexpected internal server error occurred" : err.message,
    instance: req.originalUrl,
    code: "INTERNAL_SERVER_ERROR",
    correlationId,
    ...(!isProd && { stack: err.stack }),
  });
}
