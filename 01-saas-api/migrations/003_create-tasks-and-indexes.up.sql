-- 1. Tasks Table (Tenant-Scoped with Optimistic Locking & Generated TSVECTOR)
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number INT NOT NULL, -- Sequence per project (e.g. 1 for CORE-1, 2 for CORE-2)
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'TODO' 
        CHECK (status IN ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED')),
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' 
        CHECK (priority IN ('URGENT', 'HIGH', 'MEDIUM', 'LOW')),
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    version INT NOT NULL DEFAULT 1, -- For Optimistic Concurrency Control
    tsv_search TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(description, ''))
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, project_id, number)
);

-- 2. Indexes for Keyset Pagination, Filtering & Search
-- Composite B-tree for O(1) Keyset (cursor) pagination
CREATE INDEX idx_tasks_tenant_created ON tasks (tenant_id, created_at DESC, id DESC);

-- Composite index for fast status & priority filtering
CREATE INDEX idx_tasks_tenant_status ON tasks (tenant_id, status, priority);

-- Composite index for resolving project-scoped task list and next task number
CREATE INDEX idx_tasks_project_number ON tasks (project_id, number DESC);

-- GIN Inverted Index for Full-Text Search
CREATE INDEX idx_tasks_tsv_search ON tasks USING GIN (tsv_search);

-- GIN Trigram index for typo-tolerant title autocomplete (using pg_trgm from migration 002)
CREATE INDEX idx_tasks_title_trgm ON tasks USING GIN (title gin_trgm_ops);

-- 3. Row-Level Security on Tasks
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON tasks
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);