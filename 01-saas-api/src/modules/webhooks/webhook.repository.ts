import { type PoolClient } from "pg";
import { withTenantTransaction } from "../../config/database";
import {
  type WebhookSubscriptionResponse,
  type WebhookSubscriptionWithSecretResponse,
  type WebhookDeliveryResponse,
} from "./webhook.schema";

export interface WebhookSubscriptionRecord {
  id: string;
  tenant_id: string;
  created_by: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  consecutive_failures: number;
  created_at: Date;
  updated_at: Date;
}

export interface WebhookDeliveryRecord {
  id: string;
  tenant_id: string;
  subscription_id: string;
  event: string;
  payload: Record<string, unknown>;
  request_headers: Record<string, string>;
  response_status: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number;
  attempt_number: number;
  delivered_at: Date;
}

export interface CreateWebhookSubscriptionRepoInput {
  id: string;
  createdBy: string;
  url: string;
  secret: string;
  events: string[];
}

export interface UpdateWebhookSubscriptionRepoInput {
  url?: string | undefined;
  events?: string[] | undefined;
  isActive?: boolean | undefined;
}

export interface RecordDeliveryRepoInput {
  id: string;
  subscriptionId: string;
  event: string;
  payload: Record<string, unknown>;
  requestHeaders: Record<string, string>;
  responseStatus?: number | null | undefined;
  responseBody?: string | null | undefined;
  errorMessage?: string | null | undefined;
  durationMs: number;
  attemptNumber: number;
}

/**
 * Transforms a raw snake_case record into a public DTO, excluding the signing secret.
 */
export function toWebhookSubscriptionResponse(
  row: WebhookSubscriptionRecord,
): WebhookSubscriptionResponse {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
    url: row.url,
    events: row.events,
    isActive: row.is_active,
    consecutiveFailures: row.consecutive_failures,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Transforms a raw record into a response containing the signing secret.
 * Used exclusively upon initial creation or explicit secret rotation.
 */
export function toWebhookSubscriptionWithSecretResponse(
  row: WebhookSubscriptionRecord,
): WebhookSubscriptionWithSecretResponse {
  return {
    ...toWebhookSubscriptionResponse(row),
    secret: row.secret,
  };
}

/**
 * Transforms a delivery log record into a camelCase response DTO.
 */
export function toWebhookDeliveryResponse(row: WebhookDeliveryRecord): WebhookDeliveryResponse {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    subscriptionId: row.subscription_id,
    event: row.event,
    payload: row.payload,
    requestHeaders: row.request_headers,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
    attemptNumber: row.attempt_number,
    deliveredAt: row.delivered_at.toISOString(),
  };
}

