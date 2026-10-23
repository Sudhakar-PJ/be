import pino, { type LoggerOptions } from "pino";
import { env } from "./env";
import { getCorrelationId } from "../lib/context";

const isDevelopment = env.NODE_ENV === "development";

const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,

  mixin() {
    const correlationId = getCorrelationId();
    return correlationId ? { correlationId } : {};
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "password",
      "passwordHash",
      "token",
      "refreshToken",
      "accessToken",
    ],
    censor: "[REDACTED]",
  },
  ...(isDevelopment && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
        singleLine: true,
      },
    },
  }),
};

export const logger = pino(loggerOptions);
