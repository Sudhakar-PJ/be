import { z } from "zod";
import { type PaginatedResult } from "../../lib/pagination";

export const TASK_STATUSES = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
  "CANCELED",
] as const;

export const TASK_PRIORITIES = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

// 1. Create Task Schema
export const createTaskSchema = z.object({
  body: z.object({
    projectId: z.string().uuid("Invalid project ID. Must be a valid UUID."),
    title: z
      .string({ required_error: "Task title is required" })
      .trim()
      .min(1, "Task title cannot be empty")
      .max(255, "Task title cannot exceed 255 characters"),
    description: z
      .string()
      .trim()
      .max(10000, "Description cannot exceed 10,000 characters")
      .optional(),
    status: z.enum(TASK_STATUSES).default("TODO"),
    priority: z.enum(TASK_PRIORITIES).default("MEDIUM"),
    assigneeId: z.string().uuid("Invalid assignee ID. Must be a valid UUID.").optional(),
  }),
});

// 2. Update Task Schema (Enforces Optimistic Concurrency Control with 'version')
export const updateTaskSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid task ID. Must be a valid UUID."),
  }),
  body: z
    .object({
      version: z
        .number({
          required_error: "Current task 'version' is required for optimistic concurrency control",
        })
        .int("Version must be an integer")
        .min(1, "Version must be at least 1"),
      title: z
        .string()
        .trim()
        .min(1, "Task title cannot be empty")
        .max(255, "Task title cannot exceed 255 characters")
        .optional(),
      description: z
        .string()
        .trim()
        .max(10000, "Description cannot exceed 10,000 characters")
        .nullable()
        .optional(),
      status: z.enum(TASK_STATUSES).optional(),
      priority: z.enum(TASK_PRIORITIES).optional(),
      assigneeId: z.string().uuid("Invalid assignee ID").nullable().optional(),
    })
    .refine(
      (data) => {
        const { version: _version, ...updates } = data;
        return Object.keys(updates).length > 0;
      },
      {
        message:
          "At least one mutable field (title, description, status, priority, assigneeId) must be provided for update",
      },
    ),
});

// 3. Task ID Route Param Schema
export const taskIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid task ID. Must be a valid UUID."),
  }),
});

// 4. Keyset Query Parameter Schema
export const listTasksQuerySchema = z.object({
  query: z.object({
    projectId: z.string().uuid("Invalid project ID").optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    search: z.string().trim().max(200, "Search query cannot exceed 200 characters").optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
});

// Inferred TypeScript Types
export type CreateTaskInput = z.infer<typeof createTaskSchema>["body"];
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>["body"];
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>["query"];

export interface TaskResponse {
  id: string;
  tenantId: string;
  projectId: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  createdBy: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedTasksResponse = PaginatedResult<TaskResponse>;
