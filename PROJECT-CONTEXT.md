# Master Context & Engineering Log: 10-Project Senior Backend Series

> **Purpose:** Central living reference and handoff document. Any developer or AI assistant working in this workspace must read this document first before giving any guidance or suggestions.  
> **Learner:** PJ Sudhakar  
> **Status:** Project #1 (Multi-Tenant SaaS API) — Core Infrastructure Complete (57/57 Tests, Full LGTM Stack).  
> **CURRENT ACTIVE PREREQUISITE:** **Milestone 5.6 (Pre-Sprint Security, Concurrency & RLS Audit Remediation)** detailed below and in Phase 0 of [SAAS-ENTERPRISE-ROADMAP.md](file:///mnt/recovery/be/SAAS-ENTERPRISE-ROADMAP.md). Must be 100% completed before Sprint 1 begins.  
> **Last Updated:** 2026-11-23

> [!IMPORTANT]
> **DOCUMENT HIERARCHY & INGESTION DIRECTIVE FOR AI ASSISTANTS:**
> 1. `PROJECT-CONTEXT.md` (THIS FILE) is the **Master Operational Anchor**: It defines the 10-Project Series roadmap, the immutable Operating Rules (PJ codes everything himself, zero ORMs, extreme pedagogical depth, deep systems architecture), and historical engineering progress.
> 2. [SAAS-ENTERPRISE-ROADMAP.md](file:///mnt/recovery/be/SAAS-ENTERPRISE-ROADMAP.md) is the **Active Sprint Execution Engine**: It contains the granular, step-by-step checklist, database schemas, REST endpoints, and architectural requirements.
> 3. **Mandatory AI Action:** Whenever a session starts or context is provided, the AI assistant **MUST start with Phase 0 / Milestone 5.6 (Audit Remediation & Hardening)** in `SAAS-ENTERPRISE-ROADMAP.md` before advancing to Sprint 1. Do not skip to Sprint 1 while these 7 vulnerabilities remain open.

---

## 1. Critical Operating Rules for AI Assistants

### Rule 1: PJ Codes Everything Himself (Applies to Backend & Frontend)

- **The AI must NEVER directly write, modify, or generate project implementation files** (across both `01-saas-api/backend/` and `01-saas-api/frontend/`). Rule 1 is strictly binding across the entire full stack per Option A.
- **The AI's role is strictly as a senior mentor, tutor, and staff architect (strictly adhering to [skills/tutor/SKILL.md](file:///mnt/recovery/be/skills/tutor/SKILL.md)):**
  1. Teach the underlying theory, CSS/Tailwind mechanics, database structures, and architectural patterns deeply.
  2. Explain the architectural _why_ and evaluate trade-offs before showing any code.
  3. Provide exact terminal commands (e.g. `npm install ...`, `mkdir ...`) and complete, production-grade code snippets directly inside the chat interface.
  4. Wait for PJ to create, type, review, and test each file before advancing.
- **The ONLY files the AI is authorized to create/update directly** are documentation and skill files in root or `skills/` (specifically `PROJECT-CONTEXT.md`, `SAAS-ENTERPRISE-ROADMAP.md`, and workspace skills).

### Rule 2: No ORMs & No Hand-Wavy Shortcuts

- **Zero ORMs:** We use raw SQL drivers (`pg` for PostgreSQL, `ioredis` for Redis, ClickHouse client, etc.). The goal is genuine mastery of relational algebra, execution plans (`EXPLAIN ANALYZE`), lock modes, and connection pool dynamics.
- **Production-Grade from Day One:** Strict TypeScript (all strict compiler flags enabled), strict runtime validation (`zod`), RFC 9457 Problem Details for all error responses, and structured logging (`pino`) with `AsyncLocalStorage` correlation IDs. No `console.log` in backend code.
- **No Code Without Design:** Each module begins with an understanding of the domain requirements, database schemas, and failure modes before any implementation begins.

### Rule 3: Extreme Pedagogical Depth & Real-World Framing (Staff Architect Mentorship)

- **Novice-Friendly, Exhaustive Explanations:** PJ is venturing into unknown territory with advanced backend concepts (cryptographic token structures, granular permission scopes, dual-authentication cascades, outbound webhook signing, delivery worker pipelines, circuit breakers, etc.).
- **Teach Concepts Thoroughly Before Showing Code:**
  1. Break down every concept from first principles using **concrete real-world analogies** and industry benchmarks (e.g. Stripe, GitHub, AWS, Slack, Linear) that match our exact situation.
  2. Explain *why* something is designed the way it is, what security or performance hazards it avoids, and what catastrophic bugs would occur if done naively.
  3. Walk through the code thoroughly: explain what each TypeScript type, cryptographic primitive, SQL clause, or architectural boundary does so PJ builds deep intuition and confidence.

### Rule 4: Deep Architectural Design & First-Principles Grounding

- **Architecture Before Implementation:** Before writing database migrations or application code, we thoroughly reason through the domain model, state transitions, edge cases, failure modes, and security implications in chat.
- **Hands-On Code Mastery:** All focus is on building deep intuition for raw SQL, connection pooling, Redis caching, async queues, and strict TypeScript patterns. Diagramming is decoupled and deferred for separate study.

---

## 2. Workspace Directory Layout

```
c:\Users\DMC\Desktop\be\
├── PROJECT-CONTEXT.md            # THIS FILE: Current status, AI instructions & progress log
├── SAAS-ENTERPRISE-ROADMAP.md    # PRIMARY ACTIVE SPEC: Jira/Linear-grade enterprise sprint breakdown
├── skills\                       # Workspace-scoped AI skills (security, frontend, auditing)
├── docs\                         # Comprehensive specifications for all 10 projects
│   ├── 00-master-roadmap.md
│   ├── 01-project-saas-api.md
│   ├── 02-project-realtime-collaborative-editor.md
│   ├── 03-project-ecommerce-payments-ledger.md
│   ├── 04-project-video-streaming-platform.md
│   ├── 05-project-search-recommendation-engine.md
│   ├── 06-project-geo-location-dispatch.md
│   ├── 07-project-microservices-logistics.md
│   ├── 08-project-analytics-data-platform.md
│   ├── 09-project-api-gateway-bff.md
│   └── 10-project-cicd-reliability-engineering.md
└── 01-saas-api\                  # Project #1 root directory (Multi-Tenant SaaS Full-Stack Monorepo)
    ├── docker-compose.yml        # Orchestrates Backend, Frontend, and LGTM Observability Stack
    ├── frontend\                 # Frontend application workspace (to be implemented)
    └── backend\                  # Backend application source code and migrations
        ├── dist\
        ├── docker\               # Prometheus, Tempo, Loki, Grafana provisioning configs
        ├── Dockerfile
        ├── migrations\           # SQL-first raw database migrations (up/down)
        ├── src\                  # Application source code
        └── tests\                # Unit, integration, and adversarial tests
```

---

## 3. Project #1 (SaaS API) Core Architecture Standards

- **Runtime:** Node.js (v20+ / v22 LTS) with CommonJS modules.
- **Language:** TypeScript in strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- **HTTP Framework:** Express 4.
- **Data Stores:**
  - **PostgreSQL (Neon):** Durable relational state, Row-Level Security (RLS) multi-tenancy, raw `pg` client (`pg.Pool`), SQL migrations via `node-pg-migrate`.
  - **Redis (Upstash / Local):** Ephemeral security state (rate limit token buckets, token denylists, idempotency keys, BullMQ job queues).
- **Security & Auth:**
  - Password Hashing: Argon2id (`argon2`).
  - Access Tokens: RS256 Asymmetric JWTs (`jsonwebtoken`).
  - Refresh Tokens: Cryptographically secure 256-bit opaque tokens (SHA-256 hashed in Postgres) with family-based reuse detection.
- **Layering Pattern (Feature-Based):**
  - `Route` (thin, declares middleware and controller)
  - `Controller` (HTTP transport, request validation, response formatting)
  - `Service` (Business logic, transactions, domain invariants — no HTTP, no SQL)
  - `Repository` (Raw SQL, row mapping, RLS-aware queries — no business rules)

---

## 4. Current Status & Progress Tracker

### Current Active Project: **Project #1 (Multi-Tenant SaaS API)**

**Current Milestone:** **Milestone 6 — Production Hardening, Observability & Performance Profiling**

#### Milestone 1 Checklist: (100% Complete)

- [x] **Step 1:** Folder initialization (`01-saas-api`) & `package.json` setup with pinned dependencies.
- [x] **Step 2:** Strict TypeScript configuration (`tsconfig.json`, `tsconfig.build.json`).
- [x] **Step 3:** Code quality & formatting configuration (`eslint.config.mjs`, `.prettierrc`, `.editorconfig`).
- [x] **Step 4:** Environment configuration & schema validation (`src/config/env.ts` using Zod).
- [x] **Step 5:** Structured logging (`src/config/logger.ts`) with Pino & correlation context mixin.
- [x] **Step 6:** AsyncLocalStorage correlation middleware (`src/lib/context.ts`, `src/middleware/correlation.ts`, `src/middleware/request-logger.ts`).
- [x] **Step 7:** RFC 9457 Typed Error Hierarchy (`src/lib/apiError.ts`, `src/lib/asyncHandler.ts`, `src/middleware/errorHandler.ts`).
- [x] **Step 8:** Raw PostgreSQL Database Pool connection (`src/config/database.ts` with Neon SSL, query timing, withTransaction).
- [x] **Step 9:** Redis client setup (`src/config/redis.ts` with ioredis, retryStrategy, readiness check).
- [x] **Step 10:** Raw SQL Migrations setup (`node-pg-migrate`) & Migration 001 applied to Neon (`users`, `sessions` with family rotation, `auth_tokens`).
- [x] **Step 11:** Crypto Library (`src/lib/crypto.ts`: Argon2id hashing, RS256 JWT sign/verify, SHA-256 token hashing).
- [x] **Step 12:** Auth Module (Signup, Login, Token Refresh with Family Reuse Detection, Logout).
- [x] **Step 13:** Health check endpoints (`/health` liveness, `/ready` readiness) & Graceful Shutdown (Production Hardening).
- [x] **Step 14:** Adversarial Auth Testing with Vitest & Supertest.

#### Milestone 2 Checklist: (100% Complete)

- [x] **Step 1:** Deep-dive into PostgreSQL Row-Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` + `FORCE ROW LEVEL SECURITY`, `SET LOCAL`).
- [x] **Step 2:** Write Raw SQL Migration 002: Organizations (`tenants`), Memberships (`tenant_members` with composite PK & RBAC), and Projects (`projects` with RLS).
- [x] **Step 3:** Scoped Tenant Transaction Runner (`withTenantTransaction` in `src/config/database.ts`).
- [x] **Step 4:** Authentication & Tenancy Middleware (`authenticate`, `requireTenant`, `requireRole`).
- [x] **Step 5:** Projects Module Implementation (schemas, repository, service, controller, routes).
- [x] **Step 6:** Adversarial Integration Tests for Multi-Tenancy & Cross-Tenant Leakage Prevention.

#### Milestone 3 Checklist: (100% Complete)

- [x] **Step 1:** Migration 003: Tasks table, TSVECTOR full-text search, composite B-tree & GIN indexes, RLS policy.
- [x] **Step 2:** Redis Atomic Idempotency Middleware (`src/middleware/idempotency.ts`).
- [x] **Step 3:** Keyset / Cursor-Based Pagination Utility (`src/lib/pagination.ts`).
- [x] **Step 4:** Tasks Feature Module (Zod schemas, repository with keyset pagination & OCC, service, controller, routes).
- [x] **Step 5:** Adversarial Concurrency & Idempotency Integration Tests.

#### Milestone 4 Checklist: (100% Complete)

- [x] **Step 1:** Install BullMQ, establish Redis connection options & queue connection factory.
- [x] **Step 2:** Define typed job contracts, queues, and Zod payload validation (`src/jobs/contracts.ts`, `src/jobs/queues.ts`).
- [x] **Step 3:** Implement Transactional Email Service abstraction (`src/services/email.service.ts`).
- [x] **Step 4:** Implement dedicated background Worker process (`src/jobs/worker.ts`) with concurrency & graceful shutdown.
- [x] **Step 5:** Wire asynchronous job dispatching into Tasks & Auth modules (`task.service.ts`, `auth.service.ts`).
- [x] **Step 6:** Dead Letter Queue (DLQ) inspection, retry mechanism with backoff, and 3 automated integration tests.

#### Milestone 5 Checklist: (100% Complete)

- [x] **Step 1:** Raw SQL Migration 004: Personal Access Tokens (`personal_access_tokens`), Webhook Subscriptions (`webhook_subscriptions`), and Delivery logs (`webhook_deliveries`) with RLS.
- [x] **Step 2:** Cryptographic PAT generation, SHA-256 token hashing, token prefixing, and granular scopes definition (`src/lib/pat.ts`).
- [x] **Step 3:** Dual-Authentication Middleware & Scope Guard (`src/middleware/authenticate.ts` supporting both RS256 Bearer JWTs and hashed PATs, plus `requireScope` and `requireUserSession`).
- [x] **Step 4:** PAT Management Feature Module (Zod schemas, raw SQL repository with RLS, service with zero-knowledge minting & RBAC, controller, and routes mounted at `/api/v1/pats`).
- [x] **Step 5:** Webhook Subscriptions Feature Module (Repository with RLS, Service with CSPRNG secrets & SSRF guards, Controller, Routes with `ADMIN` and `webhooks:read`/`webhooks:write` scopes mounted at `/api/v1/webhooks`).
- [x] **Step 6:** Webhook Dispatcher, BullMQ Outbound Delivery Worker with HMAC-SHA256 signatures, exponential backoff, and circuit breaker.
- [x] **Step 7:** Adversarial Integration Tests for PAT Scopes, Webhook Signature Verification, and Circuit Breaker Deactivation (`tests/integration/pats-webhooks.test.ts`).

#### Milestone 5.5 Checklist: (100% Complete)

- [x] **Step 1:** Security Headers & Edge Hardening (`src/app.ts` — wire `helmet`, `cors` with `env.CORS_ORIGIN`, `hpp`, and `compression`).
- [x] **Step 2:** Atomic Redis Lua Sliding-Window Rate Limiter (`src/middleware/rate-limiter.ts` — `ip:<address>` on public auth routes, `user:<id>` on authenticated routes, `RateLimit-*` headers, `429` RFC 9457).
- [x] **Step 3:** JWT `jti` Access Token Denylist in Redis (`src/lib/crypto.ts`, `src/modules/auth/auth.service.ts`, `src/middleware/authenticate.ts` — revoke active access tokens on `/logout` with remaining-TTL expiration and $O(1)$ middleware verification).
- [x] **Step 4:** Tamper-Evident Hash-Chained Audit Logging Service (`migrations/005_create-audit-logs.up.sql`, `src/modules/audit/` — RLS-protected append-only `audit_logs` where each entry stores `SHA-256(previous_hash + payload)`, advisory locking via `pg_advisory_xact_lock`, DB immutability trigger, and verification routine).
- [x] **Step 5:** `labels`, `task_labels`, `comments` & `pg_trgm` Fuzzy Search (`migrations/006_create-labels-comments.up.sql` — many-to-many task labels, task comments with RLS, `pg_trgm` GIN trigram index + `word_similarity` fallback on `tasks.title` for typo-tolerant fuzzy search alongside `tsvector`).
- [x] **Step 6:** Adversarial Integration Tests (`tests/integration/security-audit.test.ts` — rate limiting `429`, immediate post-logout JWT revocation, hash-chain tamper detection, labels/comments CRUD, and `pg_trgm` fuzzy search).

#### Milestone 6 Checklist: Production Hardening, Observability & Performance (100% Complete)

```
MILESTONE 6 EXECUTION ORDER:
├── Stage 1: The Core Metrics Engine (@prometheus-io/client) (100% Complete)
│   ├── [x] 1.1: Install @prometheus-io/client (Uninstall prom-client)
│   ├── [x] 1.2: Build src/metrics/registry.ts (The central Prometheus Registry)
│   ├── [x] 1.3: Build src/metrics/http.metrics.ts (HTTP Counter & Duration Histogram)
│   ├── [x] 1.4: Build src/middleware/metrics.middleware.ts (Route-sanitizing Express middleware)
│   └── [x] 1.5: Mount /metrics in src/app.ts and test live with curl/browser
│
├── Stage 2: Subsystem & Domain Metrics (100% Complete)
│   ├── [x] 2.1: Database Pool & Query Metrics (src/metrics/database.metrics.ts)
│   ├── [x] 2.2: Redis & Rate Limiter Metrics (src/metrics/redis.metrics.ts)
│   ├── [x] 2.3: Security & Auth Metrics (src/metrics/auth.metrics.ts)
│   ├── [x] 2.4: SaaS Business Metrics (src/metrics/business.metrics.ts)
│   └── [x] 2.5: Queue & Async Email Metrics (src/metrics/queue.metrics.ts)
│
├── Stage 3: OpenTelemetry Distributed Tracing (100% Complete)
│   ├── [x] 3.1: Install OpenTelemetry SDK (@opentelemetry/sdk-node, auto-instrumentations)
│   ├── [x] 3.2: Build src/config/telemetry.ts (Auto-trace Express, PostgreSQL, Redis)
│   └── [x] 3.3: Wire Telemetry into server boot (src/index.ts)
│
├── Stage 4: Kubernetes Health Probes (100% Complete)
│   ├── [x] 4.1: Deep /api/v1/health/live (Liveness probe - event loop & process health)
│   └── [x] 4.2: Deep /api/v1/health/ready (Readiness probe - DB & Redis ping with timeouts)
│
├── Stage 5: Database Query Profiling Sweep (100% Complete)
│   └── [x] 5.1: Run EXPLAIN (ANALYZE, BUFFERS) on tasks keyset pagination & trigram search
│
├── Stage 6: The Docker Observability Stack (100% Complete)
│   ├── [x] 6.1: Multi-stage Dockerfile for our SaaS API (node:22-alpine, non-root)
│   └── [x] 6.2: docker-compose.yml running App + Prometheus + Grafana + Loki + Tempo
│
└── Stage 7: Automated k6 Load & Stress Testing (100% Complete)
    └── [x] 7.1: Write tests/load/k6-stress.js (Simulate 1,500 concurrent QPS, verify p95/p99)
```

---

## 5. Completed Implementation Inventory

| File                                                  | Purpose / Architectural Standard                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                        | Pinned production & dev dependencies (no ORMs, raw `pg`, `ioredis`, `argon2`, `pino`, `cookie-parser`, `bullmq`)                                 |
| `tsconfig.json`                                       | Strictest compiler checks (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)                                                             |
| `tsconfig.build.json`                                 | Production build config excluding `tests/`                                                                                                       |
| `eslint.config.mjs`                                   | ESLint 9 Flat Config enforcing async safety & flagging `console.log`                                                                             |
| `.prettierrc` / `.editorconfig`                       | Unified indentation (2 spaces) and line endings (LF)                                                                                             |
| `src/config/env.ts`                                   | Zod runtime environment schema validation (fail-fast on boot)                                                                                    |
| `src/config/logger.ts`                                | High-performance Pino logger with PII redaction and AsyncLocalStorage mixin                                                                      |
| `src/lib/context.ts`                                  | `AsyncLocalStorage` request context store (`correlationId`, `userId`, `tenantId`)                                                                |
| `src/middleware/correlation.ts`                       | Ingests or generates UUID v7 correlation IDs and enters ALS boundary                                                                             |
| `src/middleware/request-logger.ts`                    | `pino-http` middleware logging request/response with duration in ms                                                                              |
| `src/lib/apiError.ts`                                 | RFC 9457 `ProblemDetails` schema, `sendProblemDetails` helper, and typed error classes                                                           |
| `src/lib/asyncHandler.ts`                             | Async route wrapper catching rejected Promises and eliminating try/catch                                                                         |
| `src/middleware/errorHandler.ts`                      | Centralized RFC 9457 error handler with Zod formatting and 500 stack masking                                                                     |
| `src/config/database.ts`                              | `pg.Pool` connection pool with Neon SSL, `withTransaction`, `withTenantTransaction` (parameterized `set_config` RLS variable), and query logging |
| `src/config/redis.ts`                                 | `ioredis` client with exponential backoff, exported `redisConnectionOptions` for BullMQ, and `checkRedisHealth`                                  |
| `src/app.ts`                                          | Express application mounting middleware, `/api/v1/auth`, `/api/v1/health`, `/api/v1/ready`, and 404 handler                                      |
| `src/index.ts`                                        | Server entrypoint with production-grade SIGTERM/SIGINT graceful shutdown (watchdog timer, pool drain, redis quit)                                |
| `migrations/001_create-users-and-sessions.up.sql`     | Users table (lower email index), Sessions (family-based refresh tokens), Auth tokens                                                             |
| `migrations/001_create-users-and-sessions.down.sql`   | Clean migration rollback statements                                                                                                              |
| `src/lib/crypto.ts`                                   | Argon2id password hashing, RS256 asymmetric JWT sign/verify, SHA-256 token hashing, timingSafeCompare                                            |
| `src/middleware/validate.ts`                          | Reusable Zod request validator forwarding schema violations to RFC 9457 errorHandler                                                             |
| `src/modules/auth/auth.schemas.ts`                    | Zod validation schemas and TypeScript DTO contracts (SignupInput, LoginInput, UserResponse, AuthResponse)                                        |
| `src/modules/auth/user.repository.ts`                 | Raw SQL user repository with lowercase email index scans (`idx_users_email_lower`)                                                               |
| `src/modules/auth/session.repository.ts`              | Raw SQL session repository supporting atomic session rotation and token family revocation                                                        |
| `src/modules/auth/auth.service.ts`                    | Authentication business logic: Argon2id verification, session rotation, family reuse detection                                                   |
| `src/modules/auth/auth.controller.ts`                 | HTTP controller managing HttpOnly cookies, request metadata extraction, and response DTOs                                                        |
| `src/modules/auth/auth.routes.ts`                     | Express router exposing `/signup`, `/login`, `/refresh`, and `/logout`                                                                           |
| `tests/integration/auth.test.ts`                      | 12 automated integration tests covering health, auth lifecycle, and adversarial replay attacks                                                   |
| `migrations/002_create-tenants-and-projects.up.sql`   | Tenants, Tenant Members (composite PK, RBAC), Projects with RLS policies & `FORCE ROW LEVEL SECURITY`                                            |
| `migrations/002_create-tenants-and-projects.down.sql` | Clean teardown statements for Milestone 2 schema                                                                                                 |
| `src/types/express.d.ts`                              | Express global Request type augmentation (`req.user`, `req.tenant`)                                                                              |
| `src/middleware/authenticate.ts`                      | RS256 Bearer JWT guard extracting `sub` to `req.user` & `AsyncLocalStorage`                                                                      |
| `src/middleware/tenant.ts`                            | Tenancy guard verifying `tenant_members` in Postgres & hierarchical RBAC `requireRole`                                                           |
| `src/modules/projects/project.schema.ts`              | Zod validation schemas for project creation, updates, and param checking                                                                         |
| `src/modules/projects/project.repository.ts`          | Raw SQL project repository using `withTenantTransaction` to enforce Postgres RLS                                                                 |
| `src/modules/projects/project.service.ts`             | Domain logic enforcing key uniqueness, UUID v7 generation, and RFC 9457 error handling                                                           |
| `src/modules/projects/project.controller.ts`          | HTTP controller binding tenant/user context and returning standardized response envelopes                                                        |
| `src/modules/projects/project.routes.ts`              | Express router with layered guards (`authenticate` -> `requireTenant` -> `requireRole`)                                                          |
| `tests/integration/tenant-projects.test.ts`           | 16 automated adversarial tests verifying tenant isolation, cross-tenant leak prevention, and RBAC hierarchy                                      |
| `migrations/003_create-tasks-and-indexes.up.sql`      | Tasks table, generated TSVECTOR for full-text search, composite indexes, and RLS                                                                 |
| `migrations/003_create-tasks-and-indexes.down.sql`    | Clean rollback statements for tasks table and policy                                                                                             |
| `src/middleware/idempotency.ts`                       | Atomic Redis idempotency guard (`SET NX EX`) replaying cached responses                                                                          |
| `src/lib/pagination.ts`                               | Opaque Base64 URL-safe cursor encoder/decoder and `LIMIT + 1` keyset pagination helper                                                           |
| `src/modules/tasks/task.schema.ts`                    | Zod validation contracts (task creation, OCC version update, keyset filtering)                                                                   |
| `src/modules/tasks/task.repository.ts`                | Raw SQL task repository with keyset pagination, next number resolution, and OCC updates                                                          |
| `src/modules/tasks/task.service.ts`                   | Domain logic validating project references, cursor decoding, and OCC conflict handling                                                           |
| `src/modules/tasks/task.controller.ts`                | HTTP controller binding tenant/user context and returning paginated/item envelopes                                                               |
| `src/modules/tasks/task.routes.ts`                    | Express router wiring `authenticate`, `requireTenant`, `requireRole`, and Redis `idempotency`                                                    |
| `tests/integration/tasks.test.ts`                     | 12 automated adversarial tests covering sequential numbering, keyset cursor pagination, OCC 409 conflict, and Redis idempotency                  |
| `src/jobs/contracts.ts`                               | Zod validation schemas & typed contracts for background jobs (TaskAssigned, WelcomeEmail, WebhookDelivery)                                       |
| `src/jobs/queues.ts`                                  | BullMQ queue factory (`notifications`, isolated `webhooks` bulkhead queue with jittered exponential backoff) & enqueue helpers                    |
| `src/services/email.service.ts`                       | Transactional email provider abstraction with mock in-memory delivery & test inspection                                                          |
| `src/jobs/worker.ts`                                  | Dedicated BullMQ worker with ALS context re-hydration, concurrency controls & graceful shutdown                                                  |
| `tests/integration/jobs.test.ts`                      | 3 automated integration tests verifying async dispatch, retry backoff, and DLQ capture                                                          |
| `migrations/004_create-pats-and-webhooks.up.sql`      | Migration 004: PATs, Webhook Subscriptions, Webhook Deliveries with GIN indexes & RLS                                                             |
| `migrations/004_create-pats-and-webhooks.down.sql`    | Clean rollback statements for PATs and Webhook tables                                                                                            |
| `src/lib/pat.ts`                                      | Cryptographic PAT generation (CSPRNG), SHA-256 token hasher, prefixing, and granular scope validation algebra                                     |
| `src/modules/pats/pat.schema.ts`                      | Zod validation schemas (token creation, param checking) and camelCase response DTO contracts                                                      |
| `src/modules/pats/pat.repository.ts`                  | Raw SQL PAT repository with RLS enforcement via `withTenantTransaction`, index scans, and atomic revocation                                       |
| `src/modules/pats/pat.service.ts`                     | Business logic for zero-knowledge CSPRNG minting, one-time raw exposure, and RBAC token revocation                                               |
| `src/modules/pats/pat.controller.ts`                  | HTTP controller for PAT lifecycle endpoints with 201 Created and 204 No Content                                                                  |
| `src/modules/pats/pat.routes.ts`                      | Express router mounting PAT management with `authenticate`, `requireTenant`, `requireUserSession`, and RBAC guards                                |
| `src/modules/webhooks/webhook.schema.ts`              | Zod validation schemas (URL, supported events, SSRF guards), request wrappers, and camelCase response DTOs                                      |
| `src/modules/webhooks/webhook.repository.ts`          | Raw SQL Webhook repository with RLS enforcement, GIN array matching, delivery audit logging & atomic circuit breaker updates                     |
| `src/modules/webhooks/webhook.service.ts`             | Business logic with CSPRNG 256-bit secret generation (`whsec_`), SSRF hostname filter, secret rotation, and status toggling                       |
| `src/modules/webhooks/webhook.controller.ts`          | HTTP controller exposing standard CRUD, secret rotation, and delivery logs with RFC 9457 error handling                                         |
| `src/modules/webhooks/webhook.routes.ts`              | Express router wiring `authenticate`, `requireTenant`, `requireRole("ADMIN")`, and `requireScope` mounted at `/api/v1/webhooks`                |
| `src/lib/webhook-signature.ts`                        | Stripe-style HMAC-SHA256 webhook signer (`t=...,v1=...`) and `timingSafeCompare` verifier with 300s replay tolerance                           |
| `src/services/webhook-dispatcher.service.ts`          | Fan-out domain event dispatcher querying GIN-indexed active subscribers and enqueuing per-subscription BullMQ jobs                             |
| `src/services/webhook-delivery.service.ts`            | Hardened outbound HTTP delivery engine (DNS-rebinding SSRF guard, `redirect: "manual"`, 5s timeout, 2KB stream cap, circuit breaker, audit log)  |
| `tests/integration/pats-webhooks.test.ts`             | 7 automated adversarial tests covering PAT scopes, revocation, live HMAC-SHA256 webhook delivery, secret rotation, and circuit breaker tripping  |

| `src/middleware/rate-limiter.ts`                      | Atomic Redis Lua script implementing sliding-window rate limiting (`rl:auth:ip:*`, `rl:api:user:*`), IETF draft headers, RFC 9457 429 exceptions |
| `migrations/005_create-audit-logs.up.sql`             | Audit log table with RLS, composite time-series/resource indexes, and DB-level immutability trigger (`BEFORE UPDATE OR DELETE RAISE EXCEPTION`) |
| `migrations/005_create-audit-logs.down.sql`           | Rollback statements for audit logs table and immutability trigger                                                                                |
| `src/modules/audit/audit.types.ts`                    | Strict TypeScript contracts for audit records, creation inputs, and cryptographic verification results                                           |
| `src/modules/audit/audit.repository.ts`               | Raw SQL audit log repository supporting RLS, latest-hash retrieval, and ascending chain walk                                                      |
| `src/metrics/registry.ts`                              | Central Prometheus registry using official `@prometheus-io/client` and Node.js process metrics                                                   |
| `src/metrics/http.metrics.ts`                          | HTTP request counter & duration histogram with fine-grained latency buckets                                                                       |
| `src/middleware/metrics.middleware.ts`                 | Route-normalizing Express middleware recording HTTP metrics and preventing cardinality explosions                                                 |
| `src/metrics/database.metrics.ts`                      | Neon PostgreSQL pool gauges (total, idle, active, waiting) and query duration histogram & error counters                                        |
| `src/metrics/redis.metrics.ts`                         | Redis connection gauge, command duration histogram, and sliding-window rate limit hit counter                                                    |
| `src/metrics/auth.metrics.ts`                          | Login attempts counter, refresh counter, revoked JWT denylist counter, and Argon2id execution duration histogram                                 |
| `src/metrics/business.metrics.ts`                      | SaaS business metrics (tasks created by priority, projects created, PATs minted, webhooks delivered)                                              |
| `src/metrics/queue.metrics.ts`                         | BullMQ queue & worker metrics (enqueued counter, job execution duration histogram, emails sent counter, email send latency histogram)             |
| `src/config/telemetry.ts`                              | OpenTelemetry SDK runtime initialization with auto-instrumentations (pg, ioredis, express, pino) and graceful OTLP trace flush                     |
| `src/modules/health/`                                 | Kubernetes deep liveness (`/health/live` event loop lag & V8 heap) and readiness (`/health/ready` timed DB & Redis pings with latency diagnostics) |
| `scripts/profile-queries.ts`                           | Automated database query planner profiling sweep validating B-tree, GIN trigram, and buffer cache performance with zero sequential scans            |
| `Dockerfile`                                          | Multi-stage production container build (node:22-alpine, non-root user, dumb-init PID 1, layer-cached npm ci, ~150MB image)                          |
| `docker-compose.yml`                                  | Orchestrates full LGTM observability stack (SaaS API, Redis, Prometheus, Tempo OTLP, Loki, Grafana with unified correlation)                        |
| `tests/load/k6-stress.js`                             | Automated k6 load & stress testing suite (multi-stage ramp-up to 150 VUs, SLA thresholds, rate limiter saturation verification)                       |

---

## 6. Next Immediate Action for AI Assistants

> [!CAUTION]
> **MANDATORY PREREQUISITE BEFORE STARTING SPRINT 1:**  
> A senior code review audit uncovered 7 critical security, concurrency, and RLS flaws in the existing codebase. 
> **ANY AI ASSISTANT STARTING A SESSION MUST BEGIN WITH MILESTONE 5.6 (PHASE 0 IN `SAAS-ENTERPRISE-ROADMAP.md`).**  
> Sprint 1 cannot begin until these 7 issues are resolved and verified with adversarial integration tests.

### Milestone 5.6: The Security, Concurrency & RLS Hardening Checklist

1. **0.1 RLS Enforcement via Dedicated Runtime Role:**
   - Audit found `rolbypassrls = true` on the Neon/Postgres superuser connection, meaning RLS was never enforced at the DB level; isolation relied solely on application `WHERE tenant_id = $1`.
   - Fix: Provision `app_runtime` non-superuser role (`NOBYPASSRLS`), connect through it, and verify that missing `SET LOCAL app.current_tenant` queries fail at the DB level.
2. **0.2 Eliminate Webhook Cross-Tenant IDOR/BOLA:**
   - Audit found `webhook.repository.ts` (`findById`, `update`, `rotateSecret`, `delete`) only filters `WHERE id = $1` without `tenant_id`.
   - Fix: Enforce `WHERE id = $1 AND tenant_id = $2` on all webhook repository queries.
3. **0.3 Mount PAT Scopes on Tasks & Projects:**
   - Audit found `requireScope` is only mounted on webhook routes; PATs with any scope can mutate tasks and projects.
   - Fix: Add `requireScope('tasks:read')` and `requireScope('tasks:write')` to `task.routes.ts` and `project.routes.ts`. Align scope names with enterprise roadmap.
4. **0.4 Global Rate Limiter & X-Forwarded-For Spoofing Defense:**
   - Audit found `apiRateLimiter` is unmounted in `app.ts` (only `/auth` is limited), and it trusts raw `X-Forwarded-For` headers.
   - Fix: Configure Express `trust proxy` safely, mount `apiRateLimiter` across `/api/v1`, and use safe `req.ip`.
5. **0.5 Concurrency Race Fixes (Tokens, Task Numbers, Unique Keys):**
   - Refresh token race: Use atomic conditional `UPDATE sessions SET is_revoked = TRUE WHERE id = $1 AND is_revoked = FALSE RETURNING id;`. If `rowCount === 0`, trigger `revokeFamily` reuse detection.
   - Task number race: Fix `MAX(number)+1` race condition using an atomic counter or `INSERT ... ON CONFLICT` retry loop.
   - Catch Postgres unique constraint violation (`23505`) and return clean RFC 9457 `409 Conflict` instead of `500`.
6. **0.6 Fix Audit Log Immutability Trigger (Unblock GDPR Erasure) & Wire Service:**
   - Audit found `trg_audit_logs_immutable` catches `ON DELETE CASCADE` and `ON DELETE SET NULL`, making deleting tenants or users impossible (breaking Sprint 14 GDPR).
   - Fix: Update trigger to allow system/cascade deletions. Wire `auditService` into domain events so it is actively used in production.
7. **0.7 Operational Hygiene & Security Best Practices:**
   - Login timing equalization: Run dummy Argon2id hash when email is not found to prevent user enumeration.
   - Remove refresh token from response JSON body (keep strictly in `HttpOnly` cookie).
   - Validate `assigneeId` belongs to `tenant_members` before assigning tasks.
   - Close webhook queue in worker graceful shutdown (`closeAllQueues`).
   - Remove leftover debug route `/api/v1/test-error`.

---

### Subsequent Focus: The 15 Enterprise Sprints (After Milestone 5.6)

Once Milestone 5.6 is complete and verified, follow the 15 enterprise sprints detailed in [SAAS-ENTERPRISE-ROADMAP.md](file:///mnt/recovery/be/SAAS-ENTERPRISE-ROADMAP.md):

- **Phase 1: Identity & Multi-Factor Authentication (2FA)**
  - Sprint 1: Identity Lifecycle, Email Verification, Password Reset & Session/Device Tracking.
  - Sprint 2: Multi-Factor Authentication (TOTP for Google/Microsoft Authenticator, SMS/WhatsApp OTP, Backup Codes, Tenant 2FA Enforcement).
- **Phase 2: Workspaces, Teams & Two-Tier Authorization**
  - Sprint 3: Workspace Provisioning, Cryptographic Invitations & Role Hierarchy Management.
  - Sprint 4: Two-Tier Authorization & Project-Level Memberships (Compartmentalized RLS).
- **Phase 3: The Jira / Linear Issue Tracking Engine**
  - Sprint 5: Issue Hierarchy (Epics & Subtasks), Assignees, Workflows & Scheduling.
  - Sprint 6: Issue Dependencies (DAG Blocker Cycle Detection) & Custom Fields Engine (JSONB + GIN).
  - Sprint 7: Sprints, Milestones, Scrum Cycles & Burndown Data.
  - Sprint 8: Time Tracking & Worklogs (Atomic hour rollups).
- **Phase 4: Collaboration, Communication & Media**
  - Sprint 9: Activity Stream, Task Changelog & User Mentions.
  - Sprint 10: Direct-to-Storage Attachments (S3 / Cloudflare R2 Presigned URLs, zero memory buffering).
  - Sprint 11: In-App Notification Center & Notification Preferences.
  - Sprint 12: Real-Time Event Gateway (Server-Sent Events / WebSockets via Redis Pub/Sub).
- **Phase 5: Enterprise Governance, Billing & Developer Platform**
  - Sprint 13: Subscription Billing, Metering & Quotas (Stripe Integration, seat caps).
  - Sprint 14: Workspace Bulk Data Export (Encrypted ZIP), Soft Deletion & GDPR Erasure.
  - Sprint 15: Public Developer API (Fine-grained PAT scopes, Tiered Rate Limits, OpenAPI 3.1).

---

## 7. Architectural Standards & Execution Principles

- **Three Essential Perspectives to Analyze for Project #1:**
  1. **Data & Security Flow:** Inbound HTTP requests traversing middleware guards, database transactions, and PostgreSQL Row-Level Security (RLS) policies.
  2. **Asynchronous / Event-Driven Topology:** Background BullMQ job queues, dedicated worker processes, external third-party integrations, and circuit breakers.
  3. **Infrastructure & Observability:** Container networks, Prometheus metric scrapers, OpenTelemetry distributed tracing, and structured Pino logging.
- **Pedagogical Alignment:** The mentor and PJ focus directly on code craftsmanship, deep systems theory, relational database design, and testing. Formal diagramming is separated for independent study.