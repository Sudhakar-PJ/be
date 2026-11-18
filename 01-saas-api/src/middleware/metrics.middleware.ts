import { Request, Response, NextFunction } from "express";
import { httpRequestDurationSeconds, httpRequestTotal } from "../metrics/http.metrics";

/**
 * Extracts a normalized, low-cardinality route template to prevent Prometheus memory explosion.
 * Example: '/api/v1/tasks/018f2d5e-...' becomes '/api/v1/tasks/:id'.
 * Unmatched or scanner requests are grouped into 'unmatched'.
 */
function getNormalizedRoute(req: Request): string {
  if (req.route?.path) {
    const baseUrl = req.baseUrl || "";
    const routePath = req.route.path === "/" ? "" : req.route.path;
    return `${baseUrl}${routePath}` || "/";
  }
  // If Express has not matched a route (e.g. 404s or pre-routing errors)
  return "unmatched";
}

/**
 * Express middleware that observes HTTP RED metrics (Rate, Errors, Duration).
 * Hooks into response completion ('finish' event) using high-resolution monotonic timers.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Do not record metrics for the /metrics scraper endpoint itself to prevent observation pollution
  if (req.path === "/metrics") {
    return next();
  }

  const startTime = process.hrtime.bigint();

  // Listen for the response to finish sending all bytes to the client
  res.on("finish", () => {
    const endTime = process.hrtime.bigint();
    const durationSeconds = Number(endTime - startTime) / 1e9;

    const route = getNormalizedRoute(req);
    const method = req.method;
    const statusCode = res.statusCode.toString();

    // 1. Record RED: Rate & Errors (Counter)
    httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode,
    });

    // 2. Record RED: Duration (Histogram)
    httpRequestDurationSeconds.observe(
      {
        method,
        route,
        status_code: statusCode,
      },
      durationSeconds,
    );
  });
  next();
}
