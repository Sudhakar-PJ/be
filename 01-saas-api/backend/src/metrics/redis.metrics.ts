import client from "@prometheus-io/client";
import { register } from "./registry";

/**
 * Redis Connection Status Gauge.
 * 1 = Connected & Ready to receive commands
 * 0 = Disconnected / Reconnecting
 */
export const redisConnectedStatus = new client.Gauge({
  name: "redis_connected_status",
  help: "Redis connection status (1 = connected, 0 = disconnected)",
  registers: [register],
});

/**
 * Redis Command Latency Histogram.
 * Records the microsecond/millisecond duration of Redis operations.
 * Buckets from 0.5ms (0.0005s) to 250ms.
 */
export const redisCommandDurationSeconds = new client.Histogram({
  name: "redis_command_duration_seconds",
  help: "Execution duration of Redis commands in seconds",
  labelNames: ["command"] as const,
  buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
  registers: [register],
});

/**
 * Rate Limiter Throttling Counter.
 * Increments whenever a client is blocked with RFC 9457 429 Too Many Requests.
 */
export const rateLimitHitsTotal = new client.Counter({
  name: "rate_limit_hits_total",
  help: "Total number of requests rejected by rate limiting (HTTP 429)",
  labelNames: ["limiter"] as const, // 'auth' | 'api'
  registers: [register],
});
