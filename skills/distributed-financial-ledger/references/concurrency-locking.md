# Concurrency & Locking Mechanics

## 1. The Lost Update Hazard
When two concurrent requests read balance = $100 and attempt to deduct $60, both read $100, both calculate $40, and both write $40. Result: $120 deducted, user balance is $40 instead of -$20.

## 2. Pessimistic Locking: SELECT FOR UPDATE
```sql
BEGIN;
-- Lock the account row immediately. If another transaction holds the lock, fail fast or wait.
SELECT id, balance, currency 
FROM accounts 
WHERE id = $1 
FOR UPDATE;

-- Validate business rule:
-- If balance - deduction < 0: ROLLBACK with 422 Insufficient Funds.

-- Apply update and insert ledger entries:
UPDATE accounts SET balance = balance - $2 WHERE id = $1;
INSERT INTO ledger_entries (id, transaction_id, account_id, direction, amount) VALUES (...);
COMMIT;
```

## 3. Dealing with Contention: NOWAIT vs SKIP LOCKED
- `FOR UPDATE NOWAIT`: Throws an error immediately (`55P03 lock_not_available`) if the row is locked. The application retries with exponential backoff and jitter. Prevents thread pool exhaustion.
- `FOR UPDATE SKIP LOCKED`: Skips rows currently locked by other transactions. Perfect for job queues and worker pools pulling pending payment batches.
