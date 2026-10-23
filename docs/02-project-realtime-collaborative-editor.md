# Project #2: Real-Time Collaborative Document Editor & Workspace

> **Role in Series:** The WebSocket & Concurrency Project.  
> **Domain Analogy:** A production-grade backend for Google Docs, Notion, or Figma (live multi-user editing, presence, and chat).  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
In standard REST APIs, communication is unidirectional and client-initiated. For collaborative editing or chat:
1. **HTTP Polling fails:** Polling every second creates massive server connection churn and latency spikes while still missing millisecond-level concurrent edits.
2. **Horizontal Scaling of Sockets:** WebSockets are stateful, persistent TCP connections held open to a single server instance. If User A connects to `Server-1` and User B connects to `Server-2`, `Server-1` has no built-in way to send User A's keystrokes to User B.
3. **Concurrent Document Mutation Conflicts:** Two users typing in the same paragraph simultaneously will overwrite each other's edits if state is not synchronized using conflict resolution algorithms (CRDTs or Operational Transformation).

### The Solution
A **Stateful WebSocket Gateway** scaled horizontally using a **Redis Pub/Sub & Redis Streams backplane**. Ephemeral states (online presence, cursor positions, typing indicators) live in Redis with automatic TTL expiration, while durable document states and chat histories are persisted to PostgreSQL with optimistic locking and JSONB document snapshots.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | Raw `ws` Library over Socket.IO | Direct control over WebSocket frame buffers, binary packets, heartbeat protocols, and minimal overhead. | Socket.IO (heavy abstraction, excessive fallback code, hides protocol mechanics). |
| **ADR-0002** | Redis Pub/Sub for Horizontal Gateway Fan-Out | Sub-millisecond message broadcasting across multiple Node.js WebSocket gateway instances. | RabbitMQ (higher latency for simple fan-out), Direct P2P cluster mesh (complex discovery). |
| **ADR-0003** | Redis Hashes with Sliding TTLs for User Presence | Constant-time $O(1)$ presence reads; dead client connections expire automatically without zombie state. | Storing presence in PostgreSQL (table lock contention and write amplification). |
| **ADR-0004** | PostgreSQL `LISTEN` / `NOTIFY` for DB-Triggered Events | Low-latency notification directly from the database engine to Node.js when background worker updates documents. | Polling PostgreSQL for changes. |
| **ADR-0005** | JSONB + Optimistic Concurrency Control for Documents | Schema flexibility for rich text blocks while preventing overwrites via version checks (`version = version + 1`). | Text blobs with lock-based editing (blocks concurrent users). |
| **ADR-0006** | Ephemeral State vs. Durable Event Log Separation | Typing/cursor events bypass PostgreSQL completely and stream via Redis; committed edits append to Redis Streams and PostgreSQL. | Persisting every mouse movement to relational disk. |

---

## 3. Back-of-the-Envelope Capacity Planning

| Metric | Target | Derived Math & Constraints |
|---|---|---|
| **Concurrent WebSocket Connections** | 50,000 Active Sockets | Across a cluster of 5 Node.js instances (10,000 sockets per process). |
| **Memory per Socket** | ~10 KB - 15 KB | 10,000 sockets * 15 KB ≈ 150 MB RAM per Node.js process (well within limits). |
| **Peak Message Throughput** | 25,000 msgs / sec | During active document typing: 5,000 active rooms * 5 msgs/sec. |
| **Redis Pub/Sub Bandwidth** | ~25 MB / sec | 25,000 msgs/sec * 1 KB average payload size. Easily sustained over 1 Gbps networking. |
| **Presence Heartbeat Frequency** | Every 10 seconds | 50,000 clients pinging every 10s = 5,000 pings/sec into Redis ($O(1)$ `HSET` operations). |

---

## 4. System Architecture & WebSocket Topology

```
[Client A (Browser)]          [Client B (Browser)]          [Client C (Browser)]
       │ (WSS)                       │ (WSS)                       │ (WSS)
       ▼                             ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│ WebSocket Gateway #1    │   │ WebSocket Gateway #2    │   │ WebSocket Gateway #3    │
│  • Token Auth on Upgrade│   │  • Token Auth on Upgrade│   │  • Token Auth on Upgrade│
│  • Connection Registry  │   │  • Connection Registry  │   │  • Connection Registry  │
│  • Heartbeat Monitor    │   │  • Heartbeat Monitor    │   │  • Heartbeat Monitor    │
└────────────┬────────────┘   └────────────┬────────────┘   └────────────┬────────────┘
             │                             │                             │
             └──────────────────────┬──────┴─────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ Redis Cluster (Pub/Sub + Streams + Ephemeral State)     │
       │  • Channel: `doc:updates:<doc_id>` (Message Fan-out)    │
       │  • Hashes: `doc:presence:<doc_id>` (Cursor & Status)    │
       │  • Stream: `doc:changelog:<doc_id>` (Ordered Ops)       │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ Document Persistence Worker                             │
       │  • Consumes Redis Stream batches                        │
       │  • Applies changes to PostgreSQL document snapshot      │
       │  • Creates revision history checkpoints                 │
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ PostgreSQL (Durable Storage)                            │
       │  • `documents` (JSONB state + version)                  │
       │  • `document_revisions` (Historical snapshots)          │
       │  • `chat_messages` (Channel messages)                   │
       └─────────────────────────────────────────────────────────┘
```

