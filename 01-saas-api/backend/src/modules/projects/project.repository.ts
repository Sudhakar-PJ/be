import { type PoolClient } from "pg";
import { withTenantTransaction } from "../../config/database";
import { type ProjectResponse } from "./project.schema";

export interface ProjectRecord {
  id: string;
  tenant_id: string;
  name: string;
  key: string;
  description: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectRepoInput {
  id: string;
  name: string;
  key: string;
  description?: string | undefined;
  createdBy: string;
}

export interface UpdateProjectRepoInput {
  name?: string | undefined;
  description?: string | undefined;
}

/**
 * Transforms a raw snake_case database row into a camelCase API response contract.
 */
export function toProjectResponse(row: ProjectRecord): ProjectResponse {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    key: row.key,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class ProjectRepository {
  /**
   * Inserts a new project into the tenant workspace.
   * RLS policy validates that tenant_id matches app.current_tenant.
   */
  async create(
    tenantId: string,
    input: CreateProjectRepoInput,
    client?: PoolClient,
  ): Promise<ProjectRecord> {
    const run = async (c: PoolClient): Promise<ProjectRecord> => {
      const sql = `
        INSERT INTO projects (id, tenant_id, name, key, description, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, tenant_id, name, key, description, created_by, created_at, updated_at;
      `;
      const result = await c.query<ProjectRecord>(sql, [
        input.id,
        tenantId,
        input.name,
        input.key,
        input.description ?? null,
        input.createdBy,
      ]);

      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to insert project record");
      }
      return row;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Lists all projects belonging to the active tenant, ordered newest first.
   * Leverages composite index: idx_projects_tenant_created (tenant_id, created_at DESC).
   */
  async findAllByTenant(tenantId: string, client?: PoolClient): Promise<ProjectRecord[]> {
    const run = async (c: PoolClient): Promise<ProjectRecord[]> => {
      const sql = `
        SELECT id, tenant_id, name, key, description, created_by, created_at, updated_at
        FROM projects
        WHERE tenant_id = $1
        ORDER BY created_at DESC;
      `;
      const result = await c.query<ProjectRecord>(sql, [tenantId]);
      return result.rows;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Finds a specific project by UUID within the tenant.
   */
  async findById(tenantId: string, id: string, client?: PoolClient): Promise<ProjectRecord | null> {
    const run = async (c: PoolClient): Promise<ProjectRecord | null> => {
      const sql = `
        SELECT id, tenant_id, name, key, description, created_by, created_at, updated_at
        FROM projects
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1;
      `;
      const result = await c.query<ProjectRecord>(sql, [tenantId, id]);
      return result.rows[0] ?? null;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Finds a project by its unique workspace key within the tenant.
   */
  async findByKey(
    tenantId: string,
    key: string,
    client?: PoolClient,
  ): Promise<ProjectRecord | null> {
    const run = async (c: PoolClient): Promise<ProjectRecord | null> => {
      const sql = `
        SELECT id, tenant_id, name, key, description, created_by, created_at, updated_at
        FROM projects
        WHERE tenant_id = $1 AND key = $2
        LIMIT 1;
      `;
      const result = await c.query<ProjectRecord>(sql, [tenantId, key]);
      return result.rows[0] ?? null;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Updates project attributes dynamically within the tenant workspace.
   */
  async update(
    tenantId: string,
    id: string,
    input: UpdateProjectRepoInput,
    client?: PoolClient,
  ): Promise<ProjectRecord | null> {
    const run = async (c: PoolClient): Promise<ProjectRecord | null> => {
      const updates: string[] = [];
      const values: unknown[] = [tenantId, id];
      let paramIndex = 3;

      if (input.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(input.name);
      }

      if (input.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(input.description);
      }

      if (updates.length === 0) {
        return this.findById(tenantId, id, c);
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      const sql = `
        UPDATE projects
        SET ${updates.join(", ")}
        WHERE tenant_id = $1 AND id = $2
        RETURNING id, tenant_id, name, key, description, created_by, created_at, updated_at;
      `;

      const result = await c.query<ProjectRecord>(sql, values);
      return result.rows[0] ?? null;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Deletes a project by ID within the tenant workspace.
   */
  async delete(tenantId: string, id: string, client?: PoolClient): Promise<boolean> {
    const run = async (c: PoolClient): Promise<boolean> => {
      const sql = `
        DELETE FROM projects
        WHERE tenant_id = $1 AND id = $2;
      `;
      const result = await c.query(sql, [tenantId, id]);
      return (result.rowCount ?? 0) > 0;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }
}

export const projectRepository = new ProjectRepository();
