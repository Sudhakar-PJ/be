-- 1. Personal Access Tokens (PATs / API Keys)
CREATE TABLE personal_access_tokens (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    token_preview VARCHAR(16) NOT NULL,
    scopes TEXT[] NOT NULL DEFAULT '{}',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for resolving user tokens within a tenant
CREATE INDEX idx_pats_tenant_user ON personal_access_tokens (tenant_id, user_id, created_at DESC);

-- Row-Level Security on Personal Access Tokens
ALTER TABLE personal_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_access_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON personal_access_tokens
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);


-- 2. Webhook Subscriptions (Tenant-Scoped Event Destinations)
CREATE TABLE webhook_subscriptions (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    url VARCHAR(2048) NOT NULL,
    secret VARCHAR(64) NOT NULL,
    events TEXT[] NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    consecutive_failures INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for querying active webhook subscriptions for a tenant
CREATE INDEX idx_webhooks_tenant_active ON webhook_subscriptions (tenant_id, is_active);

-- GIN index for fast array containment lookup (e.g. events @> ARRAY['task.created'])
CREATE INDEX idx_webhooks_events_gin ON webhook_subscriptions USING GIN (events);

-- Row-Level Security on Webhook Subscriptions
ALTER TABLE webhook_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_subscriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON webhook_subscriptions
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);


-- 3. Webhook Deliveries (Delivery Audit Log & Attempt History)
CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
    event VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    request_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_status INT,
    response_body TEXT,
    error_message TEXT,
    duration_ms INT NOT NULL DEFAULT 0,
    attempt_number INT NOT NULL DEFAULT 1,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Composite indexes for time-series inspection of delivery logs
CREATE INDEX idx_webhook_deliveries_sub ON webhook_deliveries (subscription_id, delivered_at DESC);
CREATE INDEX idx_webhook_deliveries_tenant ON webhook_deliveries (tenant_id, delivered_at DESC);

-- Row-Level Security on Webhook Deliveries
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON webhook_deliveries
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);