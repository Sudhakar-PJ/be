# Project #5: High-Performance Search & Vector Recommendation Engine

> **Role in Series:** The Search & Indexing Project.  
> **Domain Analogy:** A production-grade multi-attribute catalog search and semantic recommendation engine (Amazon / Algolia / Spotify search backend).  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
Standard relational database queries fail when subjected to real-world search demands:
1. **The `LIKE '%keyword%'` Catastrophe:** SQL wildcard searches bypass standard B-Tree indexes, triggering sequential table scans across millions of rows and exhausting disk I/O.
2. **Typo Tolerance & Relevance Scoring:** Users expect instant results even with typos ("iphn 15" → "iPhone 15"). Relational databases lack built-in BM25 TF-IDF relevance ranking algorithms.
3. **Keyword Search Misses Intent:** A user searching for "warm winter clothing" won't find a jacket described as "thermal arctic down parka" if the words "warm" and "winter" aren't explicitly written in the title.
4. **Data Sync Lag & Dual Writes:** Syncing primary relational databases with a dedicated search engine (OpenSearch) often leads to inconsistent or orphaned search results if synchronization is done naively.

### The Solution
A **Hybrid Search & Recommendation Pipeline**. Fast lexical search with BM25 scoring in **OpenSearch** and PostgreSQL **GIN/Trigram indexes**, combined with **Vector Embeddings (using Ollama / OpenAI embeddings)** and **`pgvector` with HNSW indexes**. Results are combined using **Reciprocal Rank Fusion (RRF)** to provide the highest relevance, and data is kept synchronized via an asynchronous **Change Data Capture (CDC)** pipeline.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | OpenSearch for Lexical Search & Faceting | Dedicated inverted indexes with BM25 ranking, custom tokenizers, and sub-millisecond faceted aggregations. | Querying PostgreSQL directly for complex multi-attribute e-commerce filters. |
| **ADR-0002** | `pgvector` with HNSW for Vector Search | High-accuracy Approximate Nearest Neighbor (ANN) vector search directly adjacent to relational metadata. | Separate standalone vector databases (Pinecone/Milvus) which introduce extra infrastructure costs. |
| **ADR-0003** | Reciprocal Rank Fusion (RRF) for Hybrid Search | Combines ranked lists from lexical search (keyword precision) and vector search (semantic recall) mathematically. | Manual weighted sum scoring (difficult to normalize score ranges between BM25 and Cosine Similarity). |
| **ADR-0004** | Asynchronous Change Data Capture (CDC) Sync | Decouples writes to PostgreSQL from search indexing. Primary writes never wait for search re-indexing. | Synchronous dual-writes inside HTTP request handlers (creates latency and data desync on failures). |
| **ADR-0005** | Text Chunking & Embedding Generation Pipeline | Offloads embedding calculations to background queues so catalog updates do not block the API. | Synchronous embedding calls during product creation. |

---

## 3. Back-of-the-Envelope Capacity Planning

| Metric | Target | Derived Math & Constraints |
|---|---|---|
| **Product Catalog Size** | 2,000,000 Products | Stored in PostgreSQL with JSONB attributes. |
| **Vector Dimension** | 1536 (or 768 via Ollama) | 768 dimensions * 4 bytes/float ≈ 3 KB per vector embedding. |
| **Vector Memory Footprint** | ~6 GB RAM for HNSW Graph | 2M products * 3 KB = 6 GB vector raw + HNSW graph overhead (~1.5x). Fits comfortably in RAM. |
| **Search Query Throughput** | 1,000 QPS Peak | p95 latency target: < 30ms for lexical search, < 80ms for hybrid vector search. |
| **Re-Indexing Throughput** | 500 Updates / Sec | Ingested via bulk index batches of 500 documents per OpenSearch `_bulk` call. |

---

## 4. System Architecture & Hybrid Search Pipeline

```
                              CLIENT SEARCH REQUEST
                       (GET /api/v1/search?q=warm+jacket&brand=Nike)
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Search Orchestration Service                                          │
│                                                                        │
│  1. Lexical Branch:                                                    │
│     Dispatches BM25 Multi-Match Query + Facet Filters to OpenSearch    │
│                                                                        │
│  2. Semantic Branch:                                                   │
│     Generates 768-dim Embedding via Ollama / Embeddings API            │
│     Dispatches HNSW Vector Query to PostgreSQL (`pgvector`)            │
│                                                                        │
│  3. Fusion Engine (Reciprocal Rank Fusion - RRF):                      │
│     RRF_Score(d) = Σ [ 1 / (60 + Rank_Lexical(d)) +                   │
│                        1 / (60 + Rank_Vector(d)) ]                     │
│                                                                        │
│  4. Returns Deduplicated, Highly-Relevant Ranked Results               │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    ▼                                ▼
       ┌─────────────────────────┐      ┌─────────────────────────┐
       │ OpenSearch (Lexical)    │      │ PostgreSQL (`pgvector`) │
       │  • BM25 Keyword Rank    │      │  • HNSW Vector Index    │
       │  • Trigram Fuzzy Match  │      │  • Cosine Similarity    │
       │  • Facet Aggregations   │      │  • Relational Metadata  │
       └─────────────────────────┘      └─────────────────────────┘
```

