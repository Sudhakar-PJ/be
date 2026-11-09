import { uuidv7 } from "uuidv7";
import { logger } from "../../config/logger";
import { ForbiddenError, NotFoundError } from "../../lib/apiError";
import { generatePat } from "../../lib/pat";
import { TenantRole } from "../../types/express";
import {
  type CreatePatInput,
  type PatCreatedResponse,
  type PatSummaryResponse,
} from "./pat.schema";
import {
  PatRepository,
  patRepository,
  toPatSummaryResponse,
} from "./pat.repository";

export class PatService {
  constructor(private readonly patRepo: PatRepository = patRepository) {}

  /**
   * Mints a new Personal Access Token for the user within the tenant workspace.
   * Exposes the plaintext token exactly once upon creation.
   */
  async createPat(
    tenantId: string,
    userId: string,
    input: CreatePatInput,
  ): Promise<PatCreatedResponse> {
    // 1. Generate CSPRNG token, SHA-256 hash, and safe preview
    const { rawToken, tokenHash, tokenPreview } = generatePat();

    // 2. Generate UUID v7 identifier for the record
    const patId = uuidv7();

    // 3. Persist token hash and metadata under RLS transaction
    const record = await this.patRepo.create(tenantId, {
      id: patId,
      userId,
      name: input.name,
      tokenHash,
      tokenPreview,
      scopes: input.scopes,
      expiresAt: input.expiresAt,
    });

    logger.info(
      { patId, tenantId, userId, tokenPreview, scopes: input.scopes },
      "Personal Access Token minted successfully",
    );

    // 4. Return one-time response containing rawToken
    return {
      ...toPatSummaryResponse(record),
      rawToken,
    };
  }

  /**
   * Lists tokens within the tenant workspace.
   * OWNER and ADMIN can see all workspace tokens; standard members see only their own.
   */
  async listPats(
    tenantId: string,
    userId: string,
    userRole: TenantRole,
  ): Promise<PatSummaryResponse[]> {
    const isElevated = userRole === "OWNER" || userRole === "ADMIN";
    const filterUserId = isElevated ? undefined : userId;

    const records = await this.patRepo.findAll(tenantId, filterUserId);
    return records.map(toPatSummaryResponse);
  }

  /**
   * Retrieves metadata for a specific token by ID.
   */
  async getPatById(
    tenantId: string,
    userId: string,
    userRole: TenantRole,
    patId: string,
  ): Promise<PatSummaryResponse> {
    const record = await this.patRepo.findById(tenantId, patId);
    if (!record) {
      throw new NotFoundError(
        `Personal Access Token with ID '${patId}' was not found in this workspace`,
        "PAT_NOT_FOUND",
      );
    }

    const isElevated = userRole === "OWNER" || userRole === "ADMIN";
    if (!isElevated && record.user_id !== userId) {
      throw new ForbiddenError(
        "You are not authorized to view this token",
        "INSUFFICIENT_PERMISSIONS",
      );
    }

    return toPatSummaryResponse(record);
  }

  /**
   * Revokes a token.
   * Can be performed by the token owner or an OWNER/ADMIN of the tenant.
   */
  async revokePat(
    tenantId: string,
    userId: string,
    userRole: TenantRole,
    patId: string,
  ): Promise<void> {
    const record = await this.patRepo.findById(tenantId, patId);
    if (!record) {
      throw new NotFoundError(
        `Personal Access Token with ID '${patId}' was not found in this workspace`,
        "PAT_NOT_FOUND",
      );
    }

    // If already revoked, operation is an idempotent no-op
    if (record.revoked_at) {
      return;
    }

    const isElevated = userRole === "OWNER" || userRole === "ADMIN";
    if (!isElevated && record.user_id !== userId) {
      throw new ForbiddenError(
        "You are not authorized to revoke this token",
        "INSUFFICIENT_PERMISSIONS",
      );
    }

    await this.patRepo.revoke(tenantId, patId);

    logger.info(
      { patId, tenantId, revokedBy: userId, ownerId: record.user_id },
      "Personal Access Token revoked",
    );
  }
}

export const patService = new PatService();