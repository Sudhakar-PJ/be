# Distributed Saga Orchestration & Compensations

## 1. Sagas vs 2-Phase Commit (2PC)
- **2PC:** Coordinates distributed transactions with lock holding across all nodes. Vulnerable to coordinator failure and causes severe latency degradation.
- **Saga:** A sequence of local database transactions. Each step updates a local database and publishes an event. If a step fails, the saga executes compensating transactions to undo preceding steps.

## 2. Orchestrated Saga State Machine
```
[Order Created] 
      │
      ▼
(Reserve Inventory) ───[Failed]───► (Cancel Order) ──► [Finished: Cancelled]
      │
   [Success]
      ▼
(Charge Payment)    ───[Failed]───► (Release Inventory) ──► (Cancel Order)
      │
   [Success]
      ▼
(Dispatch Shipment) ───[Failed]───► (Refund Payment) ──► (Release Inventory)
      │
   [Success]
      ▼
[Finished: Completed]
```