---

## 5. Relational & Vector Schema Design

### PostgreSQL Schema with `pgvector`
```sql
CREATE EXTENSION IF NOT EXISTS "vector";

-- Products Table with Vector Embeddings Column
CREATE TABLE products (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    brand VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    price_cents BIGINT NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}',
    embedding vector(768), -- 768-dimensional embedding
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. HNSW Index for Fast Approximate Nearest Neighbor (ANN) Search
CREATE INDEX idx_products_embedding_hnsw ON products 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- 2. Full-Text Search fallback index (GIN)
CREATE INDEX idx_products_fts ON products 
USING GIN (to_tsvector('english', name || ' ' || description));

-- 3. Filter index on brand and price
CREATE INDEX idx_products_filter ON products (category, brand, price_cents);
```

### OpenSearch Document Mapping (JSON)
```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "name": { 
        "type": "text", 
        "analyzer": "standard",
        "fields": {
          "fuzzy": { "type": "text", "analyzer": "simple" }
        }
      },
      "description": { "type": "text" },
      "brand": { "type": "keyword" },
      "category": { "type": "keyword" },
      "priceCents": { "type": "long" }
    }
  }
}
```

---

## 6. Implementation Milestones

```
Milestone 1: PostgreSQL Full-Text & Trigram Search
├── `tsvector` and `tsquery` query construction with ranking (`ts_rank_cd`)
├── GIN index implementation and query plan inspection with `EXPLAIN ANALYZE`
├── Fuzzy typo-tolerant search using `pg_trgm` extension
└── Keyset pagination on search results

Milestone 2: Dedicated Lexical Search with OpenSearch
├── OpenSearch cluster connection and index lifecycle configuration
├── Custom tokenizers, edge n-grams, and English stemmers
├── Multi-attribute faceted search queries (aggregating categories, brands, price ranges)
└── Bulk indexing pipeline for initial catalog seeding

Milestone 3: Asynchronous Index Synchronization (CDC)
├── Transactional Outbox / CDC pipeline to sync PostgreSQL changes into OpenSearch
├── Handling updates, deletes, and out-of-order event streams
└── Automated index alias switching for zero-downtime re-indexing

Milestone 4: Vector Embeddings & pgvector Integration
├── Embedding generation worker using local Ollama model (e.g., `nomic-embed-text`)
├── Storing and querying vector embeddings in PostgreSQL using `pgvector`
├── HNSW index tuning: Balancing index build time (`ef_construction`) vs recall speed (`ef_search`)
└── Cosine similarity vs Inner Product vs Euclidean distance trade-offs

Milestone 5: Hybrid Search Fusion (RRF) & Re-Ranking
├── Implementing Reciprocal Rank Fusion (RRF) algorithm to merge lexical + vector results
├── Query intent classifier: Detecting keyword searches vs conceptual questions
└── Cross-encoder re-ranking for top 20 candidate results

Milestone 6: Search Analytics & Load Testing
├── Ingesting clickstream search analytics (queries, zero-result searches, click-through rates)
├── Benchmark search latency under 1,000 QPS load using k6
└── Proving zero degraded query performance during continuous background re-indexing
```

---

## 7. Failure Modes & Adversarial Verification Labs

1. **The Typo & Stemming Stress Test:** Execute queries with heavy typos (e.g. "sammsung gallaxy phon"). Verify that OpenSearch fuzzy analyzers return the correct Samsung Galaxy products with relevance scores above 0.75.
2. **The Vector Hallucination & Precision Test:** Search for an exact part serial number (e.g. "SN-98234-A"). Verify that lexical BM25 search correctly prioritizes the exact match, whereas vector search alone would return unrelated semantically similar products.
3. **The Index Desync Reconciliation Test:** Kill the OpenSearch cluster for 5 minutes while creating 200 new products in PostgreSQL. Bring OpenSearch back online and verify that the CDC outbox worker flushes all queued items with zero dropped records.
