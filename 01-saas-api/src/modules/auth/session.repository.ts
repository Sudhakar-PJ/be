import { type PoolClient } from "pg";
import { pool, withTransaction } from "../../config/database";

export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  is_revoked: boolean;
  expires_at: Date;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSessionInput {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent?: string | null | undefined;
  ipAddress?: string | null | undefined;
}


export class SessionRepository {
  /**
   * Looks up a session by the SHA-256 hash of its refresh token.
   */
  async findByTokenHash(tokenHash: string, client?: PoolClient): Promise<SessionRecord | null> {
    const query = `
      SELECT id, user_id, token_hash, family_id, is_revoked, expires_at, user_agent, ip_address, created_at, updated_at
      FROM sessions
      WHERE token_hash = $1
      LIMIT 1;
    `;
    const db = client ?? pool;
    const result = await db.query<SessionRecord>(query, [tokenHash]);
    return result.rows[0] ?? null;
  }

  /**
   * Inserts a new root session (used on initial login).
   */
  async create(input: CreateSessionInput, client?: PoolClient): Promise<SessionRecord> {
    const query = `
      INSERT INTO sessions (id, user_id, token_hash, family_id, expires_at, user_agent, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, user_id, token_hash, family_id, is_revoked, expires_at, user_agent, ip_address, created_at, updated_at;
    `;
    const db = client ?? pool;
    const values = [
      input.id,
      input.userId,
      input.tokenHash,
      input.familyId,
      input.expiresAt,
      input.userAgent ?? null,
      input.ipAddress ?? null,
    ];
    const result = await db.query<SessionRecord>(query, values);
    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to create session");
    }
    return row;
  }

  /**
   * Rotates a session atomically within a transaction:
   * 1. Marks current session as revoked.
   * 2. Inserts new session with the same family_id.
   */
  async rotate(
    currentSessionId: string,
    newSessionInput: CreateSessionInput
  ): Promise<SessionRecord> {
    return withTransaction(async (client) => {
      // 1. Invalidate consumed session
      const revokeQuery = `
        UPDATE sessions
        SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;
      `;
      await client.query(revokeQuery, [currentSessionId]);

      // 2. Insert child session
      return this.create(newSessionInput, client);
    });
  }

  /**
   * Nuclear Option: Revokes ALL sessions belonging to a family.
   * Triggered when token reuse (replay attack) is detected.
   */
  async revokeFamily(familyId: string, userId: string, client?: PoolClient): Promise<number> {
    const query = `
      UPDATE sessions
      SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE family_id = $1 AND user_id = $2 AND is_revoked = FALSE;
    `;
    const db = client ?? pool;
    const result = await db.query(query, [familyId, userId]);
    return result.rowCount ?? 0;
  }

  /**
   * Revokes a single session by token hash (used on logout).
   */
  async revokeByTokenHash(tokenHash: string, client?: PoolClient): Promise<boolean> {
    const query = `
      UPDATE sessions
      SET is_revoked = TRUE, updated_at = CURRENT_TIMESTAMP
      WHERE token_hash = $1 AND is_revoked = FALSE;
    `;
    const db = client ?? pool;
    const result = await db.query(query, [tokenHash]);
    return (result.rowCount ?? 0) > 0;
  }
}

export const sessionRepository = new SessionRepository();
