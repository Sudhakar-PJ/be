import crypto from "crypto";
import { uuidv7 } from "uuidv7";
import { withTenantTransaction } from "../../config/database";
import { logger } from "../../config/logger";
import { auditRepository } from "./audit.repository";
import { AuditLogRecord, AuditVerificationResult, CreateAuditLogInput } from "./audit.types";

export const GENESIS_HASH = "0".repeat(64);

/**
 * Deterministically serializes JSON payloads by recursively sorting object keys.
 * Ensures { a: 1, b: 2 } and { b: 2, a: 1 } yield the exact same SHA-256 digest.
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalizeJson).join(",")}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalizeJson((obj as Record<string, unknown>)[k])}`,
  );
  return `{${pairs.join(",")}}`;
}

/**
 * Computes a deterministic SHA-256 hash for an audit log entry.
 */
export function computeAuditHash(params: {
  previousHash: string;
  tenantId: string;
  actorId: string | null;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date | string;
}): string {
  const createdAtIso =
    params.createdAt instanceof Date
      ? params.createdAt.toISOString()
      : new Date(params.createdAt).toISOString();

  const content = [
    params.previousHash,
    params.tenantId,
    params.actorId ?? "",
    params.actorType,
    params.action,
    params.resourceType,
    params.resourceId ?? "",
    canonicalizeJson(params.payload),
    createdAtIso,
  ].join("|");

  return crypto.createHash("sha256").update(content).digest("hex");
}

export class AuditService {
  /**
   * Appends an immutable, hash-chained audit log entry.
   * Uses an advisory transaction lock scoped to the tenant to guarantee
   * serial execution and eliminate race conditions during chain calculation.
   */
  async recordEvent(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    return withTenantTransaction(input.tenantId, async (client) => {
      // 1. Acquire transaction-scoped advisory lock for this tenant.
      // Serializes concurrent audit writes within this tenant while allowing other tenants to run concurrently.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('audit_logs:' || $1::text))", [
        input.tenantId,
      ]);

      // 2. Fetch the latest record to obtain the current chain tip (previous_hash)
      const latest = await auditRepository.getLatestForTenant(client, input.tenantId);
      const previousHash = latest ? latest.current_hash : GENESIS_HASH;

      // 3. Prepare new entry details
      const id = uuidv7();
      const createdAt = new Date();
      const actorId = input.actorId ?? null;
      const actorType = input.actorType ?? "user";
      const resourceId = input.resourceId ?? null;
      const payload = input.payload ?? {};

      // 4. Compute cryptographic current_hash
      const currentHash = computeAuditHash({
        previousHash,
        tenantId: input.tenantId,
        actorId,
        actorType,
        action: input.action,
        resourceType: input.resourceType,
        resourceId,
        payload,
        createdAt,
      });

      // 5. Persist the immutable audit log record
      const record = await auditRepository.insert(client, {
        id,
        tenantId: input.tenantId,
        actorId,
        actorType,
        action: input.action,
        resourceType: input.resourceType,
        resourceId,
        payload,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        previousHash,
        currentHash,
        createdAt,
      });

      logger.info(
        {
          auditId: record.id,
          tenantId: record.tenant_id,
          action: record.action,
          currentHash: record.current_hash,
        },
        "Audit log entry recorded",
      );

      return record;
    });
  }

  /**
   * Cryptographically verifies the integrity of an entire tenant's audit trail.
   * Walks the chain from Genesis to tip, verifying:
   * 1. previous_hash link integrity between consecutive rows
   * 2. current_hash mathematical validity against record contents
   */
  async verifyChain(tenantId: string): Promise<AuditVerificationResult> {
    return withTenantTransaction(tenantId, async (client) => {
      const records = await auditRepository.getAllForTenantAsc(client, tenantId);

      if (records.length === 0) {
        return {
          isValid: true,
          totalEntries: 0,
        };
      }

      for (let i = 0; i < records.length; i++) {
        const record = records[i]!;

        // 1. Verify previous_hash linkage
        if (i === 0) {
          if (record.previous_hash !== GENESIS_HASH) {
            return {
              isValid: false,
              totalEntries: records.length,
              tamperedIndex: 0,
              tamperedLogId: record.id,
              reason: "Genesis record has invalid previous_hash",
              expectedHash: GENESIS_HASH,
              actualHash: record.previous_hash,
            };
          }
        } else {
          const previousRecord = records[i - 1]!;
          if (record.previous_hash !== previousRecord.current_hash) {
            return {
              isValid: false,
              totalEntries: records.length,
              tamperedIndex: i,
              tamperedLogId: record.id,
              reason:
                "Hash chain broken: previous_hash does not match preceding record current_hash",
              expectedHash: previousRecord.current_hash,
              actualHash: record.previous_hash,
            };
          }
        }

        // 2. Re-compute and verify current_hash
        const expectedCurrentHash = computeAuditHash({
          previousHash: record.previous_hash,
          tenantId: record.tenant_id,
          actorId: record.actor_id,
          actorType: record.actor_type,
          action: record.action,
          resourceType: record.resource_type,
          resourceId: record.resource_id,
          payload: record.payload,
          createdAt: record.created_at,
        });

        if (record.current_hash !== expectedCurrentHash) {
          return {
            isValid: false,
            totalEntries: records.length,
            tamperedIndex: i,
            tamperedLogId: record.id,
            reason: "Record content was tampered: stored current_hash does not match computed hash",
            expectedHash: expectedCurrentHash,
            actualHash: record.current_hash,
          };
        }
      }

      return {
        isValid: true,
        totalEntries: records.length,
      };
    });
  }
}

export const auditService = new AuditService();
