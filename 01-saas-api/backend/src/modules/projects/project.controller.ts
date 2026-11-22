import { type Request, type Response } from "express";
import { type CreateProjectInput, type UpdateProjectInput } from "./project.schema";
import { projectService, ProjectService } from "./project.service";

export class ProjectController {
  constructor(private readonly service: ProjectService = projectService) {}

  /**
   * POST /api/v1/projects
   */
  async createProject(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const body = req.body as CreateProjectInput;

    const project = await this.service.createProject(tenantId, userId, body);

    res.status(201).json({
      status: "success",
      data: { project },
    });
  }

  /**
   * GET /api/v1/projects
   */
  async listProjects(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;

    const projects = await this.service.listProjects(tenantId);

    res.status(200).json({
      status: "success",
      data: { projects },
    });
  }

  /**
   * GET /api/v1/projects/:id
   */
  async getProjectById(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const projectId = req.params.id as string;

    const project = await this.service.getProjectById(tenantId, projectId);

    res.status(200).json({
      status: "success",
      data: { project },
    });
  }

  /**
   * PATCH /api/v1/projects/:id
   */
  async updateProject(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const projectId = req.params.id as string;
    const body = req.body as UpdateProjectInput;

    const project = await this.service.updateProject(tenantId, projectId, body);

    res.status(200).json({
      status: "success",
      data: { project },
    });
  }

  /**
   * DELETE /api/v1/projects/:id
   */
  async deleteProject(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const projectId = req.params.id as string;

    await this.service.deleteProject(tenantId, projectId);

    res.status(204).send();
  }
}

export const projectController = new ProjectController();
