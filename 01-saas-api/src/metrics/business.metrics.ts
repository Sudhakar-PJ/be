import client from "@prometheus-io/client";
import { register } from "./registry";

/**
 * Tasks Created Counter.
 * Tracks business productivity velocity partitioned by task priority.
 */
export const tasksCreatedTotal = new client.Counter({
  name: "tasks_created_total",
  help: "Total number of tasks created across all tenants",
  labelNames: ["priority"] as const, // 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'
  registers: [register],
});

/**
 * Projects Created Counter.
 * Tracks workspace expansion and project lifecycle.
 */
export const projectsCreatedTotal = new client.Counter({
  name: "projects_created_total",
  help: "Total number of projects created across all tenants",
  registers: [register],
});

/**
 * Personal Access Tokens Created Counter.
 * Measures developer platform and API key adoption.
 */
export const patsCreatedTotal = new client.Counter({
  name: "pats_created_total",
  help: "Total number of Personal Access Tokens (API keys) minted",
  registers: [register],
});

/**
 * Webhook Deliveries Counter.
 * Measures outbound integration activity partitioned by event and delivery status.
 */
export const webhooksDeliveredTotal = new client.Counter({
  name: "webhooks_delivered_total",
  help: "Total number of outbound webhook delivery attempts",
  labelNames: ["status"] as const, // 'success' | 'failure'
  registers: [register],
});
