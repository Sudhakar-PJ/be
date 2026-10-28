export type TenantRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface TenantContext {
  id: string;
  role: TenantRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      tenant: TenantContext;
    }
  }
}
