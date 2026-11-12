import { uuidv7 } from "uuidv7";
import { ConflictError, NotFoundError } from "../../lib/apiError";
import {
  type CreateProjectInput,
  type ProjectResponse,
  type UpdateProjectInput,
} from "./project.schema";
import { ProjectRepository, projectRepository, toProjectResponse } from "./project.repository";
import {
  webhookDispatcherService,
  WebhookDispatcherService,
} from "../../services/webhook-dispatcher.service";

export class ProjectService {
  constructor(
    private readonly projectRepo: ProjectRepository = projectRepository,
    private readonly webhookDispatcher: WebhookDispatcherService = webhookDispatcherService,
  ) {}

  /**
   * Creates a new project in the active tenant workspace.
   * Enforces key uniqueness per tenant.
   */
  async createProject(
    tenantId: string,
    userId: string,
    input: CreateProjectInput,
  ): Promise<ProjectResponse> {
    // 1. Verify key uniqueness in this tenant
    const existing = await this.projectRepo.findByKey(tenantId, input.key);
    if (existing) {
      throw new ConflictError(
        `A project with key '${input.key}' already exists in this workspace`,
        "PROJECT_KEY_ALREADY_EXISTS",
      );
    }

    // 2. Generate time-ordered UUID v7
    const projectId = uuidv7();

    // 3. Persist project via repository
    const record = await this.projectRepo.create(tenantId, {
      id: projectId,
      name: input.name,
      key: input.key,
      description: input.description,
      createdBy: userId,
    });

    const response = toProjectResponse(record);

    await this.webhookDispatcher.dispatch({
      tenantId,
      actorId: userId,
      event: "project.created",
      data: { ...response },
    });

    return response;
  }

  /**
   * Retrieves all projects within the tenant workspace.
   */
  async listProjects(tenantId: string): Promise<ProjectResponse[]> {
    const records = await this.projectRepo.findAllByTenant(tenantId);
    return records.map(toProjectResponse);
  }

  /**
   * Retrieves a specific project by UUID within the tenant workspace.
   */
  async getProjectById(tenantId: string, projectId: string): Promise<ProjectResponse> {
    const record = await this.projectRepo.findById(tenantId, projectId);
    if (!record) {
      throw new NotFoundError(
        `Project with ID '${projectId}' was not found in this workspace`,
        "PROJECT_NOT_FOUND",
      );
    }

    return toProjectResponse(record);
  }

  /**
   * Updates an existing project in the tenant workspace.
   */
  async updateProject(
    tenantId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectResponse> {
    // 1. Verify project exists
    const existing = await this.projectRepo.findById(tenantId, projectId);
    if (!existing) {
      throw new NotFoundError(
        `Project with ID '${projectId}' was not found in this workspace`,
        "PROJECT_NOT_FOUND",
      );
    }

    // 2. Execute update
    const updated = await this.projectRepo.update(tenantId, projectId, input);
    if (!updated) {
      throw new NotFoundError(
        `Project with ID '${projectId}' was not found in this workspace`,
        "PROJECT_NOT_FOUND",
      );
    }

    const response = toProjectResponse(updated);

    await this.webhookDispatcher.dispatch({
      tenantId,
      event: "project.updated",
      data: { ...response },
    });

    return response;
  }

  /**
   * Deletes a project by ID from the tenant workspace.
   */
  async deleteProject(tenantId: string, projectId: string): Promise<void> {
    const deleted = await this.projectRepo.delete(tenantId, projectId);
    if (!deleted) {
      throw new NotFoundError(
        `Project with ID '${projectId}' was not found in this workspace`,
        "PROJECT_NOT_FOUND",
      );
    }
    await this.webhookDispatcher.dispatch({
      tenantId,
      event: "project.deleted",
      data: { id: projectId },
    });
  }
}

export const projectService = new ProjectService();
