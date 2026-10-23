# Project #10: Production SRE, Kubernetes, Chaos Engineering & CI/CD

> **Role in Series:** The Production Readiness & Reliability Engineering Project.  
> **Domain Analogy:** Production-grade SRE platform, deployment automation, and chaos testing infrastructure (Google / Netflix SRE platform).  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
A backend codebase that runs only on a developer's local machine is not a production system. In real-world enterprise operations:
1. **Downtime During Database Migrations:** Running an `ALTER TABLE users ADD COLUMN phone VARCHAR NOT NULL DEFAULT ''` locks the entire table for minutes, queuing queries and knocking production offline.
2. **Untracked Production Outages:** Services crash silently or leak memory without triggering alerts until customers complain on Twitter.
3. **Flaky Deployments & Rollback Failures:** Deploying a new version directly replaces existing code. If the new version contains a fatal bug, 100% of users experience broken software until an emergency manual rollback.
4. **Cascading Network Partitions & Chaos:** Real cloud networks drop packets, databases undergo failovers, and disks fill up. Unprepared systems suffer unrecoverable cascade crashes.

### The Solution
A **Production-Ready Site Reliability Engineering (SRE) & CI/CD Platform**. Services are packaged into hardened, multi-stage, non-root **Docker containers** orchestrated on **Kubernetes (k8s)** with automated **Canary & Blue/Green Deployments**. Database migrations follow the **Expand/Contract Pattern with `CREATE INDEX CONCURRENTLY`**. The entire stack is instrumented with **OpenTelemetry, Prometheus, and Grafana** with alerts tied to **SLO Error Budget Burn Rates**, and verified under fire through **Chaos Engineering (Toxiproxy)**.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | Multi-Stage Hardened Docker Builds (Non-Root) | Drastically reduces image attack surface, excludes devDependencies, and runs as an unprivileged user (UID 10001). | Running single-stage images or root containers. |
| **ADR-0002** | The Expand / Contract Migration Pattern | Ensures database schema changes are backward-compatible with the currently running application code before new code deploys. | Direct destructive migrations (`ALTER TABLE DROP/RENAME COLUMN`). |
| **ADR-0003** | `CREATE INDEX CONCURRENTLY` for Migrations | Builds PostgreSQL indexes without acquiring an exclusive `SHARE` table lock, ensuring active traffic is uninterrupted. | Standard `CREATE INDEX` (locks tables on large datasets). |
| **ADR-0004** | Canary Deployments with Traffic Weighting | Routes 5% of real user traffic to the new version first; automatically rolls back if error rate spikes. | All-at-once Big-Bang deployments. |
| **ADR-0005** | Service Level Objectives (SLOs) & Error Budget Alerting | Alerts fire only when the 30-day error budget is burning too quickly, eliminating alert fatigue. | Simple static threshold alerts (e.g. "alert if CPU > 80%"). |
| **ADR-0006** | Chaos Engineering via Toxiproxy | Injects latency, jitter, connection drops, and bandwidth limits locally to test failover automation. | Waiting for real AWS/GCP cloud outages to find out if graceful degradation works. |

---

## 3. The 4 SRE Golden Signals & SLO Definitions

| Signal | Metric / Prometheus Query | Target SLO | 30-Day Error Budget |
|---|---|---|---|
| **Latency** | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` | p99 < 150ms | 1% of requests may exceed 150ms. |
| **Traffic** | `sum(rate(http_requests_total[5m]))` | Normal operating bounds: 500 - 5,000 QPS | Capacity alerts when approaching 80% max threshold. |
| **Errors** | `sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` | 99.9% Success Rate (Three Nines) | 0.1% allowed failures (~43.2 minutes downtime/month). |
| **Saturation** | Database pool utilization & Node.js Event Loop Lag (`nodejs_eventloop_lag_seconds`) | Event loop lag < 20ms | Flags CPU starvation before memory exhaustion occurs. |

---

## 4. The Expand / Contract Database Migration Pattern

```
PHASE 1: EXPAND (Additive & Backward-Compatible)
  • Database: Add new nullable column `full_name` alongside old `name`
  • Code Version 1.0 (Currently Running): Still reads/writes `name`
  • Trigger / Code: Writes to BOTH `name` and `full_name`

PHASE 2: DEPLOY VERSION 1.1 (Dual-Write / Read New)
  • Code Version 1.1: Reads from `full_name`, falls back to `name`
  • Background: Backfill old rows (`UPDATE users SET full_name = name WHERE full_name IS NULL;`)

PHASE 3: DEPLOY VERSION 1.2 (Strictly New)
  • Code Version 1.2: Reads and writes ONLY `full_name`
  • Zero references to old column `name` remain in active code

