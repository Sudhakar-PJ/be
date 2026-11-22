import { type PoolClient } from "pg";
import { withTenantTransaction } from "../../config/database";
import { type PatScope } from "../../lib/pat";
import { type PatSummaryResponse } from "./pat.schema";

export interface PatRecord {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  token_hash: string;
  token_preview: string;
  scopes: string[];
  expires_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePatRepoInput {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  tokenPreview: string;
  scopes: PatScope[];
  expiresAt?: string | null | undefined;
}

/**
 * Transforms a raw snake_case database row into a public camelCase DTO.
 * Guarantees zero-knowledge: token_hash is discarded.
 */
export function toPatSummaryResponse(row: PatRecord): PatSummaryResponse {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    name: row.name,
    tokenPreview: row.token_preview,
    scopes: row.scopes as PatScope[],
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

export class PatRepository {
  /**
   * Persists a newly minted PAT into the tenant workspace.
   */
  async create(
    tenantId: string,
    input: CreatePatRepoInput,
    client?: PoolClient,
  ): Promise<PatRecord> {
    const run = async (c: PoolClient): Promise<PatRecord> => {
      const sql = `
        INSERT INTO personal_access_tokens (
          id,
          tenant_id,
          user_id,
          name,
          token_hash,
          token_preview,
          scopes,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          tenant_id,
          user_id,
          name,
          token_hash,
          token_preview,
          scopes,
          expires_at,
          last_used_at,
          revoked_at,
          created_at,
          updated_at;
      `;

      const result = await c.query<PatRecord>(sql, [
        input.id,
        tenantId,
        input.userId,
        input.name,
        input.tokenHash,
        input.tokenPreview,
        input.scopes,
        input.expiresAt ? new Date(input.expiresAt) : null,
      ]);

      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to insert personal access token record");
      }
      return row;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Lists tokens belonging to a tenant.
   * If userId is provided, filters to tokens owned by that specific user.
   */
  async findAll(
    tenantId: string,
    userId?: string,
    client?: PoolClient,
  ): Promise<PatRecord[]> {
    const run = async (c: PoolClient): Promise<PatRecord[]> => {
      const sql = `
        SELECT
          id,
          tenant_id,
          user_id,
          name,
          token_hash,
          token_preview,
          scopes,
          expires_at,
          last_used_at,
          revoked_at,
          created_at,
          updated_at
        FROM personal_access_tokens
        WHERE tenant_id = $1
          AND ($2::UUID IS NULL OR user_id = $2)
        ORDER BY created_at DESC;
      `;

      const result = await c.query<PatRecord>(sql, [tenantId, userId ?? null]);
      return result.rows;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Retrieves a single token by its UUID within the tenant.
   */
  async findById(
    tenantId: string,
    id: string,
    client?: PoolClient,
  ): Promise<PatRecord | null> {
    const run = async (c: PoolClient): Promise<PatRecord | null> => {
      const sql = `
        SELECT
          id,
          tenant_id,
          user_id,
          name,
          token_hash,
          token_preview,
          scopes,
          expires_at,
          last_used_at,
          revoked_at,
          created_at,
          updated_at
        FROM personal_access_tokens
        WHERE tenant_id = $1 AND id = $2
        LIMIT 1;
      `;

      const result = await c.query<PatRecord>(sql, [tenantId, id]);
      return result.rows[0] ?? null;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Atomically marks a token as revoked.
   * Idempotent: If already revoked, leaves original revoked_at timestamp intact.
   */
  async revoke(
    tenantId: string,
    id: string,
    client?: PoolClient,
  ): Promise<PatRecord | null> {
    const run = async (c: PoolClient): Promise<PatRecord | null> => {
      const sql = `
        UPDATE personal_access_tokens
        SET
          revoked_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL
        RETURNING
          id,
          tenant_id,
          user_id,
          name,
          token_hash,
          token_preview,
          scopes,
          expires_at,
          last_used_at,
          revoked_at,
          created_at,
          updated_at;
      `;

      const result = await c.query<PatRecord>(sql, [tenantId, id]);
      return result.rows[0] ?? null;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }
}

export const patRepository = new PatRepository();