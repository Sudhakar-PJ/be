import client from "@prometheus-io/client";
import { register } from "./registry";

/**
 * Login Attempts Counter.
 * Tracks user authentication attempts labeled by success or failure.
 */
export const authLoginAttemptsTotal = new client.Counter({
  name: "auth_login_attempts_total",
  help: "Total number of user login attempts",
  labelNames: ["status"] as const, // 'success' | 'failure'
  registers: [register],
});

/**
 * Token Refresh Counter.
 * Tracks session rotation, expired tokens, and adversarial token replay attacks.
 */
export const authTokenRefreshTotal = new client.Counter({
  name: "auth_token_refresh_total",
  help: "Total number of refresh token exchanges",
  labelNames: ["status"] as const, // 'success' | 'replay_detected' | 'expired'
  registers: [register],
});

/**
 * Token Denylist Hits Counter.
 * Increments when a revoked access token is blocked by the Redis jti denylist.
 */
export const authTokenDenylistHitsTotal = new client.Counter({
  name: "auth_token_denylist_hits_total",
  help: "Total number of requests blocked by the revoked JWT access token denylist",
  registers: [register],
});

/**
 * Argon2id Hashing Duration Histogram.
 * Measures execution time of memory-hard password verification.
 */
export const authArgon2DurationSeconds = new client.Histogram({
  name: "auth_argon2_duration_seconds",
  help: "Duration of Argon2id password hashing operations in seconds",
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2],
  registers: [register],
});
