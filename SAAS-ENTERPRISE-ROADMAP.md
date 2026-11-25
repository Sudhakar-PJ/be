# Project #1: Enterprise SaaS Backend Master Specification (Jira & Linear Grade)

> **Document Status:** Active Master Specification & Comprehensive Sprint Checklist  
> **Benchmark Standards:** **Jira Software**, **Linear**, **GitHub Projects**, and **GitLab**.  
> **Operating Mandate:** Zero ORMs, raw PostgreSQL (`pg`), Redis (`ioredis`), strict TypeScript (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Zod schema validation, RFC 9457 Problem Details error responses, and asynchronous BullMQ pipelines. PJ codes everything himself per Rule 1.

---

## Architectural Grounding & Domain Modeling

> **Architectural Law:** Before writing any migration SQL or TypeScript implementation file for a sprint, the mentor and learner reason through the system design, relational algebra, and threat models from first principles:
> 
> 1. **Relational Constraints & Invariants:** Define primary keys, foreign keys, cascade behaviors, and uniqueness guarantees.
> 2. **Threat Modeling & Edge Cases:** Identify timing attacks, replay attacks, concurrent race conditions, and privilege escalations.
> 3. **Distributed Mechanics:** Model caching strategies, token invalidation cascades, and asynchronous queue workers.
> 4. **Pedagogical Instruction:** Socratic analysis and deep real-world analogies (Stripe, GitHub, Linear) before typing code.

---

## Complete Enterprise Architectural Topology

```
                                    ┌────────────────────────────────────────────────────────┐
                                    │               ENTERPRISE SAAS PLATFORM                 │
                                    └───────────────────────────┬────────────────────────────┘
                                                                │
           ┌───────────────────────────────────┼────────────────┴───────────────────┼───────────────────────────────────┐
           ▼                                   ▼                                    ▼                                   ▼
┌─────────────────────┐             ┌─────────────────────┐              ┌─────────────────────┐             ┌─────────────────────┐
│ 1. IDENTITY & 2FA   │             │ 2. TEAMS & RBAC     │              │ 3. ADVANCED ISSUES  │             │ 4. COLLABORATION    │
│ • Global Users      │             │ • Organization Level│              │ • Epics & Subtasks  │             │ • S3/R2 Attachments │
│ • TOTP (Google/MS)  │             │   (Owner vs Admin)  │              │ • Custom Workflows  │             │ • Task Changelogs   │
│ • SMS/WhatsApp OTP  │             │ • Project Level     │              │ • Sprints & Cycles  │             │ • In-App Bell Inbox │
│ • Backup Codes      │             │   (Scoped Access)   │              │ • Custom Fields     │             │ • Live SSE Mesh     │
│ • Device Sessions   │             │ • Tokenized Invites │              │ • Blockers & DAG    │             │ • Stripe Billing    │
└─────────────────────┘             └─────────────────────┘              └─────────────────────┘             └─────────────────────┘
```

---

## Phase 0: Mandatory Pre-Sprint Code Audit Remediation & Hardening (Milestone 5.6)

> [!CAUTION]
> **MANDATORY PREREQUISITE BEFORE STARTING SPRINT 1:**  
> A senior code review audit of the core infrastructure revealed 7 critical security, concurrency, and RLS flaws (0.1–0.7). A second audit (2026-11-25) added Milestones 5.7 (0.8–0.20) and 5.8 (0.21–0.24). Sprint 1 MUST NOT begin until 0.1–0.20 are complete and verified with adversarial integration tests. Any AI assistant starting a session must begin with this checklist.

### Milestone 5.6 Checklist: Security, Concurrency & RLS Hardening

- [ ] **0.1 RLS Enforcement & Dedicated Runtime Role:**
  - Audit revealed `rolbypassrls = true` on the database connection role (Neon/Postgres owner), meaning RLS was never enforced at the database level.
  - Create a dedicated non-superuser role (e.g. `app_runtime`) with `NOBYPASSRLS`.
  - Connect via `app_runtime` and add adversarial tests proving unauthorized cross-tenant queries/inserts without `SET LOCAL app.current_tenant` fail at the DB level.
- [ ] **0.2 Eliminate Webhook Cross-Tenant IDOR / BOLA:**
  - Audit revealed `webhook.repository.ts` queries (`findById`, `update`, `rotateSecret`, `delete`) only check `WHERE id = $1` without tenant isolation.
  - Fix all webhook queries to strictly enforce `WHERE id = $1 AND tenant_id = $2`.
- [ ] **0.3 Mount PAT Scopes on Tasks & Projects:**
  - Audit revealed `requireScope` is only mounted on webhooks; PATs with any scope can mutate tasks and projects.
  - Add `requireScope('tasks:read')`, `requireScope('tasks:write')`, and project scopes to `task.routes.ts` and `project.routes.ts`. Align scope naming in `pat.ts` with enterprise issue terminology.
- [ ] **0.4 Global API Rate Limiter & X-Forwarded-For Spoofing Defense:**
  - Audit revealed `apiRateLimiter` is unmounted in `app.ts` (only `/auth` is limited), and it blindly trusts `req.headers["x-forwarded-for"]`.
  - Configure Express `app.set('trust proxy', 1)` and safely extract client IP. Mount `apiRateLimiter` across all `/api/v1` routes.
- [ ] **0.5 Concurrency Race Fixes (Tokens, Task Numbers, Unique Keys):**
  - Fix refresh token family rotation race: `UPDATE sessions SET is_revoked = TRUE WHERE id = $1 AND is_revoked = FALSE RETURNING id;`. If `rowCount === 0`, trigger `revokeFamily` reuse detection.
  - Fix task number generation collision (`MAX(number)+1` race): atomic project counter or `INSERT ... ON CONFLICT` handling.
  - Catch Postgres unique constraint violation (`23505`) and return RFC 9457 `409 Conflict` instead of unhandled `500`.
- [ ] **0.6 Fix Audit Log Immutability Trigger (Unblock GDPR Erasure) & Wire Service:**
  - Audit revealed `trg_audit_logs_immutable` catches `ON DELETE CASCADE` and `ON DELETE SET NULL`, making deleting tenants or users impossible (breaking Sprint 14 GDPR).
  - Update trigger to allow system/cascade deletions.
  - Wire `auditService` into domain lifecycle events (tasks, projects, webhooks) so it is no longer dead code.
- [ ] **0.7 Operational Hygiene & Security Best Practices:**
  - Login timing equalization: Run dummy Argon2id hash when user email is not found to prevent user enumeration.
  - Remove refresh token from response JSON body (keep strictly in `HttpOnly` cookie).
  - Validate `assigneeId` belongs to `tenant_members` before assigning tasks.
  - Close webhook queue in worker graceful shutdown (`closeAllQueues`).
  - Remove leftover debug route `/api/v1/test-error`.

> [!WARNING]
> **Coupled with 0.1:** `src/middleware/authenticate.ts` looks up `personal_access_tokens` (FORCE RLS) with **no tenant context**. It only works today because the role bypasses RLS. The moment 0.1 lands, every PAT login fails. Fix the PAT lookup in the same change (e.g. a `SECURITY DEFINER` function that resolves `token_hash → (pat_id, tenant_id, user_id, scopes)`, or a non-RLS lookup table), and add a test for it.

### Milestone 5.7 Checklist: Second Audit Findings (Review 2026-11-25)

> Found in a second code audit. Also prerequisites for Sprint 1; 0.8–0.10 are the highest priority.

- [ ] **0.8 Redis Failure Must Not Hang Requests:**
  - `src/config/redis.ts` sets `maxRetriesPerRequest: null` on the **app** client (copied from BullMQ). During a Redis outage, the JWT denylist `EXISTS` check waits forever → every authenticated request hangs.
  - Keep `null` only on BullMQ connections; give the app client a finite retry count + command timeout. Decide fail-open vs fail-closed for the denylist and rate limiter, and test it (stop Redis mid-test).
  - Set Redis `maxmemory-policy noeviction` (BullMQ requirement) and enable AOF persistence in `docker-compose.yml` (currently `--save "" --appendonly no` → restart loses queued jobs and the denylist).
- [ ] **0.9 Transactional Outbox (Dual-Write Fix):**
  - Today: DB commit in one step, then webhook dispatch / BullMQ enqueue in another; failures are only logged (`webhook-dispatcher.service.ts`). Crash or Redis outage in between = event lost forever.
  - Add an `outbox_events` table; insert the event **inside the same transaction** as the business write; a relay worker polls with `SELECT ... FOR UPDATE SKIP LOCKED` and enqueues into BullMQ, marking rows processed. Adversarial test: kill the process after commit and before enqueue → the event is still delivered after restart.
- [ ] **0.10 Atomic Signup:**
  - `auth.service.ts` inserts the user and the session in separate transactions → a failure leaves an orphan user whose email can never sign up again. Wrap both in one `withTransaction`.
- [ ] **0.11 Keyset Cursor Precision Bug:**
  - The cursor encodes `created_at` via `toISOString()` (millisecond precision) but Postgres stores microseconds → rows created in the same millisecond are skipped. Either cursor on the UUIDv7 `id` alone, or encode the full-precision timestamp (`created_at::text`). Test: insert 50 rows in one statement, paginate with limit 7, assert all 50 are seen exactly once.
- [ ] **0.12 Idempotency Key Scoping:**
  - `src/middleware/idempotency.ts` scopes keys by tenant only. Scope by `tenant + user + method + route`, store a SHA-256 of the request body, and return `422` if the same key arrives with a different body (Stripe semantics).
- [ ] **0.13 Bounded Queries Everywhere:**
  - `webhook.controller.ts` uses `parseInt(limit)` with no upper bound or NaN check (`?limit=abc` → 500, `?limit=1000000` → everything). The project, PAT, and webhook list repositories have no `LIMIT` at all. The audit log uses OFFSET.
  - Validate every `limit` with Zod (`.int().min(1).max(100).default(20)`) and add keyset pagination to every list endpoint.
- [ ] **0.14 Database Driver Hardening (`src/config/database.ts`):**
  - Set `statement_timeout`, `idle_in_transaction_session_timeout`, and `query_timeout` on the pool.
  - If `ROLLBACK` throws, the original error is hidden and a broken client goes back to the pool. Preserve the original error and call `client.release(err)` so the pool discards the connection.
  - Failed queries log raw `params` (password hashes, token hashes, webhook secrets). Stop logging params, or redact them.
- [ ] **0.15 Tenant-Safe Foreign Keys & FK Indexes:**
  - FKs reference `(id)`, not `(tenant_id, id)` → the DB can't stop a task, comment, or task_label from pointing at another tenant's row. Add `UNIQUE (tenant_id, id)` on parent tables and composite FKs `(tenant_id, project_id) REFERENCES projects(tenant_id, id)`.
  - Index the unindexed FK columns (`tasks.assignee_id`, `tasks.created_by`, `projects.created_by`, `comments.author_id`, `audit_logs.actor_id`, `webhook_subscriptions.created_by`). Otherwise user deletes and `ON DELETE SET NULL` cascades seq-scan.
- [ ] **0.16 Task Update Event Correctness:**
  - The assignment notification fires on every PATCH containing `assigneeId`, even when unchanged, and uses `record.created_by` as the actor instead of the requesting user. The `task.updated` webhook has no `actorId`. Fire only on actual change, with the real actor.
- [ ] **0.17 Unhandled Postgres Error Codes:**
  - Map `22P02` (invalid text representation), `23503` (FK violation), `23514` (check violation), and `40001`/`40P01` (serialization/deadlock) to proper RFC 9457 responses instead of 500.
- [ ] **0.18 CI Pipeline & Isolated Test Database:**
  - Add `.github/workflows/ci.yml`: install → typecheck → lint → spin up Postgres + Redis service containers → run migrations → run tests → build Docker image.
  - Tests currently share the dev `DATABASE_URL` and use hard-coded slugs (`'task-corp'`) against unique indexes; signup users are never cleaned up. Use a dedicated test DB (or a per-run schema) with deterministic setup/teardown.
  - Add a `vitest.config.ts`, install `@vitest/coverage-v8`, and start writing **unit tests** for pure logic (`pagination.ts`, `pat.ts` scope algebra, `webhook-signature.ts`, the audit hash chain).
  - Add a migration step to deploy (a separate `migrate` job/container, not the app CMD).
- [ ] **0.19 Server Timeouts & Edge Hygiene:**
  - Set `server.headersTimeout`, `server.requestTimeout`, `server.keepAliveTimeout` in `src/index.ts` (slowloris defense; keep `keepAliveTimeout` above the load balancer's idle timeout).
  - Move `/metrics` off the public API (separate port or auth).
  - The webhook SSRF guard is skipped outside production, and the DNS check is separate from `fetch` (a DNS-rebinding window). Run the guard in every environment and pin the resolved IP via a custom `undici` dispatcher `lookup`.
- [ ] **0.20 Finish Milestone 6 Observability (spec'd but not built):**
  - The worker has no telemetry import and no metrics endpoint, and `prometheus.yml` scrapes only `app` → queue/email metrics are never collected. Instrument and scrape the worker.
  - Add Prometheus `rule_files` + Alertmanager, provisioned Grafana dashboards (RED + pool + queue depth), and ship logs to Loki (pino transport or promtail/alloy).
  - Define 2–3 SLOs (availability, p99 latency) with multi-window burn-rate alerts.

### Milestone 5.8: Foundational Skills Not Yet Practiced (do before or alongside Sprint 1)

- [ ] **0.21 Read-Through Caching (cache-aside):** Cache tenant membership (`requireTenant`) and the PAT lookup in Redis with TTL + jitter. Invalidate on membership change, role change, and PAT revoke. Learn: stampede protection (single-flight / lock), negative caching, and the stale-read window. Measure DB QPS before/after with k6.
- [ ] **0.22 JWT Key Rotation:** Add `kid`, `iss`, and `aud` claims; support 2 active public keys; expose `/.well-known/jwks.json`. Rotate a key in a test without logging users out.
- [ ] **0.23 Secrets at Rest:** Webhook signing secrets are stored in plaintext (migration 004). Encrypt with AES-256-GCM using envelope encryption (data key per record, wrapped by a master key from env/KMS). This same utility is reused in Sprint 2 for TOTP secrets.
- [ ] **0.24 Conditional Requests (nice-to-have):** Map the task `version` column to `ETag` / `If-Match` (`412 Precondition Failed`) so OCC is expressed in standard HTTP.

---

## Scope Recommendation for the 15 Sprints (Review 2026-11-25)

> The 15 sprints add up to a full Jira clone. Several sprints are mostly CRUD with little new to learn, or duplicate later projects. Focus Project #1 on sprints that teach new concepts, and defer the rest so Project #1 doesn't consume the time budget of Projects #2–#5.

| Sprint | Recommendation | Reason |
|---|---|---|
| 1 Identity lifecycle | **Keep** | Token lifecycles, timing-safe flows, session revocation |
| 2 MFA | **Keep (TOTP + backup codes)**, defer SMS/WhatsApp | TOTP/HOTP crypto is the lesson; SMS is provider glue |
| 3 Workspaces & invites | **Keep** | Invariants (last-owner), atomic acceptance, token design |
| 4 Two-tier authz | **Keep** | RLS policies driven by membership, policy performance |
| 5 Epics/subtasks | Keep, slim | Recursive CTEs for hierarchy rollups |
| 6 DAG + custom fields | **Keep** | Cycle detection via recursive CTE, JSONB + GIN, dynamic validation |
| 7 Sprints & burndown | Defer | Mostly CRUD + GROUP BY |
| 8 Worklogs | Defer | One atomic increment |
| 9 Activity & mentions | **Keep** | Field-diff capture, fan-out of notifications |
| 10 S3 attachments | Defer → covered in Project #4 | Presigned URLs taught there in depth |
| 11 Notification center | Defer | CRUD; the fan-out lesson lives in Sprint 9 |
| 12 SSE realtime | Defer → covered in Project #2 | Redis pub/sub + persistent connections taught there |
| 13 Stripe billing | Defer → covered in Project #3 | Inbound webhooks, payment state machines taught there |
| 14 Export & GDPR | **Keep** | Erasure vs immutable hash-chained audit log, a real conflict between requirements |
| 15 Public API & OpenAPI | **Keep** | Contract-first APIs, tiered limits |

### Proposed New Sprint: OAuth 2.0 / OpenID Connect & SSO (slot after Sprint 2)

*Enterprise SaaS customers expect "Sign in with Google/Microsoft" and SSO more than SMS OTP.*

- [ ] **N.1** OIDC Authorization Code flow with PKCE as a **client** (Google / Microsoft): `state` + `nonce` validation, ID token verification via provider JWKS, account linking by verified email.
- [ ] **N.2** Table `user_identities (user_id, provider, provider_subject, UNIQUE(provider, provider_subject))`.
- [ ] **N.3** Tenant-level SSO enforcement (`tenants.sso_required`, allowed email domains).
- [ ] **N.4** Study only (no build): SAML 2.0 vs OIDC, SCIM user provisioning.
- [ ] **N.5** Adversarial tests: CSRF via missing `state`, ID token replay via `nonce`, account takeover via unverified email linking.

---

## Phase 1: Identity, Multi-Factor Authentication (MFA/2FA) & Security

### Sprint 1: Identity Lifecycle, Password Reset & Session Tracking
*Ensures secure user onboarding, self-service recovery, and visibility over active devices.*

- [ ] **1.1 Database Migration (Identity & Sessions):**
  - Add to `users`: `verification_token_hash VARCHAR(64)`, `verification_token_expires_at TIMESTAMPTZ`, `timezone VARCHAR(50) DEFAULT 'UTC'`, `locale VARCHAR(10) DEFAULT 'en'`, `avatar_url VARCHAR(500)`.
  - Add to `sessions`: `user_agent TEXT`, `ip_address VARCHAR(45)`, `device_name VARCHAR(100)`, `last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`.
  - Table: `password_resets (id UUID PK, user_id UUID REFERENCES users, token_hash VARCHAR(64) UNIQUE, expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ)`.
- [ ] **1.2 Email Verification Loop:**
  - `POST /api/v1/auth/resend-verification` (Rate-limited, generates CSPRNG token, enqueues BullMQ email).
  - `POST /api/v1/auth/verify-email` (Validates token hash, marks `is_verified = true`, invalidates token).
- [ ] **1.3 Self-Service Password Reset ("Forgot Password"):**
  - `POST /api/v1/auth/forgot-password` (Public, timing-safe lookup, generates 1-hour expiration token, enqueues BullMQ email).
  - `POST /api/v1/auth/reset-password` (Validates token, Argon2id re-hashes new password, marks token used, atomically revokes all existing refresh tokens in `sessions` and denylists active JWTs).
- [ ] **1.4 User Profile & Settings:**
  - `GET /api/v1/users/me` (Profile details, global metadata).
  - `PATCH /api/v1/users/me` (Update name, avatar URL, time zone, locale).
  - `POST /api/v1/users/me/change-password` (Verifies current password via Argon2id before updating).
- [ ] **1.5 Active Session & Device Manager:**
  - `GET /api/v1/users/me/sessions` (Lists active logged-in devices with IP, browser, OS, and last active timestamp).
  - `DELETE /api/v1/users/me/sessions/:id` (Revokes a specific remote session).
  - `DELETE /api/v1/users/me/sessions/other` (Revokes all active sessions except the current device).
- [ ] **1.6 Automated Integration Tests:**
  - Test verification token expiration and replay attacks.
  - Test password reset cascade and immediate revocation of old sessions.

---

### Sprint 2: Multi-Factor Authentication Engine (TOTP, SMS/WhatsApp & Backup Codes)
*Provides enterprise-grade multi-factor security compliant with SOC2/ISO27001 requirements.*

- [ ] **2.1 Database Migration (MFA Credentials):**
  - Table: `user_mfa_settings`:
    - `user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
    - `totp_enabled BOOLEAN NOT NULL DEFAULT FALSE`
    - `totp_secret_encrypted TEXT` (Encrypted at rest using AES-256-GCM with application secret key)
    - `sms_enabled BOOLEAN NOT NULL DEFAULT FALSE`
    - `phone_number VARCHAR(20)`
    - `whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE`
    - `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
  - Table: `user_backup_codes`:
    - `id UUID PRIMARY KEY`, `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
    - `code_hash VARCHAR(64) NOT NULL` (SHA-256 hashed single-use codes)
    - `used_at TIMESTAMPTZ`, `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
- [ ] **2.2 Authenticator App (TOTP - RFC 6238):**
  - Compatible with Google Authenticator, Microsoft Authenticator, 1Password, and Authy.
  - `POST /api/v1/auth/mfa/totp/setup` (Generates base32 secret, returns `otpauth://totp/SaaS:{email}?secret=...` URI and QR code data URI).
  - `POST /api/v1/auth/mfa/totp/enable` (Verifies 6-digit TOTP code with time drift window ±30s, encrypts secret in DB, activates TOTP).
  - `POST /api/v1/auth/mfa/totp/disable` (Requires password re-entry + valid TOTP code to disable).
- [ ] **2.3 Phone OTP (SMS & WhatsApp Delivery):**
  - Provider abstraction interface (`SmsProvider`, `WhatsAppProvider`).
  - `POST /api/v1/auth/mfa/phone/send-otp` (Generates 6-digit cryptographically secure numeric OTP, hashes and stores in Redis with 5-minute TTL, rate-limited to 1 per 60s).
  - `POST /api/v1/auth/mfa/phone/verify` (Validates OTP from Redis, marks phone verified).
- [ ] **2.4 Emergency Backup Recovery Codes:**
  - `POST /api/v1/auth/mfa/backup-codes/generate` (Generates 10 single-use formatted codes `xxxx-xxxx-xxxx`, stores SHA-256 hashes, displays plain codes to user once).
- [ ] **2.5 Two-Step Authentication Cascade in Login:**
  - Update `POST /api/v1/auth/login`:
    - If user has 2FA enabled, password verification does **not** issue full tokens.
    - Instead, returns `200 OK` with `{ "mfaRequired": true, "mfaToken": "..." }` (Short-lived 5-minute temporary token signed with RS256).
  - `POST /api/v1/auth/mfa/verify`:
    - Accepts `mfaToken` + (`totpCode` OR `phoneOtp` OR `backupCode`).
    - Upon verification, issues genuine access token + HttpOnly refresh cookie.
- [ ] **2.6 Organization-Level 2FA Enforcement Policy:**
  - Add `enforce_2fa BOOLEAN DEFAULT FALSE` to `tenants` table.
  - Middleware guard: If tenant enforces 2FA and member has not enabled 2FA, blocks access to tenant routes with `403 Forbidden` (`MFA_SETUP_REQUIRED`).
- [ ] **2.7 Automated Integration Tests:**
  - Test TOTP verification against RFC 6238 test vectors and drift tolerance.
  - Test backup code single-use invalidation.
  - Test login two-step cascade and 2FA tenant enforcement.

---

## Phase 2: Organization Workspaces, Teams & Two-Tier Authorization

### Sprint 3: Organization Workspaces & Cryptographic Team Invites
*Transitions from test-seeded multi-tenancy to self-service organization lifecycle.*

- [ ] **3.1 Database Migration (Workspace Invitations & Lifecycle):**
  - Table: `tenant_invitations`:
    - `id UUID PRIMARY KEY`, `tenant_id UUID REFERENCES tenants ON DELETE CASCADE`
    - `email VARCHAR(255) NOT NULL`, `role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'MEMBER', 'VIEWER'))`
    - `token_hash VARCHAR(64) NOT NULL UNIQUE`, `invited_by UUID REFERENCES users`
    - `status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'))`
    - `expires_at TIMESTAMPTZ NOT NULL`, `created_at`, `updated_at`
  - Unique partial index: `(tenant_id, LOWER(email)) WHERE status = 'PENDING'`.
  - Add to `tenants`: `avatar_url VARCHAR(500)`, `deleted_at TIMESTAMPTZ` (Soft deletion support).
- [ ] **3.2 Workspace Provisioning & Directory API:**
  - `POST /api/v1/tenants` (Creates workspace, automatically inserts caller into `tenant_members` as `OWNER`).
  - `GET /api/v1/tenants` (Lists all workspaces the authenticated user belongs to with role badges).
  - `GET /api/v1/tenants/:id` (Returns tenant metadata, member counts, project counts).
  - `PATCH /api/v1/tenants/:id` (Update name, slug, logo; restricted to `OWNER` / `ADMIN`).
- [ ] **3.3 Cryptographic Team Invitations Engine:**
  - `POST /api/v1/tenants/:id/invitations` (`requireRole('ADMIN')`, creates CSPRNG token, stores SHA-256 hash, enqueues BullMQ invite email).
  - `GET /api/v1/tenants/:id/invitations` (`requireRole('ADMIN')`, lists active pending invitations).
  - `DELETE /api/v1/tenants/:id/invitations/:inviteId` (`requireRole('ADMIN')`, revokes invitation).
  - `GET /api/v1/invitations/:token` (Public preview endpoint: returns workspace name, role, inviter name).
  - `POST /api/v1/invitations/:token/accept` (`authenticate`, atomic transaction: verifies user email matches, sets status `ACCEPTED`, inserts into `tenant_members`).
- [ ] **3.4 Role Management & Anti-Escalation Safeguards:**
  - `GET /api/v1/tenants/:id/members` (Lists team members with joined dates and roles).
  - `PATCH /api/v1/tenants/:id/members/:userId` (`requireRole('OWNER')`, promotes/demotes role).
  - Invariant Guard: Prevent demoting the last `OWNER` (prevents orphaned tenants).
  - `DELETE /api/v1/tenants/:id/members/:userId` (`requireRole('OWNER')`, removes user from workspace, cascading to all projects).
  - `POST /api/v1/tenants/:id/transfer-ownership` (Transfers `OWNER` role to another admin atomically).
- [ ] **3.5 Automated Integration Tests:**
  - Test invitation token expiration, cross-account acceptance blocking, and anti-orphaning role checks.

---

### Sprint 4: Two-Tier Authorization & Project-Level Memberships
*Compartmentalizes projects so users only see and query projects they are explicitly assigned to.*

- [ ] **4.1 Database Migration (Project Memberships & Scoped RLS):**
  - Table: `project_members`:
    - `project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE`
    - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
    - `role VARCHAR(20) NOT NULL DEFAULT 'CONTRIBUTOR' CHECK (role IN ('LEAD', 'CONTRIBUTOR', 'VIEWER'))`
    - `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
    - `PRIMARY KEY (project_id, user_id)`
  - Update `projects` table: add `lead_id UUID REFERENCES users(id)`, `status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED'))`.
  - Update PostgreSQL RLS Policy on `projects`:
    - Accessible if user has `tenant_role IN ('OWNER', 'ADMIN')` **OR** exists in `project_members`.
  - Update PostgreSQL RLS Policy on `tasks`:
    - Scoped via project membership (if user can't see the project, they cannot query its tasks).
- [ ] **4.2 Project Membership Management Endpoints:**
  - `POST /api/v1/projects/:id/members` (Assigns user from `tenant_members` to the project).
  - `DELETE /api/v1/projects/:id/members/:userId` (Removes member from project).
  - `GET /api/v1/projects/:id/members` (Lists all users assigned to the project).
- [ ] **4.3 Project Lifecycle & Archival:**
  - `PATCH /api/v1/projects/:id` (Update description, lead, key).
  - `POST /api/v1/projects/:id/archive` & `POST /api/v1/projects/:id/unarchive` (Read-only project freeze).
- [ ] **4.4 Automated Integration Tests:**
  - Adversarial test: Verify a `MEMBER` assigned to Project Alpha receives `404`/`403` when trying to query Project Beta or its tasks.

---

## Phase 3: The Jira / Linear Issue Tracking Engine

### Sprint 5: Issue Hierarchy (Epics & Subtasks), Assignees & Scheduling
*Upgrades simple tasks into Jira/Linear-grade issues with parent-child rollups and ownership.*

- [ ] **5.1 Database Migration (Issue Hierarchy & Ownership):**
  - Update `tasks` table:
    - `assignee_id UUID REFERENCES users(id) ON DELETE SET NULL`
    - `reporter_id UUID NOT NULL REFERENCES users(id)`
    - `issue_type VARCHAR(20) NOT NULL DEFAULT 'TASK' CHECK (issue_type IN ('EPIC', 'TASK', 'BUG', 'SUBTASK'))`
    - `parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE`
    - `due_date TIMESTAMPTZ`, `start_date TIMESTAMPTZ`
    - `estimated_hours NUMERIC(6,2)`, `logged_hours NUMERIC(6,2) DEFAULT 0`
  - Indexes: `idx_tasks_assignee (tenant_id, assignee_id)`, `idx_tasks_parent (parent_task_id)`.
- [ ] **5.2 Issue Hierarchy & Subtask APIs:**
  - `GET /api/v1/tasks/:id/subtasks` (Lists child tasks under a parent Epic or Task).
  - Automatic progress calculation (calculates percentage of subtasks marked `DONE`).
- [ ] **5.3 Task Scheduling & Workflows:**
  - Workflow Statuses: `BACKLOG`, `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `CANCELLED`.
  - State machine transition rules (e.g. subtasks must be closed or confirmed before closing parent task).
- [ ] **5.4 Multi-Dimensional Query Filtering:**
  - Filter combinations:
    - `?assignee=me|unassigned|<uuid>`
    - `?reporter=<uuid>`
    - `?issueType=BUG|TASK|EPIC`
    - `?dueBefore=...&dueAfter=...`
    - `?priority=URGENT|HIGH|MEDIUM|LOW`
- [ ] **5.5 Automated Integration Tests:**
  - Test assignee assignment, subtask cascade deletion, and hierarchical rollup.

---

### Sprint 6: Issue Dependencies, Blockers & Custom Fields Engine
*Prevents circular project blockers and provides customizable metadata schemas per organization.*

- [ ] **6.1 Database Migration (Dependencies & Custom Fields):**
  - Table: `task_relations`:
    - `id UUID PRIMARY KEY`, `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`
    - `source_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE`
    - `target_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE`
    - `relation_type VARCHAR(20) NOT NULL CHECK (relation_type IN ('BLOCKS', 'BLOCKED_BY', 'RELATES_TO', 'DUPLICATES'))`
    - `UNIQUE (source_task_id, target_task_id, relation_type)`
  - Table: `custom_field_definitions`:
    - `id UUID PRIMARY KEY`, `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`
    - `project_id UUID REFERENCES projects(id) ON DELETE CASCADE` (Null = tenant-wide)
    - `name VARCHAR(50) NOT NULL`, `field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('TEXT', 'NUMBER', 'DROPDOWN', 'DATE', 'MULTI_SELECT'))`
    - `options_json JSONB`, `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
  - Add to `tasks`: `custom_field_values JSONB DEFAULT '{}'::jsonb`.
  - GIN Index: `CREATE INDEX idx_tasks_custom_fields ON tasks USING gin (custom_field_values)`.
- [ ] **6.2 Directed Acyclic Graph (DAG) Blocker Cycle Detection:**
  - `POST /api/v1/tasks/:id/relations` (Creates relation; runs DFS cycle detection in raw SQL / memory to block circular loops like "A blocks B blocks A").
  - `DELETE /api/v1/tasks/:id/relations/:relationId`.
- [ ] **6.3 Custom Fields Definition & Storage APIs:**
  - `POST /api/v1/custom-fields` (Defines custom field schema).
  - Validation middleware: Validates `custom_field_values` against definitions on task creation/update.
- [ ] **6.4 Automated Integration Tests:**
  - Test cycle prevention (returns `400 Bad Request: CIRCULAR_DEPENDENCY_DETECTED`).
  - Test GIN-indexed JSONB querying on custom fields.

---

### Sprint 7: Sprints, Milestones & Scrum/Kanban Cycles
*Enables agile release management, velocity tracking, and burndown data.*

- [ ] **7.1 Database Migration (Sprints):**
  - Table: `sprints`:
    - `id UUID PRIMARY KEY`, `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`
    - `project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE`
    - `name VARCHAR(100) NOT NULL`, `sprint_number INT NOT NULL`
    - `start_date TIMESTAMPTZ`, `end_date TIMESTAMPTZ`
    - `goal TEXT`, `status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED', 'ACTIVE', 'COMPLETED'))`
    - `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
  - Add to `tasks`: `sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL`, `story_points INT`.
- [ ] **7.2 Sprint Lifecycle Management:**
  - `POST /api/v1/projects/:id/sprints` (Create planned sprint).
  - `POST /api/v1/sprints/:id/start` (Starts sprint; enforces invariant: only 1 active sprint per project).
  - `POST /api/v1/sprints/:id/complete` (Completes sprint; moves incomplete tasks to backlog or next sprint).
- [ ] **7.3 Sprint Metrics & Burndown Data:**
  - `GET /api/v1/sprints/:id/burndown` (Calculates ideal vs actual burn of story points/tasks over time).
- [ ] **7.4 Automated Integration Tests:**
  - Test single-active-sprint invariant and rollover mechanics.

---

### Sprint 8: Time Tracking & Worklogs
*Provides accountability for consulting, agencies, and enterprise capacity planning.*

- [ ] **8.1 Database Migration (Worklogs):**
  - Table: `task_worklogs`:
    - `id UUID PRIMARY KEY`, `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`
    - `task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE`
    - `user_id UUID NOT NULL REFERENCES users(id)`
    - `time_spent_seconds INT NOT NULL CHECK (time_spent_seconds > 0)`
    - `started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
    - `description TEXT`, `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
- [ ] **8.2 Worklog Endpoints & Rollup Trigger:**
  - `POST /api/v1/tasks/:id/worklogs` (Logs time; atomically increments `logged_hours` on parent task).
  - `GET /api/v1/tasks/:id/worklogs` (Lists time logs for task).
  - `DELETE /api/v1/worklogs/:id` (Decrements `logged_hours`).
- [ ] **8.3 Automated Integration Tests:**
  - Test atomic hour aggregation and validation.

---

## Phase 4: Collaboration, Communication & Media

### Sprint 9: Human-Readable Changelogs, Mentions & Activity Stream
*Provides full visibility into who changed what, with automated team mention notifications.*

- [ ] **9.1 Database Migration (Activity Feed):**
  - Table: `task_activities`:
    - `id UUID PRIMARY KEY`, `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
    - `task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE`
    - `actor_id UUID NOT NULL REFERENCES users(id)`
    - `action VARCHAR(50) NOT NULL` (e.g., `STATUS_CHANGED`, `ASSIGNEE_UPDATED`, `COMMENT_ADDED`)
    - `field_name VARCHAR(50)`, `old_value TEXT`, `new_value TEXT`
    - `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
  - Index: `idx_task_activities_task ON task_activities(task_id, created_at DESC)`.
- [ ] **9.2 Automated Change Interceptor / Audit Service:**
  - Automatically captures field diffs on every `PATCH /api/v1/tasks/:id` (e.g. status changed from `TODO` to `DONE`, assignee changed from `Alice` to `Bob`).
  - `GET /api/v1/tasks/:id/activity` (Returns paginated chronological timeline).
- [ ] **9.3 Mentions Parsing Engine:**
  - Parser utility that scans task descriptions and comments for `@username` patterns.
  - Automatically identifies mentioned users and triggers in-app and email notifications.

---

### Sprint 10: Direct-to-Storage Attachments (S3 / Cloudflare R2 Presigned URLs)
*Zero-memory buffering file upload engine for screenshots, design assets, and logs.*

- [ ] **10.1 Database Migration (Attachments):**
  - Table: `attachments`:
    - `id UUID PRIMARY KEY`, `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`
    - `task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE`
    - `uploaded_by UUID NOT NULL REFERENCES users(id)`
    - `file_name VARCHAR(255) NOT NULL`, `file_size_bytes BIGINT NOT NULL`
    - `mime_type VARCHAR(100) NOT NULL`, `storage_key VARCHAR(500) NOT NULL UNIQUE`
    - `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
- [ ] **10.2 Presigned S3/R2 Storage Integration:**
  - Integrate AWS SDK v3 S3 client (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`).
  - `POST /api/v1/tasks/:id/attachments/presign`:
    - Validates file extension, mime type, and 25MB maximum size.
    - Generates short-lived (15 min) S3 PUT presigned URL.
  - `POST /api/v1/tasks/:id/attachments/complete`:
    - Confirms client upload, creates record in `attachments`, logs entry to `task_activities`.
  - `GET /api/v1/attachments/:id/download`:
    - Generates secure S3 GET presigned download URL with `Content-Disposition`.
  - `DELETE /api/v1/attachments/:id`:
    - Removes metadata and enqueues background job to delete binary from S3 bucket.

---

### Sprint 11: In-App Notification Center & User Alert Preferences
*Ensures users never miss critical updates or assignments.*

- [ ] **11.1 Database Migration (Notifications & Preferences):**
  - Table: `notifications`:
    - `id UUID PRIMARY KEY`, `tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE`
    - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
    - `actor_id UUID REFERENCES users(id)`
    - `type VARCHAR(50) NOT NULL` (`TASK_ASSIGNED`, `MENTIONED`, `COMMENT_ADDED`, `PROJECT_ADDED`, `STATUS_CHANGED`)
    - `entity_type VARCHAR(30) NOT NULL` (`TASK`, `PROJECT`, `COMMENT`)
    - `entity_id UUID NOT NULL`
    - `title VARCHAR(255) NOT NULL`, `message TEXT NOT NULL`
    - `is_read BOOLEAN NOT NULL DEFAULT FALSE`, `read_at TIMESTAMPTZ`
    - `created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`
  - Table: `user_notification_preferences (user_id UUID PK, email_on_assignment BOOLEAN, email_on_mention BOOLEAN, in_app_sound BOOLEAN)`.
- [ ] **11.2 Notification Endpoints:**
  - `GET /api/v1/notifications` (Returns paginated inbox, supports `?unread=true` filter and includes unread count badge).
  - `PATCH /api/v1/notifications/:id/read` (Marks single item as read).
  - `PATCH /api/v1/notifications/read-all` (Marks all items read for current user in current tenant).
  - `DELETE /api/v1/notifications/:id` (Dismisses notification).
- [ ] **11.3 Event Dispatcher Pipeline:**
  - Hooks into task assignment, mentions, and project additions to dispatch both in-app notification rows and asynchronous BullMQ emails.

---

### Sprint 12: Real-Time Event Gateway (Server-Sent Events / WebSockets)
*Enables instant collaborative sync across multiple browser tabs without polling.*

- [ ] **12.1 Redis Pub/Sub Event Mesh:**
  - Build central Redis event publisher and subscriber service (`src/lib/realtime.ts`).
  - Scoped pub/sub channels: `tenant:<tenantId>:events` and `project:<projectId>:events`.
- [ ] **12.2 Server-Sent Events (SSE) Stream Endpoint:**
  - `GET /api/v1/realtime/stream` (Keeps long-lived HTTP connection open with standard HTTP chunking, sends periodic 15-second heartbeat ping comments).
  - Client sends `Authorization: Bearer <JWT>` and `X-Tenant-ID`.
  - Distributes events in real-time: `task.created`, `task.updated`, `task.assigned`, `comment.created`, `notification.new`.
- [ ] **12.3 Connection Manager & Graceful Shutdown:**
  - Closes active client sockets on server SIGTERM/SIGINT without orphan connection leaks.

---

## Phase 5: Enterprise Governance, Billing & Developer Platform

### Sprint 13: Subscription Billing, Metering & Quotas (Stripe Integration)
*Turn the API into a revenue-generating commercial B2B platform with seat-based billing.*

- [ ] **13.1 Database Migration (Subscriptions & Quotas):**
  - Table: `tenant_subscriptions`:
    - `tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE`
    - `stripe_customer_id VARCHAR(100) NOT NULL UNIQUE`
    - `stripe_subscription_id VARCHAR(100) UNIQUE`
    - `plan_tier VARCHAR(20) NOT NULL DEFAULT 'FREE' CHECK (plan_tier IN ('FREE', 'PRO', 'ENTERPRISE'))`
    - `status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'`
    - `current_period_end TIMESTAMPTZ`
    - `seat_count INT NOT NULL DEFAULT 5`
- [ ] **13.2 Stripe Customer & Checkout Session Flow:**
  - `POST /api/v1/billing/checkout` (Generates Stripe Checkout session for upgrading to Pro/Enterprise).
  - `POST /api/v1/billing/portal` (Generates Stripe Customer Portal session for updating cards/invoices).
- [ ] **13.3 Stripe Webhook Processing (BullMQ Isolated Queue):**
  - Endpoint: `POST /api/v1/billing/webhook` (Verifies Stripe HMAC signature via `stripe.webhooks.constructEvent`).
  - Enqueues event into BullMQ `billing` queue.
  - Handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
- [ ] **13.4 Quota & Feature Gating Middleware (`src/middleware/quota.ts`):**
  - Blocks adding members if tenant exceeds subscribed `seat_count`.
  - Restricts Webhook endpoints and Audit Log verification to `PRO` and `ENTERPRISE` tiers.
- [ ] **13.5 Automated Integration Tests:**
  - Test webhook signature validation and seat quota enforcement.

---

### Sprint 14: Data Export, Retention & GDPR Compliance
*Guarantees enterprise data portability, legal hold, and privacy compliance.*

- [ ] **14.1 Workspace Bulk Data Export Engine:**
  - `POST /api/v1/tenants/:id/export` (`requireRole('OWNER')`, enqueues BullMQ export job).
  - Worker queries all projects, tasks, comments, labels, and audit logs, streams into a structured JSON/CSV bundle, compresses into an AES-encrypted ZIP file, uploads to S3, and emails a secure 24-hour download link.
- [ ] **14.2 Soft-Delete & Recycle Bin Retention:**
  - Soft delete on projects and tasks (`deleted_at TIMESTAMPTZ`).
  - `GET /api/v1/trash` & `POST /api/v1/trash/:id/restore` (30-day restore window before automated background hard-delete).
- [ ] **14.3 GDPR Right to Erasure (User Anonymization):**
  - `POST /api/v1/users/me/anonymize` (Scrubs email, full name, phone number; replaces comment authors with `[Deleted User]`).

---

### Sprint 15: Public Developer API & Automated OpenAPI 3.1 Documentation
*Exposes a world-class public API platform for external integrations and developer ecosystems.*

- [ ] **15.1 Fine-Grained Scopes Expansion for PATs:**
  - Expand `pat.ts` with granular scopes:
    - `issues:read`, `issues:write`
    - `projects:read`, `projects:write`
    - `members:read`, `members:write`
    - `webhooks:admin`
- [ ] **15.2 Tiered Rate Limiting:**
  - Sliding-window Redis Lua limiter configured per subscription plan:
    - `FREE`: 60 requests/minute
    - `PRO`: 600 requests/minute
    - `ENTERPRISE`: 3,000 requests/minute
- [ ] **15.3 OpenAPI 3.1 Specification & Swagger UI:**
  - Automated contract generation from Zod schemas.
  - Mount `/docs` (Swagger UI) and `/openapi.json` endpoint.

---

## Execution Order Dependency Graph

```
Sprint 1: Identity & Sessions ──────► Sprint 2: 2FA / MFA (TOTP, Phone, Backup)
                │                                       │
                ▼                                       ▼
Sprint 3: Workspace & Invites ──────► Sprint 4: Two-Tier Authorization (Projects)
                │                                       │
                ▼                                       ▼
Sprint 5: Issues, Hierarchy & Epics ─► Sprint 6: Blockers (DAG) & Custom Fields
                │                                       │
                ▼                                       ▼
Sprint 7: Sprints & Burndown ───────► Sprint 8: Worklogs & Time Tracking
                │                                       │
                ▼                                       ▼
Sprint 9: Activity & Mentions ──────► Sprint 10: S3/R2 Attachments
                │                                       │
                ▼                                       ▼
Sprint 11: In-App Notifications ────► Sprint 12: Real-Time SSE Gateway
                │                                       │
                ▼                                       ▼
Sprint 13: Stripe Subscriptions ────► Sprint 14: Data Export & GDPR
                                                        │
                                                        ▼
                                      Sprint 15: Public API & OpenAPI 3.1
```

---

## Verification & Definition of Done for Every Sprint

1. **Strict TypeScript:** Clean compile with zero errors (`npm run build`).
2. **ESLint 9 Flat Config:** Zero warnings, zero `any` types, zero `console.log` statements (`npm run lint`).
3. **Adversarial Integration Tests:** Every single endpoint covered by automated tests verifying happy paths, edge cases, permission violations (403), and token expiration (`npm test`).
4. **Zero ORMs:** All queries written in raw SQL with parameterization (`$1, $2`).
5. **Observability:** Custom Prometheus metrics and OpenTelemetry trace spans registered for each major subsystem.
