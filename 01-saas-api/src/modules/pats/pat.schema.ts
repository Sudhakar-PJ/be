import { z } from "zod";
import { VALID_PAT_SCOPES, PatScope } from "../../lib/pat";

/**
 * Zod enum reflecting all platform-supported scopes.
 */
export const patScopeSchema = z.enum(
  VALID_PAT_SCOPES as unknown as[PatScope, ...PatScope[]],
  {
    errorMap: () => ({
      message: `Invalid scope. Allowed scopes: ${VALID_PAT_SCOPES.join(", ")}`,
    }),
  },
);

/**
 * Request payload for creating a new Personal Access Token.
 */
export const createPatSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Token name is required")
    .max(100, "Token name must not exceed 100 characters"),
  scopes: z
    .array(patScopeSchema)
    .min(1, "At least one scope must be granted to the token")
    .refine((scopes) => new Set(scopes).size === scopes.length, {
      message: "Duplicate scopes are not allowed",
    }),
  expiresAt: z
    .string()
    .datetime({ message: "expiresAt must be a valid ISO 8601 UTC timestamp string" })
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true;
        return new Date(val).getTime() > Date.now();
      },
      { message: "Token expiration must be in the future" },
    ),
});

export type CreatePatInput = z.infer<typeof createPatSchema>;

/**
 * URL Param schema for PAT ID validation.
 */
export const patIdParamSchema = z.object({
  id: z.string().uuid("Invalid PAT ID format. Must be a valid UUID v7 / v4."),
});

export type PatIdParam = z.infer<typeof patIdParamSchema>;

/**
 * Public metadata DTO for listing or inspecting tokens.
 * Zero-knowledge: plaintext token and SHA-256 hash are strictly excluded.
 */
export interface PatSummaryResponse {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  tokenPreview: string;
  scopes: PatScope[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/**
 * Sensitive creation DTO returned exactly once when minted.
 */
export interface PatCreatedResponse extends PatSummaryResponse {
  rawToken: string;
}