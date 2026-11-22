import crypto from "crypto";
import { timingSafeCompare } from "./crypto";

export interface SignedWebhookPayload {
  header: string;
  timestamp: number;
  signature: string;
}

/**
 * Computes an HMAC-SHA256 signature over `${timestamp}.${rawPayload}`.
 * Binding the timestamp into the signed digest prevents replay attacks.
 *
 * Output header format mirrors Stripe's standard: `t=<unix_seconds>,v1=<hex_hmac>`
 */
export function signWebhookPayload(
  rawPayload: string,
  secret: string,
  timestampSeconds?: number,
): SignedWebhookPayload {
  const timestamp = timestampSeconds ?? Math.floor(Date.now() / 1000);
  const signedContent = `${timestamp}.${rawPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(signedContent, "utf8").digest("hex");

  return {
    header: `t=${timestamp},v1=${signature}`,
    timestamp,
    signature,
  };
}

/**
 * Verifies an incoming `X-Webhook-Signature` header (`t=...,v1=...`).
 * Enforces:
 * 1. Valid header structure
 * 2. Timestamp freshness within `toleranceSeconds` (default: 300s / 5 minutes)
 * 3. Constant-time HMAC comparison via `timingSafeCompare`
 */
export function verifyWebhookSignature(
  rawPayload: string,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): boolean {
  const parts = signatureHeader.split(",");
  let timestampStr: string | undefined;
  let signatureV1: string | undefined;

  for (const part of parts) {
    const [key, value] = part.trim().split("=");
    if (key === "t" && value) {
      timestampStr = value;
    } else if (key === "v1" && value) {
      signatureV1 = value;
    }
  }

  if (!timestampStr || !signatureV1) {
    return false;
  }

  const timestamp = Number(timestampStr);
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return false;
  }

  // Replay protection: reject requests outside the tolerance window
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return false;
  }

  const expected = signWebhookPayload(rawPayload, secret, timestamp);
  return timingSafeCompare(signatureV1, expected.signature);
}
