# Project #1: Multi-Tenant SaaS Task & Project Management API

> **Role in Series:** The Foundation. Every subsequent project reuses the patterns, conventions, and architectural boundaries established here.  
> **Domain Analogy:** A production-grade backend for Linear, Jira, or Asana.  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
In standard multi-tenant applications, companies often make one of two catastrophic mistakes:
1. **Siloed Databases:** Spinning up a distinct PostgreSQL database per customer tenant. While isolation is absolute, connection pool exhaustion, migration nightmares (running migrations across 10,000 DBs), and infrastructure idle costs quickly make this unviable.
2. **Naive Application-Level Filtering:** Storing all tenants in a shared database and appending `WHERE tenant_id = :tenant_id` to every application query. A single missed filter in a developer's query results in catastrophic cross-tenant data leaks.

### The Solution
A **Shared-Database, Shared-Schema** architecture enforced at the database engine level via **PostgreSQL Row-Level Security (RLS)**. The application connects to PostgreSQL using a restricted role and sets a transaction-scoped session variable (`SET LOCAL app.current_tenant = :tenantId`). Even if application code executes `SELECT * FROM tasks;`, PostgreSQL physically hides all rows belonging to other tenants.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | Multi-Tenancy via PostgreSQL RLS | Kernel-level data isolation. Eliminates human error in missing `WHERE tenant_id = ?`. | Database-per-tenant (cost/scale), App-level filtering (leak hazard). |
| **ADR-0002** | Asymmetric RS256 JWTs + Opaque Refresh Tokens | Fast stateless access token verification + revocable stateful sessions with family-based reuse detection. | Pure session cookies (scales poorly across services), symmetric HS256 (shared secret risk). |
| **ADR-0003** | Argon2id for Passwords, SHA-256 for Opaque Tokens | Argon2id is memory-hard and GPU-resistant (RFC 9106). High-entropy tokens use fast SHA-256 hashes. | bcrypt (older, 72-byte truncation limit, lacks memory hardness). |
| **ADR-0004** | Raw `pg` Driver + Raw SQL Migrations | Full control over query plans, indexes, connection pools, and PostgreSQL-specific features (RLS, GIN). | Prisma/TypeORM/Drizzle (abstract away query execution and hinder advanced SQL mastery). |
| **ADR-0005** | Structured Logging with Pino + AsyncLocalStorage | Zero-overhead JSON logging with correlation IDs propagated automatically across asynchronous call stacks. | Winston (slower), manual `correlationId` argument drilling through every function. |
| **ADR-0006** | UUID v7 Primary Keys | Time-ordered 128-bit UUIDs maintain B-Tree index locality (avoiding random I/O page splits of UUID v4). | Auto-incrementing integers (enumerable/leak size), UUID v4 (heavy index fragmentation). |
| **ADR-0007** | RFC 9457 Problem Details for Error Responses | Industry-standard error shape (`application/problem+json`) with machine-readable codes and field errors. | Custom inconsistent ad-hoc JSON error structures. |
| **ADR-0008** | Cursor-Based Keyset Pagination | $O(1)$ constant time pagination using row-value comparisons `(created_at, id) < (:cursor_created_at, :cursor_id)`. | `OFFSET / LIMIT` ($O(N)$ sequential scan that degrades severely on deep pages). |

---

## 3. Back-of-the-Envelope Capacity Planning

| Metric | Target | Derived Math & Constraints |
|---|---|---|
| **Active Tenants** | 5,000 Organizations | Average 20 users per tenant = 100,000 Total Active Users. |
| **Daily Active Users (DAU)** | 30,000 Users | 30% DAU/MAU ratio. |
| **Read/Write Ratio** | 10 : 1 | Read-heavy (viewing boards, checking task status, loading comments). |
| **Average Read QPS** | ~350 QPS (Peak: 1,500 QPS) | 30,000 users * 100 read requests / 86,400s ≈ 35 QPS base; 10x peak multiplier. |
| **Average Write QPS** | ~35 QPS (Peak: 150 QPS) | 30,000 users * 10 writes / 86,400s ≈ 3.5 QPS base; 10x peak multiplier. |
| **PostgreSQL Pool Sizing** | 20–30 Connections | Based on Little's Law: $Connections = QPS \times Latency$. At 1,500 peak QPS with 10ms query time, 15 connections suffice. |
| **Database Storage / Year** | ~45 GB / Year | 300,000 tasks/month * 1 KB/row + comments + audit log. Easily handled by a single Postgres node. |

---

