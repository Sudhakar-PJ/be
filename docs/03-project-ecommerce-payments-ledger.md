# Project #3: High-Concurrency E-Commerce & Double-Entry Financial Ledger

> **Role in Series:** The ACID & Distributed Transactions Project.  
> **Domain Analogy:** A high-volume payment processing, inventory checkout, and ledger platform (Stripe + Shopify checkout).  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
In financial and inventory systems, race conditions result in real money and inventory loss:
1. **Overselling Inventory:** 500 customers click "Buy Now" on the last 5 limited-edition sneakers in the exact same millisecond. Simple `UPDATE items SET stock = stock - 1` leaves inventory negative due to concurrency race conditions.
2. **Double-Spending & Ghost Charges:** A flaky network causes a checkout request to time out. The user clicks "Pay" again. Without an atomic, distributed idempotency engine, the customer gets charged twice.
3. **Imbalanced Financial Books:** In a single balance transfer (Customer A → Merchant B), if the system crashes after debiting Customer A but before crediting Merchant B, funds disappear.
4. **Dual-Write Vulnerabilities:** Updating a database table and publishing an event to a message queue in two separate steps can fail halfway, causing data desync.

### The Solution
A strictly compliant **Double-Entry Bookkeeping Ledger** combined with **PostgreSQL Pessimistic Row-Level Locking (`SELECT ... FOR UPDATE`)**, the **Transactional Outbox Pattern**, and **Distributed Locks (Redlock)** for high-contention flash sales.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | Immutable Double-Entry Ledger | Every movement of money is recorded as two balanced entries: a Debit and an equal Credit. Account balances are derived sums. | Mutable `balance` column alone (loss of auditability and fatal on concurrent updates). |
| **ADR-0002** | Pessimistic Locking (`SELECT FOR UPDATE`) | Guarantees exclusive row locks during inventory deductions, preventing overselling. | Pure optimistic locking (causes massive transaction retry storms during flash sales). |
| **ADR-0003** | The Transactional Outbox Pattern | Atomically inserts business data and outgoing domain events into the same PostgreSQL transaction. Guarantees zero lost events. | Direct publishing to message broker inside HTTP request (dual-write failure risk). |
| **ADR-0004** | Distributed Locks (Redlock) for Pre-Claim Caching | Offloads extreme flash-sale write spikes to Redis before touching PostgreSQL disk. | Hitting database row locks for 50,000 requests/sec. |
| **ADR-0005** | HMAC-SHA256 Webhook Signature Verification | Verifies inbound payment gateway webhooks (e.g. Stripe) and outbound fulfillment alerts with replay protection. | Unsigned webhooks or static shared API keys. |
| **ADR-0006** | Orchestrated Saga Pattern with Compensating Actions | Manages multi-step checkout workflows (Order Created → Stock Reserved → Payment Captured → Fulfillment). | Distributed 2-Phase Commit (2PC) (causes blocking and poor availability). |

---

## 3. Back-of-the-Envelope Capacity Planning

| Metric | Target | Derived Math & Constraints |
|---|---|---|
| **Flash Sale Peak Concurrency** | 10,000 Requests / Sec | 100 limited items sold out in under 2 seconds. |
| **Financial Ledger Ingestion** | 500 Transactions / Sec | 1,000 ledger entries/sec (2 entries per transaction). |
| **Ledger Storage Growth** | ~60 GB / Year | 10M transactions * 2 entries * 300 bytes/entry ≈ 6 GB/year + indexes. |
| **PostgreSQL Lock Timeout Budget** | Max 1,500 ms | Transactions must fail-fast with `504/409` rather than queueing up and exhausting connection pools. |
| **Idempotency Key TTL** | 24 Hours | Kept in Redis and Postgres to reject duplicate payments safely. |

---

## 4. System Architecture & The Outbox Pattern

```
                                  CHECKOUT REQUEST
                                         │ (POST /checkout with Idempotency-Key)
                                         ▼
                             ┌───────────────────────┐
                             │ API Gateway & Worker  │
                             └───────────┬───────────┘
                                         │
        ┌────────────────────────────────┴────────────────────────────────┐
        │ ATOMIC POSTGRESQL TRANSACTION (BEGIN ... COMMIT)                │
        │                                                                 │
        │  1. Check & Reserve Stock:                                      │
        │     `SELECT stock FROM inventory WHERE id = ? FOR UPDATE;`      │
        │                                                                 │
        │  2. Insert Order Record:                                        │
        │     `INSERT INTO orders (id, status) VALUES (?, 'PENDING');`     │
        │                                                                 │
        │  3. Insert Ledger Entries (Debit Customer, Credit Escrow):      │
        │     `INSERT INTO ledger_entries (debit, credit, ...);`          │
        │                                                                 │
        │  4. Write Domain Event to Outbox Table:                         │
        │     `INSERT INTO outbox (topic, payload) VALUES ('order.paid');`│
        └────────────────────────────────┬────────────────────────────────┘
                                         │
                                         ▼
                             ┌───────────────────────┐
                             │ Outbox Relay Worker   │
                             │ (Polling or Debezium) │
                             └───────────┬───────────┘
                                         │
                                         ▼
                             ┌───────────────────────┐
                             │ Kafka / Redpanda / Q  │
                             └───────────┬───────────┘
                                         │
             ┌───────────────────────────┼───────────────────────────┐
             ▼                           ▼                           ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│ Payment Service         │ │ Inventory Service       │ │ Notification Service    │
│ (Stripe Capture)        │ │ (Warehouse Dispatch)    │ │ (Email & SMS Delivery)  │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
```

