import dns from "dns/promises";
import net from "net";
import { UnrecoverableError } from "bullmq";
import { uuidv7 } from "uuidv7";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { type WebhookDeliveryPayload } from "../jobs/contracts";
import { signWebhookPayload } from "../lib/webhook-signature";
import { webhookRepository, WebhookRepository } from "../modules/webhooks/webhook.repository";

const DELIVERY_TIMEOUT_MS = 5000;
const MAX_RESPONSE_BODY_BYTES = 2048;
export const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 10;

/**
 * Checks whether an IPv4 or IPv6 address belongs to a private, loopback,
 * link-local, or cloud metadata range (SSRF defense).
 */
function isPrivateOrReservedIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6 addresses (e.g. "::ffff:127.0.0.1" -> "127.0.0.1")
  const normalized = ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : ip.toLowerCase();

  if (net.isIPv4(normalized)) {
    const octets = normalized.split(".").map(Number);
    const [a, b] = octets;
    if (a === undefined || b === undefined) return true;

    if (a === 0) return true; // 0.0.0.0/8 ("this network")
    if (a === 10) return true; // 10.0.0.0/8 (RFC 1918 private)
    if (a === 127) return true; // 127.0.0.0/8 (loopback)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local & cloud metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC 1918 private)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC 1918 private)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    return false;
  }

  if (net.isIPv6(normalized)) {
    if (normalized === "::1" || normalized === "::") return true; // Loopback / unspecified
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // Unique local fc00::/7
    if (
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true; // Link-local fe80::/10
    }
    return false;
  }

  return true;
}

/**
 * Runtime DNS resolution guard against DNS-rebinding SSRF attacks.
 */
async function assertPublicDestination(rawUrl: string): Promise<void> {
  if (env.NODE_ENV !== "production") {
    return;
  }

  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname;

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new UnrecoverableError(`SSRF protection blocked delivery to private IP: ${hostname}`);
    }
    return;
  }

  const records = await dns.lookup(hostname, { all: true });
  if (records.length === 0) {
    throw new Error(`DNS resolution returned no records for ${hostname}`);
  }

  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new UnrecoverableError(
        `SSRF protection blocked delivery: ${hostname} resolved to private IP ${record.address}`,
      );
    }
  }
}

/**
 * Reads at most `maxBytes` from a fetch Response stream so oversized
 * responses cannot exhaust worker memory.
 */
async function readTruncatedResponseBody(
  response: Response,
  maxBytes = MAX_RESPONSE_BODY_BYTES,
): Promise<string | null> {
  if (!response.body) {
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let collected = "";
  let totalBytes = 0;

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }

      const remaining = maxBytes - totalBytes;
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      collected += decoder.decode(slice, { stream: true });
      totalBytes += slice.byteLength;

      if (value.byteLength >= remaining) {
        collected += "...[truncated]";
        await reader.cancel();
        break;
      }
    }
    collected += decoder.decode();
    return collected.length > 0 ? collected : null;
  } catch {
    return collected.length > 0 ? collected : null;
  }
}

/**
 * Determines whether an HTTP status code represents a transient failure
 * worth retrying with exponential backoff.
 */
function isRetryableHttpStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export class WebhookDeliveryService {
  constructor(
    private readonly repo: WebhookRepository = webhookRepository,
    private readonly circuitBreakerThreshold: number = DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
  ) {}

  /**
   * Executes a single outbound webhook delivery attempt:
   * 1. Fetches fresh subscription state (honors mid-retry deletions, pauses, or secret rotations).
   * 2. Runs DNS-rebinding SSRF checks in production.
   * 3. Signs the exact raw JSON body with HMAC-SHA256 (`t=...,v1=...`).
   * 4. Sends HTTP POST with 5s timeout and `redirect: "manual"`.
   * 5. Records attempt in `webhook_deliveries` and updates circuit breaker state.
   */
  async deliver(
    jobPayload: WebhookDeliveryPayload,
    attemptNumber: number,
    maxAttempts: number,
  ): Promise<void> {
    const subscription = await this.repo.findById(jobPayload.tenantId, jobPayload.subscriptionId);

    if (!subscription) {
      logger.warn(
        {
          deliveryId: jobPayload.deliveryId,
          subscriptionId: jobPayload.subscriptionId,
        },
        "Skipping webhook delivery: subscription no longer exists",
      );
      return;
    }

    if (!subscription.is_active) {
      logger.warn(
        {
          deliveryId: jobPayload.deliveryId,
          subscriptionId: jobPayload.subscriptionId,
        },
        "Skipping webhook delivery: subscription is inactive (paused or circuit-broken)",
      );
      return;
    }

    const rawBody = JSON.stringify(jobPayload.payload);
    const signed = signWebhookPayload(rawBody, subscription.secret);

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "SaaS-API-Webhooks/1.0",
      "X-Webhook-Event": jobPayload.event,
      "X-Webhook-Delivery": jobPayload.deliveryId,
      "X-Webhook-Signature": signed.header,
    };

    const startTime = performance.now();
    let responseStatus: number | null = null;
    let responseBody: string | null = null;
    let errorMessage: string | null = null;
    let isPermanentFailure = false;

    try {
      await assertPublicDestination(subscription.url);

      const response = await fetch(subscription.url, {
        method: "POST",
        headers: requestHeaders,
        body: rawBody,
        redirect: "manual", // Prevent 302 redirect SSRF bypasses
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      responseStatus = response.status;
      responseBody = await readTruncatedResponseBody(response);

      if (response.ok) {
        const durationMs = Math.round(performance.now() - startTime);

        await this.repo.recordDelivery(jobPayload.tenantId, {
          id: uuidv7(),
          subscriptionId: subscription.id,
          event: jobPayload.event,
          payload: jobPayload.payload,
          requestHeaders,
          responseStatus,
          responseBody,
          errorMessage: null,
          durationMs,
          attemptNumber,
        });

        await this.repo.recordDeliverySuccess(jobPayload.tenantId, subscription.id);

        logger.info(
          {
            deliveryId: jobPayload.deliveryId,
            subscriptionId: subscription.id,
            status: responseStatus,
            durationMs,
            attemptNumber,
          },
          "Webhook delivered successfully",
        );
        return;
      }

      if (responseStatus >= 300 && responseStatus < 400) {
        errorMessage = `Webhook endpoint returned redirect status ${responseStatus} (redirects are disallowed)`;
        isPermanentFailure = true;
      } else if (!isRetryableHttpStatus(responseStatus)) {
        errorMessage = `Webhook endpoint rejected payload with non-retryable HTTP ${responseStatus}`;
        isPermanentFailure = true;
      } else {
        errorMessage = `Webhook endpoint failed with HTTP ${responseStatus}`;
      }
    } catch (err) {
      if (err instanceof UnrecoverableError) {
        isPermanentFailure = true;
        errorMessage = err.message;
      } else if (err instanceof Error) {
        errorMessage =
          err.name === "TimeoutError"
            ? `Webhook delivery timed out after ${DELIVERY_TIMEOUT_MS}ms`
            : err.message;
      } else {
        errorMessage = "Unknown network error during webhook delivery";
      }
    }

    // Failure path: record attempt audit log
    const durationMs = Math.round(performance.now() - startTime);

    await this.repo.recordDelivery(jobPayload.tenantId, {
      id: uuidv7(),
      subscriptionId: subscription.id,
      event: jobPayload.event,
      payload: jobPayload.payload,
      requestHeaders,
      responseStatus,
      responseBody,
      errorMessage,
      durationMs,
      attemptNumber,
    });

    const isFinalAttempt = attemptNumber >= maxAttempts;

    // Increment circuit breaker only once per exhausted event delivery (or permanent failure)
    if (isPermanentFailure || isFinalAttempt) {
      const updated = await this.repo.recordDeliveryFailure(
        jobPayload.tenantId,
        subscription.id,
        this.circuitBreakerThreshold,
      );

      if (updated && !updated.is_active) {
        logger.error(
          {
            subscriptionId: subscription.id,
            tenantId: jobPayload.tenantId,
            consecutiveFailures: updated.consecutive_failures,
            threshold: this.circuitBreakerThreshold,
          },
          "Circuit breaker TRIPPED: webhook subscription automatically deactivated",
        );
      }
    }

    if (isPermanentFailure) {
      throw new UnrecoverableError(errorMessage ?? "Permanent webhook failure");
    }

    throw new Error(errorMessage ?? "Webhook delivery failed");
  }
}

export const webhookDeliveryService = new WebhookDeliveryService();
