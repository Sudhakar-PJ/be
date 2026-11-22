import { PoolClient } from "pg";
import { AuditLogRecord } from "./audit.types";

export class AuditRepository {
  /**
   * Fetches the latest audit log entry for a tenant to retrieve its current_hash.
   */
  async getLatestForTenant(client: PoolClient, tenantId: string): Promise<AuditLogRecord | null> {
    const result = await client.query<AuditLogRecord>(
      `SELECT
        id, tenant_id, actor_id, actor_type, action,
        resource_type, resource_id, payload, ip_address,
        user_agent, previous_hash, current_hash, created_at
      FROM audit_logs
      WHERE tenant_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
      [tenantId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Inserts an immutable audit log record.
   */
  async insert(
    client: PoolClient,
    record: {
      id: string;
      tenantId: string;
      actorId: string | null;
      actorType: string;
      action: string;
      resourceType: string;
      resourceId: string | null;
      payload: Record<string, unknown>;
      ipAddress: string | null;
      userAgent: string | null;
      previousHash: string;
      currentHash: string;
      createdAt: Date;
    },
  ): Promise<AuditLogRecord> {
    const result = await client.query<AuditLogRecord>(
      `INSERT INTO audit_logs (
        id, tenant_id, actor_id, actor_type, action,
        resource_type, resource_id, payload, ip_address,
        user_agent, previous_hash, current_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING
        id, tenant_id, actor_id, actor_type, action,
        resource_type, resource_id, payload, ip_address,
        user_agent, previous_hash, current_hash, created_at`,
      [
        record.id,
        record.tenantId,
        record.actorId,
        record.actorType,
        record.action,
        record.resourceType,
        record.resourceId,
        JSON.stringify(record.payload),
        record.ipAddress,
        record.userAgent,
        record.previousHash,
        record.currentHash,
        record.createdAt,
      ],
    );
    const inserted = result.rows[0];
    if (!inserted) {
      throw new Error("Failed to insert audit log entry");
    }
    return inserted;
  }

  /**
   * Reads all audit log entries for a tenant in strictly ascending chronological order
   * for cryptographic chain verification.
   */
  async getAllForTenantAsc(client: PoolClient, tenantId: string): Promise<AuditLogRecord[]> {
    const result = await client.query<AuditLogRecord>(
      `SELECT
        id, tenant_id, actor_id, actor_type, action,
        resource_type, resource_id, payload, ip_address,
        user_agent, previous_hash, current_hash, created_at
      FROM audit_logs
      WHERE tenant_id = $1
      ORDER BY created_at ASC, id ASC`,
      [tenantId],
    );
    return result.rows;
  }

  /**
   * Paginated list of audit logs for a tenant (newest first).
   */
  async listForTenant(
    client: PoolClient,
    tenantId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<AuditLogRecord[]> {
    const result = await client.query<AuditLogRecord>(
      `SELECT
        id, tenant_id, actor_id, actor_type, action,
        resource_type, resource_id, payload, ip_address,
        user_agent, previous_hash, current_hash, created_at
      FROM audit_logs
      WHERE tenant_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset],
    );
    return result.rows;
  }
}
export const auditRepository = new AuditRepository();
