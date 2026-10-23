# Project #7: Event-Driven Microservices Logistics & Fulfillment Platform

> **Role in Series:** The Distributed Systems Final Boss.  
> **Domain Analogy:** A distributed logistics, order fulfillment, and shipment routing ecosystem (Amazon Logistics / FedEx microservices).  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
In monolithic architectures, all modules share a single database and runtime. When transitioning to independent microservices:
1. **The Distributed Transaction Dilemma:** An order requires: (1) Order Service creates order, (2) Inventory Service reserves stock, (3) Payment Service charges card, (4) Shipping Service schedules courier. You cannot use a database transaction across separate databases. Two-Phase Commit (2PC) is slow, fragile, and blocks on network partitions.
2. **Network Latency & Serialization Overhead:** Making chains of REST/JSON calls across 6 internal services compounds latency and creates bandwidth bottlenecks.
3. **Cascading Failures:** If the Shipping Service slows down, the Payment Service threads get blocked waiting for it, exhausting connection pools and taking down the entire website.
4. **Data Duplication & Inconsistency:** Replicating customer and product data across services without creating desynchronized ghost records.

### The Solution
An **Event-Driven Microservices Architecture**. Internal synchronous communication is handled via ultra-fast **gRPC & Protocol Buffers (Protobuf)**. Asynchronous workflows, decoupling, and data dissemination are managed by **Apache Kafka** partitioned event streams. Distributed consistency is guaranteed using the **Saga Pattern with Orchestration and Compensating Transactions**, and each service guards against downstream failure using **Circuit Breakers (Opossum)**.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | Apache Kafka as the Distributed Event Backbone | High-throughput partitioned append-only log with replayability, consumer groups, and persistence. | RabbitMQ (lacks native event replayability for long historical retention). |
| **ADR-0002** | gRPC / Protobuf for Synchronous Inter-Service Calls | Compact binary serialization, strict contract typing, multiplexed HTTP/2 streams, and sub-millisecond overhead. | Internal REST over JSON (large serialization overhead and loose contracts). |
| **ADR-0003** | Database-per-Service Pattern | Strict bounded contexts. No service may ever directly query or touch another service's database. | Shared microservice database (destroys service autonomy and creates hidden coupling). |
| **ADR-0004** | Orchestrated Saga Pattern for Order Fulfillment | A dedicated state machine orchestrator manages multi-step sagas and issues compensating transactions on failure. | Choreographed Sagas (hard to monitor, debug, and detect cyclic dependency loops). |
| **ADR-0005** | Circuit Breakers with Bulkheads (Opossum) | Cuts traffic immediately to failing dependencies, returns graceful fallbacks, and prevents cascading service death. | Unbounded retries (creates retry storms that knock down recovering services). |
| **ADR-0006** | Idempotent Event Consumers with Message Deduplication | Stores processed `message_id`s in a local PostgreSQL deduplication table to handle Kafka at-least-once delivery duplicates. | Assuming message delivery is strictly unique. |

---

## 3. Back-of-the-Envelope Capacity Planning

| Metric | Target | Derived Math & Constraints |
|---|---|---|
| **Daily Orders Processed** | 500,000 Orders / Day | Distributed across 4 core microservices. |
| **Kafka Event Throughput** | ~5,000 Events / Sec Peak | Each order generates ~10 domain events across its lifecycle (50k peak order hours). |
| **gRPC Call Latency Target** | p99 < 8ms | Sub-millisecond serialization using binary Protocol Buffers. |
| **Kafka Partitions** | 12 Partitions per Topic | Keyed by `order_id` to guarantee strict chronological ordering per customer order. |
| **Connection Pool Budget** | 10 Connections per Service | 4 services * 10 = 40 total connections per DB instance, preventing pool exhaustion. |

---

## 4. System Topology & Saga State Machine

