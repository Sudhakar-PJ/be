import crypto from "crypto";

/**
 * Standard prefix for Personal Access Tokens.
 * Enables automated secret scanning by tools like GitHub Secret Scanning.
 */
export const PAT_PREFIX = "pat_live_";

/**
 * Granular permission scopes supported by the platform.
 */
export const VALID_PAT_SCOPES = [
  "*",
  "task:read",
  "task:write",
  "projects:read",
  "projects:write",
  "webhooks:read",
  "webhooks:write",
] as const;

export type PatScope = (typeof VALID_PAT_SCOPES)[number];

export interface GeneratedPat {
  rawToken: string;
  tokenHash: string;
  tokenPreview: string;
}

/**
 * Generates a high-entropy Personal Access Token.
 *
 * Uses Node.js crypto.randomBytes(32) which pulls from the OS CSPRNG
 * (Cryptographically Secure Pseudo-Random Number Generator, e.g. /dev/urandom or Windows BCryptGenRandom).
 * 32 bytes = 256 bits of entropy (2^256 possible combinations), rendering brute-force attacks impossible.
 */
export function generatePat(): GeneratedPat {
  const entropy = crypto.randomBytes(32).toString("hex");
  const rawToken = `${PAT_PREFIX}${entropy}`;
  const tokenPreview = `${PAT_PREFIX}${entropy.slice(0, 4)}...`;

  const tokenHash = hashPat(rawToken);

  return {
    rawToken,
    tokenHash,
    tokenPreview,
  };
}

/**
 * Computes the deterministic SHA-256 hash of an incoming plaintext token.
 * This is used during authentication to perform a fast O(1) indexed lookup in PostgreSQL.
 */
export function hashPat(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Verifies if an incoming token's assigned scopes satisfy the required scope.
 *
 * Logic:
 * 1. The wildcard scope '*' satisfies all permissions.
 * 2. Exact match satisfies the permission.
 * 3. Specific resource write (e.g. 'tasks:write') also satisfies 'tasks:read'.
 */
export function hasRequiredScope(
  tokenScopes: readonly string[] | string[],
  requiredScope: PatScope,
): boolean {
  if (tokenScopes.includes("*")) return true;

  if (tokenScopes.includes(requiredScope)) return true;

  if (requiredScope.endsWith(":read")) {
    const resource = requiredScope.split(":")[0];
    const writeScope = `${resource}:write`;

    if (tokenScopes.includes(writeScope)) return true;
  }
  return false;
}
