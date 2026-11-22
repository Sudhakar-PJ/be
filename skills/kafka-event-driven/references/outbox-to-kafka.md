# Transactional Outbox Pattern & CDC

## 1. The Dual-Write Problem
```typescript
// DANGEROUS: If network drops between line 2 and 3, event is lost forever!
await db.query("INSERT INTO orders ...");
await kafkaProducer.send({ topic: 'orders', messages: [...] });
```

## 2. The Transactional Outbox Solution
```sql
BEGIN;
INSERT INTO orders (id, customer_id, total_amount) VALUES (...);
INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, payload) 
VALUES (gen_random_uuid(), 'ORDER', order_id, 'OrderCreated', payload);
COMMIT;
```
An independent process (Debezium reading Postgres WAL, or a polling worker) reads `outbox_events` and publishes them to Kafka with guaranteed at-least-once delivery.
