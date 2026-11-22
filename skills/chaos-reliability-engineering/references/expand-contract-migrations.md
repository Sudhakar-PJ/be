# Expand/Contract Zero-Downtime Database Migrations

## The 5-Phase Parallel Run Pattern
When renaming `phone` to `phone_number` on a 50-million-row table:

### Phase 1: Expand (Migration 1)
- Add new nullable column: `ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);`
- Deploy app version $V_1$: Writes to both `phone` and `phone_number`, reads from `phone`.

### Phase 2: Backfill (Background Worker)
- Asynchronously backfill historical data in batches:
  `UPDATE users SET phone_number = phone WHERE phone_number IS NULL AND id > $last_id LIMIT 1000;`

### Phase 3: Switch Reads (App Deployment $V_2$)
- Deploy app version $V_2$: Reads from `phone_number`, continues dual-writing to both.

### Phase 4: Enforce Constraints (Migration 2)
- Add `NOT NULL` or unique constraints on `phone_number` using `NOT VALID` followed by `VALIDATE CONSTRAINT` to avoid table locks.

### Phase 5: Contract (App Deployment $V_3$ + Migration 3)
- Deploy app version $V_3$: Writes and reads exclusively from `phone_number`.
- Drop old column: `ALTER TABLE users DROP COLUMN phone;`