## 4. System Architecture & Request Lifecycle

```
[Client (Web/CLI/Postman)]
       │ (HTTPS / Bearer JWT / X-Tenant-ID / Idempotency-Key)
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Express HTTP Server (Port 3000)                                        │
│                                                                        │
│  1. Correlation Middleware (AsyncLocalStorage assigns X-Correlation-ID)│
│  2. Security Headers (Helmet, CORS, HPP)                               │
│  3. Rate Limiter (Redis Lua Token Bucket per IP / User)                │
│  4. Body Parser & Zod Validation Middleware                            │
│  5. Authentication Guard (Verifies RS256 JWT, checks Redis denylist)   │
│  6. Tenant Context Middleware (Extracts & verifies tenant membership)   │
│                                                                        │
│  ┌─────────────────────── Module Boundary ──────────────────────────┐  │
│  │ Route ──► Controller ──► Service (Transactions & Business Logic) │  │
│  │                              │                                   │  │
│  │                              ▼                                   │  │
│  │                   Repository (Raw SQL)                           │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────────┼──────────────────────────────────────┘
                                  │
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
┌───────────────────────────────────┐    ┌─────────────────────────────────┐
│ PostgreSQL (Neon / Local)         │    │ Redis (Upstash / Local)         │
│  • BEGIN;                         │    │  • Ephemeral Token Denylist     │
│  • SET LOCAL app.current_tenant;  │    │  • Distributed Rate Limits      │
│  • Execute Queries (RLS Enforced) │    │  • Idempotency Cache (24h TTL)  │
│  • COMMIT;                        │    │  • BullMQ Queue Job Store       │
└───────────────────────────────────┘    └────────────────┬────────────────┘
                                                          │
                                         ┌────────────────▼────────────────┐
                                         │ Background Worker Process       │
                                         │  • Outbound Webhooks (HMAC-256) │
                                         │  • Transactional Emails (Brevo) │
                                         │  • Dead Letter Queue & Retries  │
                                         └─────────────────────────────────┘
```

---

## 5. Relational Data Model & Schema Design

### Core Invariants
1. All tenant-owned tables (`projects`, `tasks`, `comments`, `labels`) **must** include `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
2. All tenant tables **must** have `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`.
3. All primary keys use **UUID v7** (ordered by millisecond timestamp).

```sql
-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. Organizations / Tenants
CREATE TABLE tenants (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Users (Global entity, not tenant-scoped)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tenant Memberships & RBAC
CREATE TABLE tenant_members (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, user_id)
);

-- 5. Projects (Tenant-Scoped)
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    key VARCHAR(10) NOT NULL, -- e.g. "ENG", "PROD"
    description TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, key)
);

-- 6. Tasks (Tenant-Scoped with Full-Text Search Vector)
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    number INT NOT NULL, -- Sequence per project (ENG-1, ENG-2)
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'TODO' CHECK (status IN ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELED')),
    priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('URGENT', 'HIGH', 'MEDIUM', 'LOW')),
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    version INT NOT NULL DEFAULT 1, -- For Optimistic Locking
    tsv_search TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, project_id, number)
);

-- 7. Audit Log (Append-Only Hash-Chained Security Log)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    old_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### PostgreSQL Row-Level Security (RLS) Setup
```sql
-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (prevents accidental bypass)
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

-- Define Policies using transaction session variable
CREATE POLICY tenant_isolation_policy ON projects
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);

CREATE POLICY tenant_isolation_policy ON tasks
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);

CREATE POLICY tenant_isolation_policy ON audit_logs
    FOR ALL
    USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::UUID);
```

### Indexing Strategy
```sql
-- 1. Keyset pagination index on tasks
CREATE INDEX idx_tasks_tenant_created ON tasks (tenant_id, created_at DESC, id DESC);

-- 2. Status filtering composite index
CREATE INDEX idx_tasks_tenant_status ON tasks (tenant_id, status, priority);

-- 3. GIN Full-Text Search index
CREATE INDEX idx_tasks_tsv_search ON tasks USING GIN (tsv_search);

-- 4. Fuzzy Trigram search index for quick title lookups
CREATE INDEX idx_tasks_title_trgm ON tasks USING GIN (title gin_trgm_ops);

-- 5. Audit log time-series lookup
CREATE INDEX idx_audit_tenant_created ON audit_logs (tenant_id, created_at DESC);
```

---

## 6. Authentication & Security Engine

