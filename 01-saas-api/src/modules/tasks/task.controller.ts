import { type Request, type Response } from "express";
import { type CreateTaskInput, type ListTasksQuery, type UpdateTaskInput } from "./task.schema";
import { taskService, TaskService } from "./task.service";

export class TaskController {
  constructor(private readonly service: TaskService = taskService) {}

  /**
   * POST /api/v1/tasks
   */
  async createTask(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const userId = req.user!.id;
    const body = req.body as CreateTaskInput;

    const task = await this.service.createTask(tenantId, userId, body);

    res.status(201).json({
      status: "success",
      data: { task },
    });
  }

  /**
   * GET /api/v1/tasks
   */
  async listTasks(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    // Cast query params validated by listTasksQuerySchema
    const query = req.query as unknown as ListTasksQuery;

    const result = await this.service.listTasks(tenantId, query);

    res.status(200).json({
      status: "success",
      data: result,
    });
  }

  /**
   * GET /api/v1/tasks/:id
   */
  async getTaskById(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const taskId = req.params.id as string;

    const task = await this.service.getTaskById(tenantId, taskId);

    res.status(200).json({
      status: "success",
      data: { task },
    });
  }

  /**
   * PATCH /api/v1/tasks/:id
   */
  async updateTask(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const taskId = req.params.id as string;
    const body = req.body as UpdateTaskInput;

    const task = await this.service.updateTask(tenantId, taskId, body);

    res.status(200).json({
      status: "success",
      data: { task },
    });
  }

  /**
   * DELETE /api/v1/tasks/:id
   */
  async deleteTask(req: Request, res: Response): Promise<void> {
    const tenantId = req.tenant!.id;
    const taskId = req.params.id as string;

    await this.service.deleteTask(tenantId, taskId);

    res.status(204).send();
  }
}

export const taskController = new TaskController();