```
                              CLIENT CHECKOUT REQUEST
                                         │ (POST /orders)
                                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Order Service (Port 4001)                                              │
│  • Creates Order (`PENDING_PAYMENT`)                                   │
│  • Initiates Saga Orchestrator State Machine                           │
└───────────────────┬────────────────────────────────┬───────────────────┘
                    │                                │
                    │ (gRPC: CheckStock)             │ (gRPC: ProcessPayment)
                    ▼                                ▼
       ┌─────────────────────────┐      ┌─────────────────────────┐
       │ Inventory Service       │      │ Payment Service         │
       │ (Port 4002)             │      │ (Port 4003)             │
       │  • Reserves Items       │      │  • Captures Charges     │
       └────────────┬────────────┘      └────────────┬────────────┘
                    │                                │
                    └────────────────┬───────────────┘
                                     │
                                     ▼ (All state changes emit to Kafka)
┌────────────────────────────────────────────────────────────────────────┐
│ Apache Kafka Distributed Event Bus                                     │
│  • Topic: `order-events` (Key: order_id)                               │
│  • Topic: `inventory-events` (Key: product_id)                         │
│  • Topic: `payment-events` (Key: payment_id)                           │
│  • Topic: `shipping-events` (Key: shipment_id)                         │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼ (Async Event Consumer)
┌────────────────────────────────────────────────────────────────────────┐
│ Shipping & Logistics Service (Port 4004)                               │
│  • Consumes `PaymentCapturedEvent`                                     │
│  • Generates Waybill & Assigns Carrier                                 │
│  • Dispatches Tracking Webhooks                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Saga Orchestrator & Compensating Actions

```
[Normal Happy Path]
Create Order ──► Reserve Stock ──► Capture Payment ──► Schedule Shipment ──► Order Completed

[Compensating Failure Path: Payment Declined]
Create Order ──► Reserve Stock ──► Payment Fails!
                                         │
                                         ▼ (Trigger Compensating Actions)
Release Reserved Stock ◄─────────────────┘
         │
         ▼
Mark Order CANCELED ──► Send Notification to Customer
```

---

## 6. Implementation Milestones

```
Milestone 1: Service Decomposition & gRPC Protocol Buffers
├── Define Protobuf schemas (`order.proto`, `inventory.proto`, `payment.proto`)
├── Generate TypeScript types and gRPC client/server stubs via `ts-proto`
├── Implement unary gRPC endpoints with binary serialization
└── Benchmark gRPC throughput vs standard REST/JSON

Milestone 2: Kafka Event Backbone & Outbox Pattern
├── Kafka cluster setup (Partitions, replication factors, retention)
├── Implementing Transactional Outbox pattern per microservice
├── Kafka producer with idempotency and acknowledgment guarantees (`acks=all`)
└── Partition key strategy: Ensuring ordered event processing per aggregate

Milestone 3: Consumer Groups & Deduplication Engine
├── Kafka consumer groups with manual offset commits
├── At-least-once delivery handling: Building idempotent consumer deduplication tables
├── Consumer rebalance listeners and graceful shutdown
└── Dead Letter Queue (DLQ) for malformed/unparseable messages

Milestone 4: The Distributed Saga Orchestrator
├── Implementing state-machine orchestrator for order workflows
├── Executing compensating transactions across services on failure
├── Handling transient vs permanent errors: Exponential backoff retries with jitter
└── Persisting saga state to ensure crash recovery across orchestrator restarts

Milestone 5: Resiliency Patterns (Circuit Breakers & Bulkheads)
├── Integrating Opossum circuit breaker on all gRPC and HTTP client calls
├── Circuit states (`CLOSED`, `OPEN`, `HALF-OPEN`) and threshold configuration
├── Bulkhead pattern: Isolating concurrency pools per downstream service
└── Graceful fallbacks and cached responses during dependency outages

Milestone 6: Distributed Tracing & End-to-End Load Testing
├── OpenTelemetry distributed context propagation across gRPC and Kafka headers
├── End-to-end trace visualization in Jaeger (tracing 1 order across 4 services)
└── Load testing with k6: Simulating 2,000 orders/sec with random service failures
```

---

## 7. Failure Modes & Adversarial Verification Labs

1. **The Partial Failure & Saga Compensation Test:** Make the Payment Service reject payments due to insufficient funds after stock has already been reserved. Verify that the Saga Orchestrator executes the compensating transaction, stock is returned to Inventory, and the order is marked `CANCELED`.
2. **The Cascading Failure Circuit Breaker Test:** Intentionally shut down the Shipping Service. Fire 500 requests at the Order Service. Verify that after 10 failures, the circuit breaker opens, returning an immediate fallback response without blocking threads or exhausting connection pools.
3. **The Kafka Consumer Partition Rebalance Test:** Kill one of 3 consumer instances in a consumer group while actively processing 10,000 events. Verify that Kafka automatically rebalances partitions to the remaining 2 consumers with zero lost messages or duplicate commits.
