# Master Context & Engineering Log: 10-Project Senior Backend Series

> **Purpose:** Central living reference and handoff document. Any developer or AI assistant working in this workspace must read this document first before giving any guidance or suggestions.  
> **Learner:** PJ Sudhakar  
> **Workspace Root:** `c:\Users\DMC\Desktop\be`  
> **Status:** Project #1 (Multi-Tenant SaaS API) — Milestone 1: Step 10 Complete (Migrations Live)  
> **Last Updated:** 2026-10-23  

---

## 1. Critical Operating Rules for AI Assistants

### Rule 1: PJ Codes Everything Himself
* **The AI must NEVER directly write, modify, or generate project implementation files** (such as files in `01-saas-api/src/`, `01-saas-api/migrations/`, `01-saas-api/tests/`, etc.).
* **The AI's role is strictly as a senior mentor, tutor, and staff architect:**
  1. Teach the underlying theory, data structures, and PostgreSQL/Redis mechanics deeply.
  2. Explain the architectural *why* and evaluate trade-offs before showing any code.
  3. Provide exact terminal commands (e.g. `npm install ...`, `mkdir ...`) and complete, production-grade code snippets directly inside the chat interface.
  4. Wait for PJ to create, type, review, and test each file before advancing.
* **The ONLY files the AI is authorized to create/update directly** are documentation tracking files in root or `docs/` (specifically `PROJECT-CONTEXT.md` to keep progress and next starting points synchronized).

### Rule 2: No ORMs & No Hand-Wavy Shortcuts
* **Zero ORMs:** We use raw SQL drivers (`pg` for PostgreSQL, `ioredis` for Redis, ClickHouse client, etc.). The goal is genuine mastery of relational algebra, execution plans (`EXPLAIN ANALYZE`), lock modes, and connection pool dynamics.
* **Production-Grade from Day One:** Strict TypeScript (all strict compiler flags enabled), strict runtime validation (`zod`), RFC 9457 Problem Details for all error responses, and structured logging (`pino`) with `AsyncLocalStorage` correlation IDs. No `console.log` in backend code.
* **No Code Without Design:** Each module begins with an understanding of the domain requirements, database schemas, and failure modes before any implementation begins.

---

## 2. Workspace Directory Layout

```
c:\Users\DMC\Desktop\be\
├── PROJECT-CONTEXT.md            # THIS FILE: Current status, AI instructions & progress log
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
└── 01-saas-api\                  # Project #1 root directory (Multi-Tenant SaaS API)
    ├── docs\                     # Project-specific ADRs and milestones
    ├── src\                      # Application source code
    │   ├── config\               # env, logger, database, redis
    │   ├── lib\                  # context, apiError, asyncHandler, crypto
    │   ├── middleware\           # correlation, request-logger, errorHandler
    │   ├── modules\              # feature modules (auth, users, etc.)
    │   └── types\                # type declarations & augmentations
    ├── migrations\               # SQL-first raw database migrations (up/down)
    └── tests\                    # Unit, integration, and adversarial tests
```

---

## 3. Project #1 (SaaS API) Core Architecture Standards

* **Runtime:** Node.js (v20+ / v22 LTS) with CommonJS modules.
* **Language:** TypeScript in strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
* **HTTP Framework:** Express 4.
* **Data Stores:**
  * **PostgreSQL (Neon):** Durable relational state, Row-Level Security (RLS) multi-tenancy, raw `pg` client (`pg.Pool`), SQL migrations via `node-pg-migrate`.
  * **Redis (Upstash / Local):** Ephemeral security state (rate limit token buckets, token denylists, idempotency keys, BullMQ job queues).
* **Security & Auth:**
  * Password Hashing: Argon2id (`argon2`).
  * Access Tokens: RS256 Asymmetric JWTs (`jsonwebtoken`).
  * Refresh Tokens: Cryptographically secure 256-bit opaque tokens (SHA-256 hashed in Postgres) with family-based reuse detection.