### Token Architecture
* **Access Token:** Asymmetric RS256 JWT signed with private RSA key. Contains `{ sub: userId, email: user.email }`. Verified statelessly by the API gateway using public JWKS. 15-minute lifespan.
* **Refresh Token:** Cryptographically secure 256-bit opaque string stored as a SHA-256 hash in PostgreSQL. 30-day lifespan.
* **Refresh Token Rotation & Family Reuse Detection:**
  * When a refresh token is exchanged, it is immediately invalidated and a new child token is issued.
  * If a stolen/old token is presented again, the backend detects a **Replay Attack**, invalidates the entire token family, and terminates all active sessions for that user across all devices.

### Ephemeral Security Store (Redis)
* **Access Token Denylist:** When a user logs out, the JWT `jti` is stored in Redis with a TTL equal to the token's remaining lifespan. Fast $O(1)$ check during request validation.
* **Rate Limiting:** Sliding Window Counter implemented via atomic Redis Lua script keyed by `ip:<address>` for public routes and `user:<id>` for authenticated routes.

---

## 7. The 6 Implementation Milestones

```
Milestone 1: Foundation, Auth & User Management
├── Project skeleton & TypeScript strict configuration
├── Zod environment validation (strict parse on boot)
├── Database pool (`pg`) & Redis client (`ioredis`) setup
├── Centralized RFC 9457 ApiError hierarchy & AsyncLocalStorage correlation
├── Migrations 001–003 (users, sessions, password reset tokens)
├── Argon2id password hashing + RS256 JWT auth service
├── Refresh token family rotation & reuse detection
└── Health check endpoints (`/health` liveness, `/ready` readiness)

Milestone 2: Multi-Tenancy & Row-Level Security
├── Migrations 004–006 (tenants, tenant_members, projects)
├── PostgreSQL RLS setup & policy configuration
├── Tenant Context Middleware (`X-Tenant-ID` parsing + membership check)
├── Scoped transaction helper: `withTenantTransaction(tenantId, callback)`
├── RBAC permissions matrix middleware (OWNER, ADMIN, MEMBER, VIEWER)
└── Adversarial test suite: Proving cross-tenant data leaks return 404/Empty

Milestone 3: Task Engine, Keyset Pagination & Search
├── Migrations 007–008 (tasks, labels, comments)
├── Cursor-based keyset pagination implementation
├── Optimistic locking concurrency control (version column)
├── PostgreSQL Full-Text Search (`tsvector` + GIN) & Trigram fuzzy matching
└── Idempotency middleware via Redis (preventing duplicate task creations)

Milestone 4: Asynchronous Processing & Background Jobs
├── BullMQ queue configuration with Redis connection
├── Dedicated background worker process
├── Transactional email provider abstraction (Brevo / Console mock)
├── Retry policies: Exponential backoff with jitter
└── Dead Letter Queue (DLQ) inspection & alerting

Milestone 5: Developer Platform (PATs & Outbound Webhooks)
├── Personal Access Tokens (PATs) with SHA-256 hashing & granular scopes
├── Outbound webhook dispatcher with HMAC-SHA256 request signatures
├── Delivery attempt logs, backoff retries, and automated endpoint disabling
└── Hash-chained audit logging service

Milestone 6: Production Hardening, Performance & Observability
├── OpenTelemetry SDK integration (automatic traces & custom spans)
├── Prometheus RED metrics instrumentation (Rate, Errors, Duration)
├── Grafana Cloud dashboard & alert configuration
├── `EXPLAIN (ANALYZE, BUFFERS)` query plan optimization sweep
└── Load testing with k6 (1,500 concurrent QPS simulation)
```

---

## 8. Failure Modes & Adversarial Verification Labs

To ensure you have mastered this material, every milestone ends with an adversarial verification script:

1. **The RLS Bypass Attempt:** Write an integration test where Tenant A tries to read, update, or delete Tenant B's tasks by guessing the UUID. Assert that PostgreSQL returns 0 updated rows and throws no unhandled errors.
2. **The Refresh Token Replay Attack:** Simulate an attacker intercepting an already-used refresh token. Verify that the server detects reuse, revokes all tokens in the family, and writes a security alert to the audit log.
3. **The Concurrent Double-Submit Attack:** Use `k6` to fire 50 identical `POST /api/v1/tasks` requests with the same `Idempotency-Key` within 10 milliseconds. Prove that exactly 1 task is created in PostgreSQL and all 50 requests receive identical responses.
4. **Database Connection Starvation:** Simulate 2,000 concurrent requests with a Postgres pool size capped at 10. Verify that requests queue cleanly without leaking connections or crashing the Node.js event loop.