---

## 5. Relational Schema & Double-Entry Ledger Design

```sql
-- 1. Chart of Accounts
CREATE TABLE accounts (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Journal Transactions (Header)
CREATE TABLE journal_transactions (
    id UUID PRIMARY KEY,
    reference_id VARCHAR(100) NOT NULL UNIQUE, -- e.g. order_id or refund_id
    description TEXT NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Double-Entry Lines (Must balance: Total Debits == Total Credits)
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES journal_transactions(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id),
    entry_type VARCHAR(6) NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
    amount_cents BIGINT NOT NULL CHECK (amount_cents > 0), -- Stored in smallest unit (cents)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Inventory Table with Concurrency Guard
CREATE TABLE inventory (
    product_id UUID PRIMARY KEY,
    total_stock INT NOT NULL CHECK (total_stock >= 0),
    reserved_stock INT NOT NULL DEFAULT 0 CHECK (reserved_stock <= total_stock),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Transactional Outbox Table
CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
    retry_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events (status, created_at) WHERE status = 'PENDING';
```

---

## 6. Implementation Milestones

```
Milestone 1: The Double-Entry Ledger Core
├── Design chart of accounts (Asset, Liability, Equity, Revenue, Expense)
├── Strict ledger engine: Zero-sum validation before commit
├── Balance aggregation queries & materialized views for fast balance lookups
└── Audit trail & integrity verification scripts

Milestone 2: High-Contention Inventory & Concurrency
├── Inventory reservation with `SELECT ... FOR UPDATE`
├── `SKIP LOCKED` mechanics for high-throughput batch order processing
├── Handling PostgreSQL deadlock exception (`40P01`) with jittered retries
└── Load test: Proving 1,000 concurrent buyers cannot oversell 10 items

Milestone 3: Idempotency Engine & Payment Gateway
├── Redis-backed distributed idempotency middleware
├── Mock Stripe-shaped payment gateway integration
├── Inbound webhook listener with HMAC-SHA256 signature verification
└── Webhook replay attack protection (timestamp & nonce checks)

Milestone 4: The Transactional Outbox Pattern
├── Atomic dual-write mitigation: Inserting events into `outbox_events` table
├── High-frequency outbox poller using `SELECT ... FOR UPDATE SKIP LOCKED`
├── Publishing events to message broker (Kafka / Redis Streams)
└── Marking outbox events processed with at-least-once delivery guarantees

Milestone 5: The Saga Pattern & Compensating Transactions
├── Multi-stage checkout orchestrator (Order → Payment → Inventory → Delivery)
├── Compensating transactions: Automatic refunds and stock release on failure
├── Handling timeout and network partition states cleanly
└── Dead-Letter Queue (DLQ) for manual intervention

Milestone 6: Partitioning & High-Scale Optimization
├── Partitioning ledger entries by month using PostgreSQL table partitioning
├── Materialized views with periodic refresh for end-of-day balances
└── End-to-end load testing with k6 (10,000 concurrent checkout attempts)
```

---

## 7. Failure Modes & Adversarial Verification Labs

1. **The Flash-Sale Overselling Test:** Launch 1,000 concurrent requests attempting to purchase stock of 10. Verify that exactly 10 requests succeed (HTTP 200/201), 990 receive out-of-stock errors (HTTP 409/422), and `inventory.reserved_stock` matches exactly 10.
2. **The Double-Debit Network Glitch:** Fire 20 identical checkout requests with the same `Idempotency-Key` concurrently. Verify that the bank/ledger is debited exactly once and all 20 requests return identical success responses.
3. **The Ledger Inbalance Attack:** Attempt to insert an unbalanced ledger entry (Debit $50, Credit $40). Verify the transaction is rejected by the domain layer and database constraints before committing.
4. **The Outbox Crash Test:** Kill the Node.js server immediately after a database commit but before webhook/email dispatch. Restart the server and verify that the Outbox worker automatically picks up the pending event and completes delivery.
