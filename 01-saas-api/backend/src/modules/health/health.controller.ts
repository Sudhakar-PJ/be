import { Request, Response } from "express";
import { healthService, HealthService } from "./health.service";

export class HealthController {
  constructor(private readonly service: HealthService = healthService) {}

  /**
   * Kubernetes Liveness Probe handler.
   * Returns 200 OK as long as the process is alive and event loop is responsive.
   */
  getLive = async (_req: Request, res: Response): Promise<void> => {
    const result = await this.service.checkLiveness();
    res.status(200).json(result);
  };

  /**
   * Kubernetes Readiness Probe handler.
   * Returns 200 OK if PostgreSQL and Redis are both reachable within timeout.
   * Returns 503 Service Unavailable if any downstream service fails.
   */
  getReady = async (_req: Request, res: Response): Promise<void> => {
    const result = await this.service.checkReadiness();
    const statusCode = result.status === "ready" ? 200 : 503;
    res.status(statusCode).json(result);
  };

  /**
   * Backward-compatible shallow health check.
   */
  getShallow = (_req: Request, res: Response): void => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  };
}

export const healthController = new HealthController();
