# Senior Backend Engineering Master Series: 10 Projects

> **Learner:** PJ Sudhakar  
> **Target:** Senior Backend Engineer & Distributed Systems Architect  
> **Philosophy:** No cargo-culting. Design documents first, interactive file-by-file mentorship, raw drivers (no ORMs), deep SQL, and adversarial chaos testing. You code everything yourself.

---

## The 10-Project Blueprint

| # | Project Specification | Domain | Key Architecture & Storage | Primary Techniques Learned |
|:---:|---|---|---|---|
| **1** | [01-project-saas-api.md](file:///c:/Users/DMC/Desktop/be/docs/01-project-saas-api.md) | Multi-Tenant SaaS (Linear/Jira) | PostgreSQL (RLS), Redis | Raw SQL, RLS Isolation, RS256 JWT, Refresh Rotation, BullMQ, Idempotency |
| **2** | [02-project-realtime-collaborative-editor.md](file:///c:/Users/DMC/Desktop/be/docs/02-project-realtime-collaborative-editor.md) | Collaborative Workspace (Google Docs) | Redis (Pub/Sub + Streams), PostgreSQL | Raw WebSockets, Horizontal Socket Scaling, Presence, Optimistic Locking, JSONB |
| **3** | [03-project-ecommerce-payments-ledger.md](file:///c:/Users/DMC/Desktop/be/docs/03-project-ecommerce-payments-ledger.md) | High-Concurrency Checkout & Ledger | PostgreSQL (ACID), Redis | Double-Entry Bookkeeping, `SELECT FOR UPDATE`, Transactional Outbox, Redlock |
| **4** | [04-project-video-streaming-platform.md](file:///c:/Users/DMC/Desktop/be/docs/04-project-video-streaming-platform.md) | Video Streaming & Transcoding (YouTube) | Cloudflare R2 / MinIO, MongoDB, Redis | Presigned S3 URLs, FFmpeg Workers, HLS Chunking, tus Resumable, BRIN Indexes |
| **5** | [05-project-search-recommendation-engine.md](file:///c:/Users/DMC/Desktop/be/docs/05-project-search-recommendation-engine.md) | Catalog Search & AI Discovery (Amazon) | OpenSearch, PostgreSQL (`pgvector`) | Inverted Indexes, BM25, HNSW Vectors, Reciprocal Rank Fusion (RRF), CDC Sync, **Caching Deep-Dive** |
| **6** | [06-project-geo-location-dispatch.md](file:///c:/Users/DMC/Desktop/be/docs/06-project-geo-location-dispatch.md) | Fleet Dispatch & Tracking (Uber) | PostGIS, Redis GEO, Uber H3 | Spatial GiST R-Trees, H3 Hexagons, In-Memory Fleet Tracking, Geofencing, PIP |
| **R** | Lab R (see Curriculum Review below) | Replicated KV Store (etcd-lite) | Node.js / Go, Toxiproxy | Raft Consensus, Leader Election, Quorums, Fencing Tokens, Partitions |
| **7** | [07-project-microservices-logistics.md](file:///c:/Users/DMC/Desktop/be/docs/07-project-microservices-logistics.md) | Order Logistics Microservices (FedEx) | Apache Kafka, Polyglot DBs | gRPC & Protobuf, Partitioned Kafka, Orchestrated Sagas, Compensations, Circuit Breakers |
| **8** | [08-project-analytics-data-platform.md](file:///c:/Users/DMC/Desktop/be/docs/08-project-analytics-data-platform.md) | High-Throughput Stream OLAP (Mixpanel) | ClickHouse (MergeTree), DuckDB, Parquet | Columnar Storage, Micro-Batching, Node.js Backpressure, Window Functions, Rollups |
| **9** | [09-project-api-gateway-bff.md](file:///c:/Users/DMC/Desktop/be/docs/09-project-api-gateway-bff.md) | Cloud-Native Edge Gateway & Mesh (Kong) | Fastify, Redis (Lua) | Dynamic Reverse Proxy, Distributed Token Bucket, REST-to-gRPC, DataLoader |
| **10**| [10-project-cicd-reliability-engineering.md](file:///c:/Users/DMC/Desktop/be/docs/10-project-cicd-reliability-engineering.md) | SRE Platform & Chaos Engine (Google SRE) | Kubernetes, Prometheus, Grafana | Expand/Contract Migrations, Canary Deployments, Toxiproxy Chaos, SLO Burn Alerts |

---

## Mentorship Rules & Standard of Work
1. **Interactive Mentorship:** You write and execute every command and line of code yourself. The mentor's role is to explain the architectural theory, trade-offs, SQL query plans, and edge cases, providing exact snippets and commands in chat.
2. **Design First:** Every feature starts with requirements, capacity estimation, domain event storming, data modeling, and ADRs before writing code.
3. **No ORMs:** Raw SQL with drivers (`pg`, ClickHouse client, etc.) to develop genuine mastery over queries, execution plans (`EXPLAIN ANALYZE`), and index mechanics.
4. **Adversarial Testing:** Every project concludes with a verification lab (concurrency stress tests, chaos fault injection, RLS bypass attempts) to mathematically prove the system works under pressure.
5. **Ship Every Project (added 2026-11-25):** From Project #1 on, every project has CI (typecheck, lint, migrate, test, image build) and is deployed somewhere real. Project #10 deepens this (Kubernetes, canaries, chaos); it does not introduce it.
6. **Design Doc Before Code (added 2026-11-25):** Each project starts with a 1–2 page design doc written by the learner: requirements, capacity estimates derived by hand (not copied from the spec), a component diagram, data model, and the top 3 failure modes. For system design, the diagram and the written trade-offs are the skill being practiced, not an optional extra.

---

## Curriculum Review & Gap Analysis (2026-11-25)

**Overall verdict:** Strong syllabus. The domains are varied, each project has a clear core mechanic, the adversarial labs are excellent, and the no-ORM / read-the-query-plan rule is right. The changes below close the largest knowledge gaps and fix ordering problems.

### Structural Changes

| # | Issue | Change |
|---|---|---|
| S1 | CI/CD, Docker, and deploys only arrive in Project #10 | Basic CI + deploy from Project #1 (see rule 5). Project #10 keeps K8s, canary, chaos, and SLO burn alerts. |
| S2 | No dedicated **caching** coverage (the most-asked system design topic) | Add a caching milestone to Project #1 (cache-aside on membership/PAT lookups) and a full caching milestone to Project #5 (see below). |
| S3 | Almost no **replication / partitioning / DB internals** | Add a Database Internals milestone to Project #3 and a sharding milestone to Project #6 (see below). |
| S4 | No **distributed systems theory** (consensus, clocks, quorum) | Add the Raft lab below, between Projects #6 and #7. |
| S5 | CDC via Debezium (Project #5) needs Kafka, which arrives in Project #7 | Project #5 uses a polling outbox → OpenSearch; Debezium/Kafka CDC is revisited as a stretch goal in Project #7. |
| S6 | Outbox repeated in #3, #5, #7; idempotency in #1, #3 | Outbox is now introduced in Project #1 (roadmap item 0.9). #3 deepens it (SKIP LOCKED relay at scale), #7 does it per service with Kafka. Avoid re-teaching the basics. |

### Knowledge Gaps & Where They Now Live

| Gap | Topics | Home |
|---|---|---|
| **Caching** | Cache-aside vs read/write-through vs write-behind, stampede / single-flight / request coalescing, TTL jitter, negative caching, hot keys, invalidation strategies, CDN tiers, consistency windows | P1 (roadmap 0.21), P5 Milestone 7, P9 Milestone 6 |
| **Postgres internals & isolation** | MVCC, READ COMMITTED vs REPEATABLE READ vs SERIALIZABLE, write skew & phantom reads, `40001` retries, vacuum/bloat, WAL, HOT updates | P3 Milestone 0 |
| **Replication** | Streaming replicas, replication lag, read-your-writes, monotonic reads, failover | P3 Milestone 6 addendum, P10 |
| **Sharding** | Hash vs range partitioning, consistent hashing, hot partitions, re-sharding, cross-shard queries (Citus or hand-rolled routing) | P6 Milestone 7 |
| **Consensus & clocks** | Raft leader election + log replication, quorums, split brain, fencing tokens, Lamport/vector clocks, CAP/PACELC | Lab R (below) |
| **Event sourcing / CQRS** | Event store, projections, snapshots, rebuilding read models | P3 Milestone 7 |
| **Wide-column NoSQL** | Partition-key design, query-first modeling, tunable consistency (Cassandra/ScyllaDB) | P2 (chat history) |
| **Classic design problems** | News feed fan-out (write vs read), ID generation (Snowflake), URL shortener, notification system, distributed scheduler | Sprint 9 of P1 (fan-out), P2 (Snowflake IDs), P4 (scheduler/cleanup), Lab R write-ups |
| **Identity federation** | OAuth2/OIDC + PKCE, SSO, SAML/SCIM concepts | P1 new OIDC sprint |
| **Cloud & networking basics** | TCP, TLS handshake, HTTP/2 vs HTTP/3, DNS, L4 vs L7 load balancing, VPC/IAM, Terraform | P9 (networking), P10 (IaC) |
| **Secrets & key management** | Envelope encryption, KMS/Vault, key rotation | P1 (0.22, 0.23), P10 |
| **Testing breadth** | Unit vs integration, Testcontainers, contract testing (Pact), property-based tests | P1 (0.18), P7 |

### Lab R: Replicated Key-Value Store with Raft (between Projects #6 and #7, ~2–3 weeks)

A small, focused lab, not a full project. Build a 3–5 node KV store in Node.js (or Go, if you want a second language):

1. Leader election with randomized timeouts; terms; persisting `currentTerm`/`votedFor`.
2. Log replication and the commit index; linearizable reads via the leader (read index or lease).
3. Fault labs: kill the leader, partition the network (Toxiproxy), restart a node with a stale log. Prove no committed write is lost and no split-brain write is accepted.
4. Write-up: CAP/PACELC position of your store; why Redlock without fencing tokens is unsafe (links to P3/P6 locking).

Reference: the Raft paper ("In Search of an Understandable Consensus Algorithm") and its visualization.
