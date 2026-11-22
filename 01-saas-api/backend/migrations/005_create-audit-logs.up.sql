-- 1. Create the Audit Logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_type VARCHAR(20) NOT NULL DEFAULT 'user', -- 'user', 'pat', 'system'
    action VARCHAR(100) NOT NULL,                    -- e.g. 'task.created', 'pat.revoked', 'project.deleted'
    resource_type VARCHAR(50) NOT NULL,             -- e.g. 'task', 'project', 'pat', 'webhook'
    resource_id VARCHAR(255),                       -- Target entity identifier
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,     -- Structured event payload
    ip_address VARCHAR(45),                         -- IPv4 or IPv6
    user_agent TEXT,
    previous_hash VARCHAR(64) NOT NULL,             -- SHA-256 hash of previous record (or 64 zeros for genesis)
    current_hash VARCHAR(64) NOT NULL,              -- SHA-256 hash of this record
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Indexes for tenant time-series and resource inspection
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs (tenant_id, resource_type, resource_id);

-- 3. Row-Level Security for Multi-Tenant Isolation
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON audit_logs
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);

-- 4. Database-level Immutability Trigger (Strict Append-Only)
-- Prevents UPDATE or DELETE queries even by database administrators
CREATE OR REPLACE FUNCTION prevent_audit_log_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are immutable and cannot be updated or deleted (table: audit_logs)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_tampering();