import { uuidv7 } from "uuidv7";
import { ConflictError, NotFoundError } from "../../lib/apiError";
import { decodeCursor } from "../../lib/pagination";
import { projectRepository, ProjectRepository } from "../projects/project.repository";
import {
  type CreateTaskInput,
  type ListTasksQuery,
  type PaginatedTasksResponse,
  type TaskResponse,
  type UpdateTaskInput,
} from "./task.schema";
import { taskRepository, TaskRepository, toTaskResponse } from "./task.repository";

export class TaskService {
  constructor(
    private readonly taskRepo: TaskRepository = taskRepository,
    private readonly projectRepo: ProjectRepository = projectRepository,
  ) {}

  /**
   * Creates a new task within a project.
   * Resolves the next sequential project number and generates a UUID v7 ID.
   */
  async createTask(
    tenantId: string,
    userId: string,
    input: CreateTaskInput,
  ): Promise<TaskResponse> {
    // 1. Verify project exists in this tenant
    const project = await this.projectRepo.findById(tenantId, input.projectId);
    if (!project) {
      throw new NotFoundError(
        `Project with ID '${input.projectId}' was not found in this workspace`,
        "PROJECT_NOT_FOUND",
      );
    }

    // 2. Resolve next sequential task number (e.g. 1 for ENG-1, 2 for ENG-2)
    const nextNumber = await this.taskRepo.getNextTaskNumber(tenantId, input.projectId);

    // 3. Generate UUID v7 primary key
    const taskId = uuidv7();

    // 4. Persist task record
    const record = await this.taskRepo.create(tenantId, {
      id: taskId,
      projectId: input.projectId,
      number: nextNumber,
      title: input.title,
      description: input.description,
      status: input.status ?? "TODO",
      priority: input.priority ?? "MEDIUM",
      assigneeId: input.assigneeId,
      createdBy: userId,
    });

    return toTaskResponse(record);
  }

  /**
   * Lists tasks using cursor-based keyset pagination, filters, and full-text search.
   */
  async listTasks(tenantId: string, query: ListTasksQuery): Promise<PaginatedTasksResponse> {
    // Decode cursor if provided
    const cursorPayload = query.cursor ? decodeCursor(query.cursor) : undefined;
    const limit = query.limit ? Number(query.limit) : 20;
    return this.taskRepo.listWithKeyset(tenantId, {
      projectId: query.projectId,
      status: query.status,
      priority: query.priority,
      search: query.search,
      cursorPayload,
      limit: isNaN(limit) ? 20 : limit,
    });
  }

  /**
   * Retrieves a single task by UUID within the tenant workspace.
   */
  async getTaskById(tenantId: string, taskId: string): Promise<TaskResponse> {
    const record = await this.taskRepo.findById(tenantId, taskId);
    if (!record) {
      throw new NotFoundError(
        `Task with ID '${taskId}' was not found in this workspace`,
        "TASK_NOT_FOUND",
      );
    }

    return toTaskResponse(record);
  }

  /**
   * Updates an existing task with Optimistic Concurrency Control.
   * Throws 409 Conflict if another user/process updated the version concurrently.
   */
  async updateTask(
    tenantId: string,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<TaskResponse> {
    const { record, concurrencyConflict } = await this.taskRepo.updateWithOCC(tenantId, taskId, {
      version: input.version,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assigneeId: input.assigneeId,
    });

    if (concurrencyConflict) {
      throw new ConflictError(
        `This task was modified by another transaction. Please refresh and try again.`,
        "TASK_CONCURRENCY_CONFLICT",
      );
    }

    if (!record) {
      throw new NotFoundError(
        `Task with ID '${taskId}' was not found in this workspace`,
        "TASK_NOT_FOUND",
      );
    }

    return toTaskResponse(record);
  }

  /**
   * Deletes a task by UUID from the tenant workspace.
   */
  async deleteTask(tenantId: string, taskId: string): Promise<void> {
    const deleted = await this.taskRepo.delete(tenantId, taskId);
    if (!deleted) {
      throw new NotFoundError(
        `Task with ID '${taskId}' was not found in this workspace`,
        "TASK_NOT_FOUND",
      );
    }
  }
}

export const taskService = new TaskService();
