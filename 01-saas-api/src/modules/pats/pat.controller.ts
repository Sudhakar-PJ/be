import { type Request, type Response } from "express";
import { type CreatePatInput } from "./pat.schema";
import { patService, PatService } from "./pat.service";

export class PatController {
  constructor(private readonly service: PatService = patService) {}

  /**
   * POST /api/v1/pats
   * Mints a new PAT and returns the rawToken (one-time exposure).
   */
  async createPat(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const body = req.body as CreatePatInput;

    const pat = await this.service.createPat(tenantId, userId, body);

    res.status(201).json({
      status: "success",
      data: { pat },
    });
  }

  /**
   * GET /api/v1/pats
   * Lists tokens within the tenant (filtered by caller role/ownership).
   */
  async listPats(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const userRole = req.tenant!.role;

    const pats = await this.service.listPats(tenantId, userId, userRole);

    res.status(200).json({
      status: "success",
      data: { pats },
    });
  }

  /**
   * GET /api/v1/pats/:id
   * Retrieves metadata for a specific token.
   */
  async getPatById(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const userRole = req.tenant!.role;
    const patId = req.params.id as string;

    const pat = await this.service.getPatById(tenantId, userId, userRole, patId);

    res.status(200).json({
      status: "success",
      data: { pat },
    });
  }

  /**
   * DELETE /api/v1/pats/:id
   * Revokes a token.
   */
  async revokePat(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const userRole = req.tenant!.role;
    const patId = req.params.id as string;

    await this.service.revokePat(tenantId, userId, userRole, patId);

    res.status(204).send();
  }
}

export const patController = new PatController();