* **Layering Pattern (Feature-Based):**
  * `Route` (thin, declares middleware and controller)
  * `Controller` (HTTP transport, request validation, response formatting)
  * `Service` (Business logic, transactions, domain invariants — no HTTP, no SQL)
  * `Repository` (Raw SQL, row mapping, RLS-aware queries — no business rules)

---

## 4. Current Status & Progress Tracker

### Current Active Project: **Project #1 (Multi-Tenant SaaS API)**
**Current Milestone:** **Milestone 1 — Foundation, Environment, Tooling & Auth**

#### Milestone 1 Checklist:
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
- [ ] **Step 11:** Crypto Library (`src/lib/crypto.ts`: Argon2id hashing, RS256 JWT sign/verify, SHA-256 token hashing).
- [ ] **Step 12:** Auth Module (Signup, Login, Token Refresh with Family Reuse Detection, Logout).
- [ ] **Step 13:** Health check endpoints (`/health` liveness, `/ready` readiness) & Graceful Shutdown.
- [ ] **Step 14:** Adversarial Auth Testing with Vitest & Supertest.

---

## 5. Completed Implementation Inventory (Steps 1–10)

| File | Purpose / Architectural Standard |
|---|---|
| `package.json` | Pinned production & dev dependencies (no ORMs, raw `pg`, `ioredis`, `argon2`, `pino`) |
| `tsconfig.json` | Strictest compiler checks (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) |
| `tsconfig.build.json` | Production build config excluding `tests/` |
| `eslint.config.mjs` | ESLint 9 Flat Config enforcing async safety & flagging `console.log` |
| `.prettierrc` / `.editorconfig` | Unified indentation (2 spaces) and line endings (LF) |
| `src/config/env.ts` | Zod runtime environment schema validation (fail-fast on boot) |
| `src/config/logger.ts` | High-performance Pino logger with PII redaction and AsyncLocalStorage mixin |
| `src/lib/context.ts` | `AsyncLocalStorage` request context store (`correlationId`, `userId`, `tenantId`) |
| `src/middleware/correlation.ts` | Ingests or generates UUID v7 correlation IDs and enters ALS boundary |
| `src/middleware/request-logger.ts` | `pino-http` middleware logging request/response with duration in ms |
| `src/lib/apiError.ts` | RFC 9457 `ProblemDetails` schema, `sendProblemDetails` helper, and typed error classes |
| `src/lib/asyncHandler.ts` | Async route wrapper catching rejected Promises and eliminating try/catch |
| `src/middleware/errorHandler.ts` | Centralized RFC 9457 error handler with Zod formatting and 500 stack masking |
| `src/config/database.ts` | `pg.Pool` connection pool with Neon SSL, `withTransaction`, and query duration logging |
| `src/config/redis.ts` | `ioredis` client with exponential backoff and `checkRedisHealth` |
| `src/app.ts` | Express application mounting middleware, `/api/v1/health`, `/api/v1/ready`, and 404 handler |
| `src/index.ts` | Server entrypoint listening on port 4000 with SIGTERM graceful shutdown handler |
| `migrations/001_create-users-and-sessions.up.sql` | Users table (lower email index), Sessions (family-based refresh tokens), Auth tokens |
| `migrations/001_create-users-and-sessions.down.sql` | Clean migration rollback statements |

---

## 6. Next Immediate Action for AI
* **Current Step:** Guide PJ through **Step 11: Crypto Library (`src/lib/crypto.ts`)**.
* **Action:**
  1. Implement `src/lib/crypto.ts` (Argon2id password hashing, RS256 asymmetric JWT sign/verify, SHA-256 token hashing).
  2. Generate 2048-bit RSA key pair for `.env` (`JWT_ACCESS_PRIVATE_KEY` and `JWT_ACCESS_PUBLIC_KEY`).
  3. Wait for PJ to verify before starting Step 12 (Auth Module: repositories, services, controllers, routes).