PHASE 4: CONTRACT (Cleanup)
  • Database: Safely drop old column `ALTER TABLE users DROP COLUMN name;`
  • ZERO downtime experienced during the entire cycle!
```

---

## 5. Kubernetes Architecture & Canary Lifecycle

```
[Ingress Controller (NGINX / Envoy)]
       │
       │ Traffic Split: 90% Main / 10% Canary
       ├──────────────────────────────────────────┐
       │ (90% Traffic)                            │ (10% Traffic)
       ▼                                          ▼
┌─────────────────────────┐                ┌─────────────────────────┐
│ Service: backend-prod   │                │ Service: backend-canary │
└────────────┬────────────┘                └────────────┬────────────┘
             │                                          │
             ▼                                          ▼
┌─────────────────────────┐                ┌─────────────────────────┐
│ Pod: App v1.0.0         │                │ Pod: App v1.1.0         │
│  • Liveness: /health    │                │  • Liveness: /health    │
│  • Readiness: /ready    │                │  • Readiness: /ready    │
│  • Metrics: /metrics    │                │  • Metrics: /metrics    │
└─────────────────────────┘                └────────────┬────────────┘
                                                        │
                                                        ▼ (OTel / Prometheus)
                                           ┌─────────────────────────┐
                                           │ Automated Canary Check  │
                                           │ If 5xx rate > 0.1%:     │
                                           │ -> ROLLBACK TO v1.0.0!  │
                                           │ If healthy for 10m:     │
                                           │ -> PROMOTE TO 100%!     │
                                           └─────────────────────────┘
```

---

## 6. Implementation Milestones

```
Milestone 1: Hardened Containerization & Graceful Shutdown
├── Multi-stage Dockerfile: Building TypeScript, stripping devDependencies, alpine base
├── Non-root user permissions (running as `USER appuser` with UID 10001)
├── OS signal handling: Graceful shutdown on `SIGTERM` / `SIGINT`
│   └── Stop accepting new requests → Drain in-flight HTTP → Close DB pools → Exit 0
└── Docker container health check scripts

Milestone 2: Kubernetes Manifests & Pod Lifecycle
├── Kubernetes Deployments, ClusterIP Services, ConfigMaps, and Secrets
├── Liveness Probe (`/health` checks process) vs Readiness Probe (`/ready` checks DB & Redis)
├── Resource Requests & Limits (preventing noisy-neighbor CPU starvation and OOM kills)
└── Horizontal Pod Autoscaler (HPA) scaling pods based on CPU and request latency

Milestone 3: Automated CI/CD Pipeline (GitHub Actions)
├── Automated test execution (Vitest, supertest) on pull requests
├── Static security scanning: Trivy container vulnerability scanner & ESLint
├── Automated container image tagging via Git SHA
└── Ephemeral branch environments (spin-up, test, destroy)

Milestone 4: Zero-Downtime Database Migrations
├── Writing Expand/Contract migrations using `node-pg-migrate`
├── `CREATE INDEX CONCURRENTLY` automation scripts
├── Batch backfill workers: Updating historical data in chunks of 1,000 rows without locking
└── Database disaster recovery: Backup and point-in-time recovery (PITR) drills

Milestone 5: Production Observability, Alerting & SLOs
├── Prometheus scraping setup and RED metrics collection
├── Production Grafana dashboards: Latency percentiles (p50, p95, p99), error rates, QPS
├── Error Budget Burn Rate alerts: Routing high-priority pages to On-Call
└── Distributed tracing via OpenTelemetry with baggage and trace context

Milestone 6: Chaos Engineering & Incident Postmortems
├── Toxiproxy integration: Simulating 500ms network latency and dropped TCP packets
├── Killing random Kubernetes pods under heavy load and verifying zero dropped requests
├── Load testing maximum cluster breaking point with k6
└── Writing a formal blameless incident postmortem for an injected disaster
```

---

## 7. Failure Modes & Adversarial Verification Labs

1. **The SIGTERM In-Flight Request Drain Test:** Fire a slow 5-second request to a pod. Issue a `kubectl delete pod` command. Verify that the pod does not instantly kill the connection, finishes processing the in-flight request successfully, and exits cleanly.
2. **The Automated Canary Rollback Test:** Deploy a canary version containing an intentional 500 error triggered on 5% of requests. Verify that the monitoring loop detects the error budget burn, halts deployment, purges the canary pod, and leaves the stable version running with zero manual intervention.
3. **The Database Migration Lock Contention Test:** Execute a continuous 500 QPS read/write load test with k6 while running a schema migration. Verify that the migration uses `CREATE INDEX CONCURRENTLY` and non-locking column additions, resulting in zero query timeouts (`504 Gateway Timeout`) during the rollout.
