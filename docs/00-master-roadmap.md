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
| **5** | [05-project-search-recommendation-engine.md](file:///c:/Users/DMC/Desktop/be/docs/05-project-search-recommendation-engine.md) | Catalog Search & AI Discovery (Amazon) | OpenSearch, PostgreSQL (`pgvector`) | Inverted Indexes, BM25, HNSW Vectors, Reciprocal Rank Fusion (RRF), CDC Sync |
| **6** | [06-project-geo-location-dispatch.md](file:///c:/Users/DMC/Desktop/be/docs/06-project-geo-location-dispatch.md) | Fleet Dispatch & Tracking (Uber) | PostGIS, Redis GEO, Uber H3 | Spatial GiST R-Trees, H3 Hexagons, In-Memory Fleet Tracking, Geofencing, PIP |
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
