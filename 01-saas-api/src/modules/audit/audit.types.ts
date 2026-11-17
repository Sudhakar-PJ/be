export type AuditActorType = "user" | "pat" | "system";

export interface AuditLogRecord {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  actor_type: AuditActorType;
  action: string;
  resource_type: string;
  resource_id: string | null;
  payload: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  previous_hash: string;
  current_hash: string;
  created_at: Date;
}

export interface CreateAuditLogInput {
  tenantId: string;
  actorId?: string | null;
  actorType?: AuditActorType;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditVerificationResult {
  isValid: boolean;
  totalEntries: number;
  tamperedIndex?: number;
  tamperedLogId?: string;
  reason?: string;
  expectedHash?: string;
  actualHash?: string;
}
