# Project #8: Real-Time Stream Analytics & High-Throughput OLAP Engine

> **Role in Series:** The Data Engineering & OLAP Project.  
> **Domain Analogy:** A production-grade real-time product analytics, metrics, and business intelligence platform (Mixpanel / Datadog / PostHog analytics engine).  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
Transactional databases (PostgreSQL/MySQL) are engineered for **OLTP** (Online Transaction Processing): reading and writing complete individual rows with ACID guarantees.
1. **The Row-Store Aggregation Bottleneck:** An analytical query calculating the 99th percentile checkout duration or monthly revenue across 50,000,000 orders requires scanning every column of every row from disk. In PostgreSQL, this requires minutes and pegs disk I/O at 100%.
2. **High-Velocity Write Amplification:** Ingesting 25,000 analytics/telemetry events per second into a row-oriented B-Tree table results in massive random write amplification and memory page churn.
3. **Eventual Consistency & Deduplication in Big Data:** Clickstream events transmitted from mobile clients can arrive out of order, hours late, or duplicated due to retry storms.
4. **Historical Backfills vs. Real-Time Streaming:** Business intelligence requires both streaming real-time metrics (last 5 minutes) and historical batch aggregations (last 3 years).

### The Solution
A **Modern Analytical Data Platform (OLAP)**. Streaming events are buffered in memory and micro-batched into a **Columnar Database (ClickHouse / DuckDB)**. Storage utilizes **Log-Structured Merge-Trees (MergeTree engines)** for high write throughput and 10x columnar data compression. Complex aggregations are computed in sub-seconds using **Advanced Analytical SQL (Window functions, CTEs, GROUPING SETS)**, materialized views, and Parquet data lakes.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | ClickHouse as the Primary OLAP Engine | Columnar storage with SIMD vectorized query execution. Aggregates billions of rows in milliseconds. | Running analytical queries on PostgreSQL read replicas (crushes replica CPU/RAM). |
| **ADR-0002** | Micro-Batching with Node.js Streams & Backpressure | Buffers incoming events in memory and inserts in blocks of 5,000 rows. Prevents fragmented tiny disk writes. | Single-row inserts into ClickHouse (causes "Too many parts" error). |
| **ADR-0003** | DuckDB for In-Process Embedded Analytics | Embedded SQL OLAP engine inside worker processes for fast local transformations and Parquet file queries. | Spinning up heavyweight analytical clusters for lightweight local jobs. |
| **ADR-0004** | Apache Parquet for Long-Term Cold Storage | Highly-compressed columnar file format stored in cheap S3/R2 object storage for archival data lakes. | Storing raw JSON or CSV files in object storage. |
| **ADR-0005** | Materialized Views with Continuous Aggregations | Pre-calculates hourly and daily rollups on write time, reducing dashboard query time to < 5ms. | Calculating aggregations from raw events on every dashboard page load. |
| **ADR-0006** | Slowly Changing Dimensions (SCD Type 2) | Preserves full audit history of dimensional changes (e.g. tracking customer plan upgrades over time). | Overwriting dimensional attributes (loses historical attribution accuracy). |

---

## 3. Back-of-the-Envelope Capacity Planning

| Metric | Target | Derived Math & Constraints |
|---|---|---|
| **Event Ingestion Velocity** | 25,000 Events / Sec Peak | 10,000 events/sec average = ~864,000,000 events/day. |
| **Raw Event Size** | ~500 Bytes (JSON) | 864M * 500 bytes ≈ 432 GB raw uncompressed JSON/day. |
| **Columnar Compression Ratio** | ~5x to 8x Reduction | ClickHouse LZ4 / ZSTD compression reduces 432 GB down to ~60 GB compressed disk storage/day. |
| **Micro-Batch Flush Trigger** | 5,000 Rows OR 500ms | Whichever threshold is hit first to keep RAM bounded while preventing tiny disk parts. |
| **Dashboard Query SLA** | p95 < 200ms | Achieved via materialized aggregate tables and columnar compression. |

---

## 4. System Architecture & The Ingestion Pipeline

```
                               CLIENT CLICKSTREAM / TELEMETRY
                                             │ (25,000 events/sec)
                                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│ High-Throughput HTTP Ingestion Gateway                                 │
│  • Fast body validation (Zod / Schemas)                                │
│  • Appends to Node.js Transform Stream with Backpressure               │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│ In-Memory Micro-Batching Buffer                                        │
│  • Flushes when: Count >= 5,000 OR Elapsed >= 500ms                   │
│  • Backpressure signal: Throttles HTTP ingress if buffer overflows     │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼ (Bulk Insert Stream)
┌────────────────────────────────────────────────────────────────────────┐
│ ClickHouse Columnar Database (OLAP)                                    │
│  • Engine: `ReplacingMergeTree` (Deduplication on primary key)         │
│  • Columnar compression (ZSTD / LZ4)                                   │
│  • Vectorized SIMD query execution                                     │
└──────────────┬──────────────────────────────────────────┬──────────────┘
               │                                          │
               ▼ (Continuous Background Aggregation)      ▼ (Cold Storage)
┌───────────────────────────────────┐    ┌─────────────────────────────────┐
│ Materialized Views (Rollups)      │    │ Parquet Data Lake (S3/R2)       │
│  • Hourly active users (HLL)      │    │  • Daily partitioned Parquet    │
│  • Revenue & conversion metrics   │    │  • Queried via DuckDB           │
└───────────────────────────────────┘    └─────────────────────────────────┘
```

