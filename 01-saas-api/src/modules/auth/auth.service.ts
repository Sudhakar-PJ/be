import { uuidv7 } from "uuidv7";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { ConflictError, UnauthorizedError } from "../../lib/apiError";
import {
  generateOpaqueToken,
  hashPassword,
  hashToken,
  signAccessToken,
  verifyPassword,
} from "../../lib/crypto";
import {
  type AuthResponse,
  type LoginInput,
  type SignupInput,
  type UserResponse,
} from "./auth.schemas";
import { sessionRepository } from "./session.repository";
import { userRepository, type UserRecord } from "./user.repository";

export interface RequestMetadata {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface AuthSessionResult extends AuthResponse {
  rawRefreshToken: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  rawRefreshToken: string;
}

/**
 * Sanitizes a database UserRecord into a safe UserResponse (drops password_hash).
 */
function toUserResponse(user: UserRecord): UserResponse {
  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    isVerified: user.is_verified,
    createdAt: user.created_at,
  };
}

export class AuthService {
  /**
   * Registers a new user, hashes password with Argon2id, and initiates root session.
   */
  async signup(input: SignupInput, meta: RequestMetadata = {}): Promise<AuthSessionResult> {
    // 1. Verify email uniqueness
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError("A user with this email already exists", "EMAIL_ALREADY_EXISTS");
    }

    // 2. Hash password with memory-hard Argon2id
    const passwordHash = await hashPassword(input.password);

    // 3. Create user in PostgreSQL with UUID v7
    const userId = uuidv7();
    const user = await userRepository.create({
      id: userId,
      email: input.email,
      password_hash: passwordHash,
      full_name: input.fullName,
    });

    // 4. Create root session & token family
    const sessionId = uuidv7();
    const familyId = uuidv7();
    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    await sessionRepository.create({
      id: sessionId,
      userId: user.id,
      tokenHash,
      familyId,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    });

    // 5. Mint stateless RS256 Access Token
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
    });

    return {
      user: toUserResponse(user),
      accessToken,
      rawRefreshToken: rawToken,
    };
  }

  /**
   * Authenticates user credentials and creates a new session family.
   */
  async login(input: LoginInput, meta: RequestMetadata = {}): Promise<AuthSessionResult> {
    // 1. Find user by email
    const user = await userRepository.findByEmail(input.email);
    if (!user) {
      // Use generic message to prevent email enumeration attacks
      throw new UnauthorizedError("Invalid email or password", "INVALID_CREDENTIALS");
    }

    // 2. Verify Argon2id password hash
    const isPasswordValid = await verifyPassword(user.password_hash, input.password);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password", "INVALID_CREDENTIALS");
    }

    // 3. Create fresh session family for this device login
    const sessionId = uuidv7();
    const familyId = uuidv7();
    const { rawToken, tokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    await sessionRepository.create({
      id: sessionId,
      userId: user.id,
      tokenHash,
      familyId,
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    });

    // 4. Mint RS256 Access Token
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
    });

    return {
      user: toUserResponse(user),
      accessToken,
      rawRefreshToken: rawToken,
    };
  }

  /**
   * Rotates a refresh token and issues a new access token.
   * Detects reuse/replay attacks and executes family-wide revocation.
   */
  async refresh(rawRefreshToken: string, meta: RequestMetadata = {}): Promise<TokenRefreshResult> {
    // 1. Compute SHA-256 hash of the presented token
    const tokenHash = hashToken(rawRefreshToken);

    // 2. Look up session in database
    const session = await sessionRepository.findByTokenHash(tokenHash);
    if (!session) {
      throw new UnauthorizedError("Invalid or expired refresh token", "INVALID_REFRESH_TOKEN");
    }

    // 3. 🚨 THEFT DETECTION: If token was already revoked, someone is replaying an old token!
    if (session.is_revoked) {
      logger.warn(
        { userId: session.user_id, familyId: session.family_id },
        "🚨 Refresh token reuse detected! Revoking entire session family.",
      );

      // Execute the Nuclear Option: revoke all sessions in this family
      await sessionRepository.revokeFamily(session.family_id, session.user_id);

      throw new UnauthorizedError(
        "Refresh token reuse detected. All sessions in this family have been revoked.",
        "TOKEN_REUSE_DETECTED",
      );
    }

    // 4. Check expiration
    if (new Date() > new Date(session.expires_at)) {
      throw new UnauthorizedError("Refresh token has expired", "TOKEN_EXPIRED");
    }

    // 5. Verify the user still exists
    const user = await userRepository.findById(session.user_id);
    if (!user) {
      throw new UnauthorizedError("User not found", "USER_NOT_FOUND");
    }

    // 6. Rotate session atomically within a PostgreSQL transaction
    const newSessionId = uuidv7();
    const { rawToken: newRawToken, tokenHash: newTokenHash } = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    await sessionRepository.rotate(session.id, {
      id: newSessionId,
      userId: session.user_id,
      tokenHash: newTokenHash,
      familyId: session.family_id,
      expiresAt,
      userAgent: meta.userAgent ?? session.user_agent,
      ipAddress: meta.ipAddress ?? session.ip_address,
    });

    // 7. Mint fresh Access Token
    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
    });

    return {
      accessToken,
      rawRefreshToken: newRawToken,
    };
  }

  /**
   * Logs out a session by revoking its refresh token hash.
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashToken(rawRefreshToken);
    await sessionRepository.revokeByTokenHash(tokenHash);
  }
}

export const authService = new AuthService();
