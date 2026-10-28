import argon2 from "argon2";
import crypto from "crypto";
import jwt, { type VerifyOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { UnauthorizedError } from "./apiError";

// OWASP & RFC 9106 recommended Argon2id baseline configuration
const ARGON2_OPTIONS: argon2.Options & { type: 2 } = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3, // 3 iterations
  parallelism: 4, // 4 parallel threads
  hashLength: 32, // 32-byte raw output
};

export interface AccessTokenPayload {
  sub: string; // User UUID
  email: string;
  role?: string;
}

export interface DecodedAccessToken extends AccessTokenPayload {
  iat: number;
  exp: number;
}

/**
 * Normalizes PEM keys read from environment variables.
 * Handles escaped newlines ("\n") often present in .env files.
 */
function normalizeKey(key: string): string {
  return key.replace(/\\n/g, "\n");
}

/**
 * Hashes a plaintext password using Argon2id.
 *
 * @param password Plaintext user password
 * @returns Argon2id PHC string
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * Constant-time comparison is handled internally by Argon2.
 *
 * @param hash Argon2id PHC string from database
 * @param plain Plaintext password submitted by user
 * @returns boolean
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Signs an RS256 Asymmetric JSON Web Token using the private key.
 *
 * @param payload Claims to embed in the token (sub, email, role)
 * @returns Signed JWT string
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  const privateKey = normalizeKey(env.JWT_ACCESS_PRIVATE_KEY);

  const signOptions: jwt.SignOptions = {
    algorithm: "RS256",
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as NonNullable<jwt.SignOptions["expiresIn"]>,
  };

  return jwt.sign(payload, privateKey, signOptions);
}

/**
 * Verifies and decodes an RS256 Asymmetric JWT using the public key.
 * Throws UnauthorizedError on expiration, signature tampering, or malformed token.
 *
 * @param token JWT string from Authorization header
 * @param options Optional verification options
 * @returns Decoded access token payload
 */
export function verifyAccessToken(
  token: string,
  options?: Omit<VerifyOptions, "algorithms">,
): DecodedAccessToken {
  const publicKey = normalizeKey(env.JWT_ACCESS_PUBLIC_KEY);

  try {
    return jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      ...options,
    }) as DecodedAccessToken;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError("Access token has expired", "TOKEN_EXPIRED");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError("Invalid access token", "INVALID_TOKEN");
    }
    throw new UnauthorizedError("Token verification failed", "UNAUTHORIZED");
  }
}

/**
 * Generates a cryptographically secure random opaque token (256 bits).
 * Used for Refresh Tokens, Email Verification, and Password Reset tokens.
 *
 * @param bytes Number of random bytes (default: 32 = 256 bits of entropy)
 * @returns Hex-encoded random token string
 */
export function generateRandomToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Computes a SHA-256 hash of an opaque token.
 * Stored in PostgreSQL `VARCHAR(64)` columns (`token_hash`).
 *
 * @param token Raw opaque token string
 * @returns 64-character hexadecimal SHA-256 digest
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates a 256-bit cryptographically secure random token (64 hex characters)
 * along with its precomputed SHA-256 hash for database persistence.
 */
export function generateOpaqueToken(): { rawToken: string; tokenHash: string } {
  const rawToken = generateRandomToken(32);
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Performs a constant-time comparison of two strings to prevent timing attacks.
 *
 * @param a First string
 * @param b Second string
 * @returns boolean
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
