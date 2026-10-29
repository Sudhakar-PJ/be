import { BadRequestError } from "./apiError";

export interface CursorPayload {
  createdAt: string; // ISO 8601 string
  id: string; // UUID tie-breaker
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  pageInfo: PageInfo;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Encodes a (createdAt, id) tuple into a URL-safe Base64 opaque cursor.
 */
export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Decodes a URL-safe Base64 string back into a verified (createdAt, id) tuple.
 * Throws BadRequestError if the cursor is malformed or tampered with.
 */
export function decodeCursor(cursor: string): CursorPayload {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.id !== "string" ||
      isNaN(Date.parse(parsed.createdAt))
    ) {
      throw new Error("Invalid cursor structure");
    }

    return {
      createdAt: parsed.createdAt,
      id: parsed.id,
    };
  } catch {
    throw new BadRequestError(
      "Invalid or corrupted pagination cursor",
      "INVALID_PAGINATION_CURSOR",
    );
  }
}

/**
 * Normalizes user-requested limit to enforce boundaries [1, MAX_PAGE_SIZE].
 */
export function normalizeLimit(rawLimit?: unknown): number {
  if (rawLimit === undefined || rawLimit === null || rawLimit === "") {
    return DEFAULT_PAGE_SIZE;
  }

  const parsed = Number(rawLimit);
  if (isNaN(parsed) || parsed < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.floor(parsed), MAX_PAGE_SIZE);
}

/**
 * Generic helper that applies the LIMIT + 1 logic to any database result set.
 * Extracts items, determines hasNextPage, and builds the next endCursor.
 */
export function buildPaginatedResult<T extends { createdAt: string; id: string }>(
  rawRows: T[],
  requestedLimit: number,
): PaginatedResult<T> {
  const hasNextPage = rawRows.length > requestedLimit;
  const items = hasNextPage ? rawRows.slice(0, requestedLimit) : rawRows;

  const lastItem = items[items.length - 1];
  const endCursor = lastItem
    ? encodeCursor({ createdAt: lastItem.createdAt, id: lastItem.id })
    : null;

  return {
    items,
    pageInfo: {
      hasNextPage,
      endCursor,
    },
  };
}
