import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { query } from "../config/database";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "../lib/apiError";
import { getRequestContext } from "../lib/context";
import { TenantRole } from "../types/express";

const uuidSchema = z.string().uuid("Invalid Tenant ID format. Must be a valid UUID.");

// Role hierarchy rank: higher index = higher privilege
const ROLE_HIERARCHY: Record<TenantRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  ADMIN: 3,
  OWNER: 4,
};

interface TenantMemberRow {
  role: TenantRole;
}

/**
 * Validates that the request contains a valid X-Tenant-ID header
 * and that the authenticated user is an active member of that tenant.
 */
export async function requireTenant(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError(
        "Authentication required before tenant resolution",
        "AUTH_REQUIRED",
      );
    }

    const tenantHeader = req.headers["x-tenant-id"];
    const rawTenantId = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;

    if (!rawTenantId) {
      throw new BadRequestError("Missing required 'X-Tenant-ID' header", "MISSING_TENANT_HEADER");
    }

    const parseResult = uuidSchema.safeParse(rawTenantId);
    if (!parseResult.success) {
      throw new BadRequestError(
        parseResult.error.errors[0]?.message ?? "Invalid Tenant ID",
        "INVALID_TENANT_ID",
      );
    }

    const tenantId = parseResult.data;

    const result = await query<TenantMemberRow>(
      `SELECT role FROM tenant_members WHERE tenant_id = $1 AND user_id = $2 LIMIT 1`,
      [tenantId, req.user.id],
    );

    const member = result.rows[0];
    if (!member) {
      throw new ForbiddenError(
        "You are not a member of this workspace or tenant does not exist",
        "TENANT_ACCESS_DENIED",
      );
    }

    req.tenant = {
      id: tenantId,
      role: member.role,
    };

    const store = getRequestContext();
    if (store) {
      store.tenantId = tenantId;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Enforces role-based access control within the resolved tenant.
 * Can accept minimum required role (hierarchical) or a list of explicitly allowed roles.
 *
 * @param minimumRole Lowest role allowed to perform the action (e.g. "MEMBER" allows MEMBER, ADMIN, OWNER)
 */
export function requireRole(minimumRole: TenantRole) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      throw new ForbiddenError(
        "Tenant context required before evaluating role permissions",
        "TENANT_CONTEXT_REQUIRED",
      );
    }

    const userRoleRank = ROLE_HIERARCHY[req.tenant.role];
    const requiredRoleRank = ROLE_HIERARCHY[minimumRole];

    if (userRoleRank < requiredRoleRank) {
      throw new ForbiddenError(
        `Insufficient permissions. Requires minimum role of '${minimumRole}', but your role is '${req.tenant.role}'`,
        "INSUFFICIENT_PERMISSIONS",
      );
    }

    next();
  };
}
