import client from "@prometheus-io/client";

/**
 * The Central Prometheus Metric Registry.
 * All application metrics (HTTP, database, redis, auth, business)
 * register against this unified registry.
 */
export const register = new client.Registry();

/**
 * Automatically collects Node.js process runtime metrics:
 * - nodejs_eventloop_lag_seconds (detects CPU/event loop stalls)
 * - process_cpu_user_seconds_total & process_cpu_system_seconds_total
 * - process_resident_memory_bytes (RSS memory footprint)
 * - nodejs_heap_size_used_bytes & nodejs_heap_size_total_bytes
 * - nodejs_active_handles & nodejs_active_requests (open sockets/timers)
 */
client.collectDefaultMetrics({
  register,
  prefix: "saas_", // Prefixes all default metrics as 'saas_nodejs_...'
});

export { client };
