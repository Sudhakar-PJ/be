import client from "@prometheus-io/client";
import { register } from "./registry";

/**
 * HTTP Request Counter (RED Method: Rate & Errors)
 * Tracks cumulative request count partitioned by method, route, and status code.
 */
export const httpRequestTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests processed by the API",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [register],
});

/**
 * HTTP Request Latency Histogram (RED Method: Duration)
 * Records request execution duration in seconds across granular buckets.
 * Enables calculation of p50, p90, p95, and p99 latency percentiles in Grafana.
 */
export const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  // Buckets from 5ms to 10s
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});
