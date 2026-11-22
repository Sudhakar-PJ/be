export type TenantRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface TenantContext {
  id: string;
  role: TenantRole;
}

export interface AuthContext {
  type: "JWT" | "PAT";
  scopes: readonly string[];
  patId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenant?: TenantContext;
      auth?: AuthContext;
    }
  }
}
