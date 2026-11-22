import pinoHttp from "pino-http";
import { logger } from "../config/logger";
import { getCorrelationId } from "../lib/context";

export const requestLogger = pinoHttp({
  logger,
  genReqId: () => getCorrelationId()!,
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} completed with ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} failed with ${res.statusCode}: ${err.message}`;
  },
  customAttributeKeys: {
    req: "request",
    res: "response",
    err: "error",
    responseTime: "durationMs",
  },
});
