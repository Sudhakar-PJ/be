import { type PoolClient } from "pg";
import { withTenantTransaction } from "../../config/database";
import { buildPaginatedResult } from "../../lib/pagination";
import {
  type TaskPriority,
  type TaskResponse,
  type TaskStatus,
  type PaginatedTasksResponse,
} from "./task.schema";

export interface TaskRecord {
  id: string;
  tenant_id: string;
  project_id: string;
  number: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  created_by: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTaskRepoInput {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description?: string | undefined;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string | undefined;
  createdBy: string;
}

export interface UpdateTaskRepoInput {
  version: number;
  title?: string | undefined;
  description?: string | null | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  assigneeId?: string | null | undefined;
}

export interface ListTasksFilter {
  projectId?: string | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  search?: string | undefined;
  cursorPayload?: { createdAt: string; id: string } | undefined;
  limit: number;
}

export interface UpdateTaskResult {
  record: TaskRecord | null;
  concurrencyConflict: boolean;
}

/**
 * Transforms a raw snake_case database row into the camelCase API response contract.
 */
export function toTaskResponse(row: TaskRecord): TaskResponse {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    projectId: row.project_id,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id,
    createdBy: row.created_by,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class TaskRepository {
  /**
   * Calculates the next sequential task number for a given project.
   * Leverages idx_tasks_project_number (project_id, number DESC) for an instant index-only scan.
   */
  async getNextTaskNumber(
    tenantId: string,
    projectId: string,
    client?: PoolClient,
  ): Promise<number> {
    const run = async (c: PoolClient): Promise<number> => {
      const sql = `
        SELECT COALESCE(MAX(number), 0) + 1 AS next_number
        FROM tasks
        WHERE tenant_id = $1 AND project_id = $2;
      `;
      const result = await c.query<{ next_number: string }>(sql, [tenantId, projectId]);
      return Number(result.rows[0]?.next_number ?? 1);
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Inserts a new task record.
   */
  async create(
    tenantId: string,
    input: CreateTaskRepoInput,
    client?: PoolClient,
  ): Promise<TaskRecord> {
    const run = async (c: PoolClient): Promise<TaskRecord> => {
      const sql = `
        INSERT INTO tasks (
          id, tenant_id, project_id, number, title, description, status, priority, assignee_id, created_by, version
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1)
        RETURNING id, tenant_id, project_id, number, title, description, status, priority, assignee_id, created_by, version, created_at, updated_at;
      `;
      const result = await c.query<TaskRecord>(sql, [
        input.id,
        tenantId,
        input.projectId,
        input.number,
        input.title,
        input.description ?? null,
        input.status,
        input.priority,
        input.assigneeId ?? null,
        input.createdBy,
      ]);

      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to insert task record");
      }
      return row;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Finds a task by UUID within the tenant workspace.
   */
  async findById(tenantId: string, id: string, client?: PoolClient): Promise<TaskRecord | null> {
    const run = async (c: PoolClient): Promise<TaskRecord | null> => {
      const sql = `
        SELECT id, tenant_id, project_id, number, title, description, status, priority, assignee_id, created_by, version, created_at, updated_at
        FROM tasks
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1;
      `;
      const result = await c.query<TaskRecord>(sql, [tenantId, id]);
      return result.rows[0] ?? null;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Keyset pagination query supporting composite filtering and Full-Text Search.
   * Fetches (limit + 1) rows to evaluate hasNextPage in a single round-trip.
   */
  async listWithKeyset(
    tenantId: string,
    filter: ListTasksFilter,
    client?: PoolClient,
  ): Promise<PaginatedTasksResponse> {
    const run = async (c: PoolClient): Promise<PaginatedTasksResponse> => {
      const conditions: string[] = ["tenant_id = $1"];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      // Project filter
      if (filter.projectId) {
        conditions.push(`project_id = $${paramIndex++}`);
        values.push(filter.projectId);
      }

      // Status filter
      if (filter.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(filter.status);
      }

      // Priority filter
      if (filter.priority) {
        conditions.push(`priority = $${paramIndex++}`);
        values.push(filter.priority);
      }

      // Full-Text Search (TSVECTOR GIN + Trigram fallback)
      if (filter.search) {
        conditions.push(
          `(tsv_search @@ websearch_to_tsquery('english', $${paramIndex}) OR title ILIKE $${paramIndex + 1})`,
        );
        values.push(filter.search);
        values.push(`%${filter.search}%`);
        paramIndex += 2;
      }

      // Keyset cursor condition: WHERE (created_at, id) < ($cursorCreatedAt, $cursorId)
      if (filter.cursorPayload) {
        conditions.push(`(created_at, id) < ($${paramIndex++}, $${paramIndex++})`);
        values.push(filter.cursorPayload.createdAt);
        values.push(filter.cursorPayload.id);
      }

      // Request (limit + 1) rows
      // Ensure limit is always a valid integer
      const safeLimit = filter.limit && !isNaN(filter.limit) ? filter.limit : 20;
      const fetchLimit = safeLimit + 1;
      values.push(fetchLimit);

      const sql = `
        SELECT id, tenant_id, project_id, number, title, description, status, priority, assignee_id, created_by, version, created_at, updated_at
        FROM tasks
        WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC, id DESC
        LIMIT $${paramIndex};
      `;

      const result = await c.query<TaskRecord>(sql, values);
      const responses = result.rows.map(toTaskResponse);

      return buildPaginatedResult(responses, filter.limit);
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Updates task with Optimistic Concurrency Control.
   * If row exists but version does not match, returns concurrencyConflict: true.
   */
  async updateWithOCC(
    tenantId: string,
    id: string,
    input: UpdateTaskRepoInput,
    client?: PoolClient,
  ): Promise<UpdateTaskResult> {
    const run = async (c: PoolClient): Promise<UpdateTaskResult> => {
      const updates: string[] = ["version = version + 1", "updated_at = CURRENT_TIMESTAMP"];
      const values: unknown[] = [tenantId, id, input.version];
      let paramIndex = 4;

      if (input.title !== undefined) {
        updates.push(`title = $${paramIndex++}`);
        values.push(input.title);
      }

      if (input.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(input.description);
      }

      if (input.status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        values.push(input.status);
      }

      if (input.priority !== undefined) {
        updates.push(`priority = $${paramIndex++}`);
        values.push(input.priority);
      }

      if (input.assigneeId !== undefined) {
        updates.push(`assignee_id = $${paramIndex++}`);
        values.push(input.assigneeId);
      }

      const sql = `
        UPDATE tasks
        SET ${updates.join(", ")}
        WHERE tenant_id = $1 AND id = $2 AND version = $3
        RETURNING id, tenant_id, project_id, number, title, description, status, priority, assignee_id, created_by, version, created_at, updated_at;
      `;

      const result = await c.query<TaskRecord>(sql, values);
      const updatedRow = result.rows[0];

      if (updatedRow) {
        return { record: updatedRow, concurrencyConflict: false };
      }

      // If no row was updated, check whether the task actually exists with an outdated version
      const existing = await this.findById(tenantId, id, c);
      if (!existing) {
        return { record: null, concurrencyConflict: false };
      }

      // Row exists but version was different -> Concurrency conflict!
      return { record: null, concurrencyConflict: true };
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Deletes a task by ID within the tenant workspace.
   */
  async delete(tenantId: string, id: string, client?: PoolClient): Promise<boolean> {
    const run = async (c: PoolClient): Promise<boolean> => {
      const sql = `
        DELETE FROM tasks
        WHERE tenant_id = $1 AND id = $2;
      `;
      const result = await c.query(sql, [tenantId, id]);
      return (result.rowCount ?? 0) > 0;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }
}

export const taskRepository = new TaskRepository();