---

## 5. Columnar Data Modeling & Advanced SQL

### ClickHouse Schema (Raw Events with MergeTree Engine)
```sql
CREATE TABLE events (
    event_id UUID,
    tenant_id UUID,
    user_id UUID,
    event_name LowCardinality(String), -- Dictionary-encoded string for high compression
    properties String, -- JSON string or Tuple
    duration_ms UInt32,
    occurred_at DateTime64(3, 'UTC'),
    created_date Date DEFAULT toDate(occurred_at)
)
ENGINE = ReplacingMergeTree(occurred_at)
PARTITION BY toYYYYMM(created_date)
ORDER BY (tenant_id, event_name, occurred_at, event_id);
```

### Advanced Analytical SQL: Window Functions & Retention Funnels
```sql
-- 7-Day User Conversion Funnel using Window Functions
WITH step_activity AS (
    SELECT 
        user_id,
        event_name,
        occurred_at,
        ROW_NUMBER() OVER (PARTITION BY user_id, event_name ORDER BY occurred_at) AS step_rank
    FROM events
    WHERE occurred_at >= NOW() - INTERVAL 7 DAY
)
SELECT 
    event_name,
    COUNT(DISTINCT user_id) AS unique_users,
    LAG(COUNT(DISTINCT user_id), 1) OVER (ORDER BY MIN(occurred_at)) AS previous_step_users
FROM step_activity
GROUP BY event_name;
```

---

## 6. Implementation Milestones

```
Milestone 1: Advanced Relational SQL for Analytics (PostgreSQL)
├── Window functions (`ROW_NUMBER`, `RANK`, `DENSE_RANK`, `LAG`, `LEAD`)
├── Common Table Expressions (CTEs) & Recursive CTEs for organizational hierarchy
├── `GROUPING SETS`, `CUBE`, and `ROLLUP` for multi-dimensional aggregations
└── Lateral Joins (`CROSS JOIN LATERAL`) for correlated subqueries

Milestone 2: ClickHouse Setup & Columnar Architecture
├── ClickHouse cluster deployment and database configuration
├── Understanding Columnar storage vs Row storage internals
├── The `MergeTree` family: `ReplacingMergeTree`, `SummingMergeTree`, `AggregatingMergeTree`
└── Data compression codecs: LZ4, ZSTD, Delta, DoubleDelta

Milestone 3: High-Throughput Streaming Ingestion & Backpressure
├── Node.js stream pipeline implementation (`stream.pipeline`)
├── Micro-batching worker with size-based and timer-based flush triggers
├── Managing Node.js backpressure: Handling saturated downstream writes cleanly
└── Handling network partitions without losing in-flight memory buffers

Milestone 4: Continuous Aggregations & Materialized Views
├── Building real-time rollup tables with ClickHouse Materialized Views
├── HyperLogLog (`uniqCombined64`) for cardinality estimation (Count Distinct in O(1))
├── Time-series downsampling: Converting raw events into 1-minute and 1-hour metrics
└── Data retention policies (TTL expressions) for automated historical pruning

Milestone 5: Data Lakehouse with Parquet & DuckDB
├── Streaming raw historical data into Apache Parquet columnar files
├── Storing Parquet archives in S3/MinIO partitioned by year/month/day
├── Querying Parquet data lakes directly using DuckDB without loading to memory
└── Slowly Changing Dimensions (SCD Type 2) implementation

Milestone 6: Analytics API & High-Scale Load Testing
├── Building low-latency Analytics API endpoints for interactive dashboards
├── Benchmarking query latency against 50,000,000 rows (target: < 150ms)
└── Load testing ingestion pipeline with k6 (25,000 continuous events/sec)
```

---

## 7. Failure Modes & Adversarial Verification Labs

1. **The Row-Store vs Column-Store Benchmark:** Run an aggregation query calculating average duration grouped by category over 10,000,000 rows in PostgreSQL vs ClickHouse. Prove that ClickHouse executes the query > 50x faster while using 80% less memory.
2. **The Buffer Saturation & Backpressure Test:** Artificially throttle the ClickHouse database connection while blasting the Node.js ingestion gateway with 30,000 requests/sec. Verify that Node.js streams apply backpressure, slow down the HTTP clients cleanly, and avoid `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`.
3. **The Duplicate Event Replay Test:** Ingest 100,000 events where 10% are duplicate `event_id`s with identical timestamps. Verify that the `ReplacingMergeTree` engine background deduplication eliminates the duplicates and reports the exact unique event count.
