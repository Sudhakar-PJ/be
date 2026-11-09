import { Request, Response, NextFunction } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/apiError";
import { verifyAccessToken } from "../lib/crypto";
import { getRequestContext } from "../lib/context";
import { TenantRole } from "../types/express";
import { hashPat, hasRequiredScope, PAT_PREFIX, PatScope } from "../lib/pat";
import { query } from "../config/database"
import { logger } from "../config/logger";

interface PatLookupRow {
  id: string;
  tenant_id: string;
  user_id: string;
  scopes: string[];
  expires_at: Date | null;
  revoked_at: Date | null;
  email: string;
  tenant_role: TenantRole | null;
}

/**
 * Dual-Authentication Middleware:
 * Inspects Authorization: Bearer <token>.
 * - Routes tokens starting with 'pat_live_' to database-backed PAT verification.
 * - Routes all other tokens to in-memory RS256 JWT verification.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    throw new UnauthorizedError(
      "Missing or Invalid Authorization header. Expected 'Bearer <token>",
      "MISSING_TOKEN",
    );
  }

  const token = authHeader.slice(7).trim();
  if (!token) throw new UnauthorizedError("Bearer token is empty", "INVALID_TOKEN");

  if (token.startsWith(PAT_PREFIX)) {
    await authenticatePat(token, req)
  } else {
    authenticateJwt(token, req)
  }
next();
  } catch (error) {
    next(error);
  }
}

/**
* Authenticates a Personal Access Token (PAT).
*/
async function authenticatePat(token: string, req: Request): Promise<void> {
  const tokenHash = hashPat(token);

  const result = await query<PatLookupRow>(
    `SELECT
      p.id,
      p.tenant_id,
      p.user_id, 
      p.scopes, 
      p.expires_at, 
      p.revoked_at,
      u.email,
      tm.role AS tenant_role
      FROM personal_access_tokens p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN tenant_members tm ON tm.tenant_id = p.tenant_id AND tm.user_id = p.user_id
     WHERE p.token_hash = $1
     LIMIT 1`,
     [tokenHash]
  );
  const pat = result.rows[0];

  if(!pat) throw new UnauthorizedError("Invalid or non-existent Personal Access Token", "INVALID_PAT");

  if(pat.revoked_at) throw new UnauthorizedError("Personal Access Token has been revoked", "PAT_REVOKED");

  if(pat.expires_at && new Date(pat.expires_at).getTime() <= Date.now()) throw new UnauthorizedError("Personal Access Token has expired", "PAT_EXPIRED");

  if(!pat.tenant_role) throw new UnauthorizedError(
      "The token creator is no longer an active member of this tenant",
      "PAT_TENANT_ACCESS_LOST",
    );

// Non-blocking fire-and-forget audit timestamp update
 query(
  `UPDATE personal_access_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1`, [pat.id]
 ).catch((err: unknown) => {
  logger.error({err, patId: pat.id}, "Failed to update PAT last_used_at timestamp")
 });

 req.user = {
  id: pat.user_id,
  email: pat.email
 }  

 req.auth = {
  type: "PAT",
  scopes: pat.scopes,
  patId: pat.id,
 }

 req.tenant = {
  id: pat.tenant_id,
  role: pat.tenant_role
 }

 const store = getRequestContext();
 if(store) {
  store.userId = pat.user_id;
  store.tenantId = pat.tenant_id;
 }
}

/**
 * Authenticates an RS256 JWT Access Token.
 */

 function authenticateJwt(token: string, req: Request): void {
  const decoded = verifyAccessToken(token);
  req.user = {
    id: decoded.sub,
    email: decoded.email,
  };
  req.auth = {
    type: "JWT",
    scopes: ["*"],
  };
  const store = getRequestContext();
  if (store) {
    store.userId = decoded.sub;
  }
}

/**
 * Enforces granular scope permissions on routes.
 * JWT callers automatically pass with wildcard permissions.
 * PAT callers must satisfy the required scope via exact match, resource write, or '*'.
 */
export function requireScope(requiredScope: PatScope) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if(!req.auth) throw new UnauthorizedError("Authentication required before evaluating scopes", "AUTH_REQUIRED");

    if(!hasRequiredScope(req.auth.scopes, requiredScope)) throw new ForbiddenError(
        `Insufficient token scopes. This endpoint requires the '${requiredScope}' permission.`,
        "INSUFFICIENT_SCOPE",
      );

      next();
  }
}

/**
 * Ensures the request originates from an interactive user session (JWT).
 * Rejects machine-to-machine API keys (PATs) to prevent token nesting
 * and unauthorized administrative credential creation.
 */
export function requireUserSession(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.type === "PAT") {
    throw new ForbiddenError(
      "Personal Access Tokens cannot perform this administrative action. Interactive user session authentication (JWT) is required.",
      "PAT_ACTION_DISALLOWED",
    );
  }
  next();
}