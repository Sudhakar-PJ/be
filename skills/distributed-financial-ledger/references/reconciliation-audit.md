# Reconciliation & Mathematical Invariant Auditing

## 1. Reconciliation Cron
A scheduled offline worker audits the entire system continuously:
- **Sum of Entries vs Account Balance:**
  For every account: `SELECT SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) FROM ledger_entries WHERE account_id = $1` MUST equal `accounts.balance`.
- **System-Wide Solvency:**
  Sum of all assets minus sum of all customer liabilities must equal platform equity.

## 2. Cryptographic Hash Chaining
Each ledger entry can include `previous_entry_hash` and `entry_hash = SHA256(previous_hash + id + amount + account_id + timestamp)`. This creates an immutable tamper-evident Merkle chain.