---

## 5. Relational & Ephemeral Data Modeling

### PostgreSQL Schema
```sql
-- 1. Documents Table (with JSONB tree structure)
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    tenant_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    content JSONB NOT NULL DEFAULT '{"type": "doc", "content": []}',
    version INT NOT NULL DEFAULT 1,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Document Historical Revisions (Snapshots)
CREATE TABLE document_revisions (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    revision_number INT NOT NULL,
    snapshot JSONB NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (document_id, revision_number)
);

-- 3. Live Chat Messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    message TEXT NOT NULL,
    sequence_id BIGINT GENERATED ALWAYS AS IDENTITY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_doc_seq ON chat_messages (document_id, sequence_id DESC);
```

### Redis Ephemeral Keys & Structures
* **Presence Hash:** `doc:presence:<document_id>`
  * Fields: `user:<user_id>` → `{"name": "Alice", "color": "#FF5733", "cursor": {"line": 12, "ch": 4}, "lastSeen": 1718000000}`
* **Presence TTL Key:** `presence:keepalive:<doc_id>:<user_id>` with a 15-second TTL.
* **Pub/Sub Room Channels:** `channel:doc:<document_id>` (Used for routing edits, cursor movements, and typing events).

---

## 6. Implementation Milestones

```
Milestone 1: WebSocket Gateway & Secure Handshake
├── Raw `ws` server setup with HTTP Upgrade interception
├── JWT authentication during HTTP upgrade before socket establish
├── Heartbeat engine (Ping-Pong protocol every 30s to detect broken sockets)
└── Safe connection cleanup & termination handlers

Milestone 2: Multi-Instance Horizontal Scaling (Redis Pub/Sub)
├── Redis Pub/Sub integration for gateway clustering
├── Room subscription manager (joining/leaving document channels)
├── Message serialization & framing (JSON & binary payloads)
└── Local in-memory socket registry mapped to document rooms

Milestone 3: Ephemeral Presence & Cursor Tracking
├── User presence tracking (Online / Idle / Offline)
├── Ephemeral cursor coordinates streaming (bypassing persistent DB)
├── Sliding TTL expiration for disconnect detection
└── Typing indicator broadcast with debouncing

Milestone 4: Concurrency, Conflict Resolution & Document State
├── Versioned document editing using JSONB operational patches
├── Optimistic concurrency checks in PostgreSQL (`WHERE version = :clientVersion`)
├── Conflict detection: Handling reject-and-rebase scenarios
└── CRDT / Operational Transformation principles in multi-user updates

Milestone 5: Stream Ingestion & Historical Revision Snapshots
├── Redis Streams for ordered append-only edit logs
├── Background flush worker (micro-batching edits into PostgreSQL)
├── Periodic document revision checkpoints (every 50 edits or 10 minutes)
└── Replaying document history from revision logs

Milestone 6: Resiliency, Backpressure & Load Testing
├── Backpressure management: Pausing sockets when client buffer saturates (`ws.bufferedAmount`)
├── Thundering herd mitigation during gateway restarts (reconnection jitter)
└── Load testing with `wscat` / Artillery (5,000 concurrent active sockets)
```

---

## 7. Failure Modes & Adversarial Verification Labs

1. **The Disconnect Dead Client Test:** Force-kill a client process without sending a WebSocket `close` frame. Verify that the server's heartbeat detector flags the socket as dead within 35 seconds, purges it from the in-memory room registry, and expires its presence from Redis.
2. **The Multi-Node Relay Test:** Spawn two separate Node.js server instances on different ports connected to the same Redis instance. Connect Client 1 to Server A and Client 2 to Server B. Send an edit from Client 1 and verify Client 2 receives it in < 15ms.
3. **The Saturated Client Backpressure Test:** Send a high-velocity stream of 50,000 messages to a slow client. Monitor `ws.bufferedAmount`. Verify the server stops buffering and pauses or drops non-critical cursor events before memory overflows.
