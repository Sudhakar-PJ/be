import client from "@prometheus-io/client";
import { register } from "./registry";
import { pool } from "../config/database";

/**
 * Database Query Duration Histogram.
 * Records query execution time partitioned by SQL operation (SELECT, INSERT, UPDATE, DELETE).
 * Buckets from 1ms (0.001s) to 5s.
 */
export const dbQueryDurationSeconds = new client.Histogram({
  name: "db_query_duration_seconds",
  help: "Execution duration of PostgreSQL queries in seconds",
  labelNames: ["operation"] as const,
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/**
 * Database Query Error Counter.
 * Tracks total query execution failures.
 */
export const dbErrorsTotal = new client.Counter({
  name: "db_errors_total",
  help: "Total number of PostgreSQL query errors",
  labelNames: ["error_type"] as const,
  registers: [register],
});

/**
 * Database Connection Pool Gauges.
 * Dynamic Gauges that inspect pool state at the moment Prometheus scrapes /metrics.
 */
new client.Gauge({
  name: "db_pool_total_connections",
  help: "Total number of TCP connections currently in the PostgreSQL pool",
  registers: [register],
  collect() {
    this.set(pool.totalCount);
  },
});

new client.Gauge({
  name: "db_pool_idle_connections",
  help: "Number of idle PostgreSQL connections available for immediate use",
  registers: [register],
  collect() {
    this.set(pool.idleCount);
  },
});

new client.Gauge({
  name: "db_pool_active_connections",
  help: "Number of PostgreSQL connections currently executing queries",
  registers: [register],
  collect() {
    this.set(pool.totalCount - pool.idleCount);
  },
});

new client.Gauge({
  name: "db_pool_waiting_queries",
  help: "Number of queries currently queued waiting for an available pool connection",
  registers: [register],
  collect() {
    this.set(pool.waitingCount);
  },
});