export class WebhookRepository {
  /**
   * Persists a new webhook subscription under the tenant workspace.
   */
  async create(
    tenantId: string,
    input: CreateWebhookSubscriptionRepoInput,
    client?: PoolClient,
  ): Promise<WebhookSubscriptionRecord> {
    const run = async (c: PoolClient): Promise<WebhookSubscriptionRecord> => {
      const sql = `
        INSERT INTO webhook_subscriptions (
          id,
          tenant_id,
          created_by,
          url,
          secret,
          events
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id,
          tenant_id,
          created_by,
          url,
          secret,
          events,
          is_active,
          consecutive_failures,
          created_at,
          updated_at;
      `;

      const result = await c.query<WebhookSubscriptionRecord>(sql, [
        input.id,
        tenantId,
        input.createdBy,
        input.url,
        input.secret,
        input.events,
      ]);

      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to insert webhook subscription record");
      }
      return row;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Retrieves a single subscription by ID within the tenant scope.
   */
  async findById(
    tenantId: string,
    id: string,
    client?: PoolClient,
  ): Promise<WebhookSubscriptionRecord | null> {
    const run = async (c: PoolClient): Promise<WebhookSubscriptionRecord | null> => {
      const sql = `
        SELECT
          id,
          tenant_id,
          created_by,
          url,
          secret,
          events,
          is_active,
          consecutive_failures,
          created_at,
          updated_at
        FROM webhook_subscriptions
        WHERE id = $1
        LIMIT 1;
      `;

      const result = await c.query<WebhookSubscriptionRecord>(sql, [id]);
      return result.rows[0] ?? null;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Lists all webhook subscriptions registered for a tenant.
   */
  async findAll(tenantId: string, client?: PoolClient): Promise<WebhookSubscriptionRecord[]> {
    const run = async (c: PoolClient): Promise<WebhookSubscriptionRecord[]> => {
      const sql = `
        SELECT
          id,
          tenant_id,
          created_by,
          url,
          secret,
          events,
          is_active,
          consecutive_failures,
          created_at,
          updated_at
        FROM webhook_subscriptions
        ORDER BY created_at DESC;
      `;

      const result = await c.query<WebhookSubscriptionRecord>(sql);
      return result.rows;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Finds all active subscriptions within a tenant that match a given event topic or '*'.
   */
  async findSubscribersForEvent(
    tenantId: string,
    event: string,
    client?: PoolClient,
  ): Promise<WebhookSubscriptionRecord[]> {
    const run = async (c: PoolClient): Promise<WebhookSubscriptionRecord[]> => {
      const sql = `
        SELECT
          id,
          tenant_id,
          created_by,
          url,
          secret,
          events,
          is_active,
          consecutive_failures,
          created_at,
          updated_at
        FROM webhook_subscriptions
        WHERE is_active = TRUE
          AND (events @> ARRAY[$1]::text[] OR '*' = ANY(events))
        ORDER BY created_at ASC;
      `;

      const result = await c.query<WebhookSubscriptionRecord>(sql, [event]);
      return result.rows;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Dynamically updates subscription fields (url, events, isActive).
   */
  async update(
    tenantId: string,
    id: string,
    updates: UpdateWebhookSubscriptionRepoInput,
    client?: PoolClient,
  ): Promise<WebhookSubscriptionRecord | null> {
    const run = async (c: PoolClient): Promise<WebhookSubscriptionRecord | null> => {
      const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
      const values: unknown[] = [id];
      let paramIndex = 2;

      if (updates.url !== undefined) {
        setClauses.push(`url = $${paramIndex++}`);
        values.push(updates.url);
      }

      if (updates.events !== undefined) {
        setClauses.push(`events = $${paramIndex++}`);
        values.push(updates.events);
      }

      if (updates.isActive !== undefined) {
        setClauses.push(`is_active = $${paramIndex++}`);
        values.push(updates.isActive);

        // If explicitly re-enabling, reset consecutive failures counter
        if (updates.isActive === true) {
          setClauses.push("consecutive_failures = 0");
        }
      }

      const sql = `
        UPDATE webhook_subscriptions
        SET ${setClauses.join(", ")}
        WHERE id = $1
        RETURNING
          id,
          tenant_id,
          created_by,
          url,
          secret,
          events,
          is_active,
          consecutive_failures,
          created_at,
          updated_at;
      `;

      const result = await c.query<WebhookSubscriptionRecord>(sql, values);
      return result.rows[0] ?? null;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Rotates the HMAC signing secret for a subscription.
   */
  async rotateSecret(
    tenantId: string,
    id: string,
    newSecret: string,
    client?: PoolClient,
  ): Promise<WebhookSubscriptionRecord | null> {
    const run = async (c: PoolClient): Promise<WebhookSubscriptionRecord | null> => {
      const sql = `
        UPDATE webhook_subscriptions
        SET
          secret = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          tenant_id,
          created_by,
          url,
          secret,
          events,
          is_active,
          consecutive_failures,
          created_at,
          updated_at;
      `;

      const result = await c.query<WebhookSubscriptionRecord>(sql, [id, newSecret]);
      return result.rows[0] ?? null;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Permanently deletes a webhook subscription.
   */
  async delete(tenantId: string, id: string, client?: PoolClient): Promise<boolean> {
    const run = async (c: PoolClient): Promise<boolean> => {
      const sql = `DELETE FROM webhook_subscriptions WHERE id = $1;`;
      const result = await c.query(sql, [id]);
      return (result.rowCount ?? 0) > 0;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Records a webhook delivery attempt in the audit history.
   */
  async recordDelivery(
    tenantId: string,
    input: RecordDeliveryRepoInput,
    client?: PoolClient,
  ): Promise<WebhookDeliveryRecord> {
    const run = async (c: PoolClient): Promise<WebhookDeliveryRecord> => {
      const sql = `
        INSERT INTO webhook_deliveries (
          id,
          tenant_id,
          subscription_id,
          event,
          payload,
          request_headers,
          response_status,
          response_body,
          error_message,
          duration_ms,
          attempt_number
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
          id,
          tenant_id,
          subscription_id,
          event,
          payload,
          request_headers,
          response_status,
          response_body,
          error_message,
          duration_ms,
          attempt_number,
          delivered_at;
      `;

      const result = await c.query<WebhookDeliveryRecord>(sql, [
        input.id,
        tenantId,
        input.subscriptionId,
        input.event,
        JSON.stringify(input.payload),
        JSON.stringify(input.requestHeaders),
        input.responseStatus ?? null,
        input.responseBody ?? null,
        input.errorMessage ?? null,
        input.durationMs,
        input.attemptNumber,
      ]);

      const row = result.rows[0];
      if (!row) {
        throw new Error("Failed to insert webhook delivery audit record");
      }
      return row;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }

  /**
   * Lists the most recent delivery logs for a specific subscription.
   */
  async listDeliveries(
    tenantId: string,
    subscriptionId: string,
    limit = 20,
    client?: PoolClient,
  ): Promise<WebhookDeliveryRecord[]> {
    const run = async (c: PoolClient): Promise<WebhookDeliveryRecord[]> => {
      const sql = `
        SELECT
          id,
          tenant_id,
          subscription_id,
          event,
          payload,
          request_headers,
          response_status,
          response_body,
          error_message,
          duration_ms,
          attempt_number,
          delivered_at
        FROM webhook_deliveries
        WHERE subscription_id = $1
        ORDER BY delivered_at DESC
        LIMIT $2;
      `;

      const result = await c.query<WebhookDeliveryRecord>(sql, [subscriptionId, limit]);
      return result.rows;
    };

    return client ? run(client) : withTenantTransaction(tenantId, run);
  }
  /**
   * Resets consecutive_failures to 0 after a successful delivery.
   * Uses `AND consecutive_failures > 0` to avoid unnecessary row writes on healthy endpoints.
   */
  async recordDeliverySuccess(
    tenantId: string,
    subscriptionId: string,
    client?: PoolClient,
  ): Promise<void> {
    const run = async (c: PoolClient): Promise<void> => {
      const sql = `
      UPDATE webhook_subscriptions
      SET
       consecutive_failures = 0,
       updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
       AND consecutive_failures > 0;
      `;
      await c.query(sql, [subscriptionId]);
    };
    return client ? run(client) : withTenantTransaction(tenantId, run);
  }
  /**
   * Atomically increments consecutive_failures and trips the circuit breaker
   * (sets is_active = FALSE) if the failure threshold is reached.
   */
  async recordDeliveryFailure(
    tenantId: string,
    subscriptionId: string,
    maxFailuresThreshold: number,
    client?: PoolClient,
  ): Promise<WebhookSubscriptionRecord | null> {
    const run = async (c: PoolClient): Promise<WebhookSubscriptionRecord | null> => {
      const sql = `
        UPDATE webhook_subscriptions
        SET
          consecutive_failures = consecutive_failures + 1,
          is_active = CASE
            WHEN consecutive_failures + 1 >= $2 THEN FALSE
            ELSE is_active
          END,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING
          id,
          tenant_id,
          created_by,
          url,
          secret,
          events,
          is_active,
          consecutive_failures,
          created_at,
          updated_at;
      `;
      const result = await c.query<WebhookSubscriptionRecord>(sql, [
        subscriptionId,
        maxFailuresThreshold,
      ]);
      return result.rows[0] ?? null;
    };
    return client ? run(client) : withTenantTransaction(tenantId, run);
  }
}

export const webhookRepository = new WebhookRepository();
