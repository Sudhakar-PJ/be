-- 1. Labels Table (Tenant-Scoped Tags for Task Categorization)
CREATE TABLE labels (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#6B7280', -- Hex color code (e.g. #EF4444)
    description VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, name)
);

-- Index for listing tenant labels
CREATE INDEX idx_labels_tenant ON labels (tenant_id);

-- Row-Level Security on Labels
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE labels FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON labels
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);


-- 2. Task Labels (Many-to-Many Junction Table with Tenant RLS)
CREATE TABLE task_labels (
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, label_id)
);

-- Indexes for resolving both directions of the M:N relationship
CREATE INDEX idx_task_labels_label ON task_labels (tenant_id, label_id);
CREATE INDEX idx_task_labels_task ON task_labels (tenant_id, task_id);

-- Row-Level Security on Task Labels
ALTER TABLE task_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_labels FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON task_labels
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);


-- 3. Comments Table (Task Discussions & Activity Threading)
CREATE TABLE comments (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Composite index for chronological task comment stream
CREATE INDEX idx_comments_task_created ON comments (tenant_id, task_id, created_at ASC);

-- Row-Level Security on Comments
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON comments
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);