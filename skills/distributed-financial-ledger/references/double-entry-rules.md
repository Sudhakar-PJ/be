# Double-Entry Rules & Invariants

## 1. The Fundamental Accounting Equation
$$\text{Assets} = \text{Liabilities} + \text{Equity}$$

In double-entry bookkeeping, accounts are classified into 5 primary types:
- **Assets:** Resources owned (e.g., Cash at Bank, Accounts Receivable, Inventory). Normal balance is Debit.
- **Liabilities:** Obligations owed (e.g., Accounts Payable, Customer Wallet Balances). Normal balance is Credit.
- **Equity:** Owner's residual interest. Normal balance is Credit.
- **Revenue:** Inflows from operations. Normal balance is Credit.
- **Expenses:** Outflows from operations. Normal balance is Debit.

## 2. Debit and Credit Matrix
| Account Type | Debit Increases? | Credit Increases? | Normal Balance |
| :--- | :--- | :--- | :--- |
| **Asset** | Yes (+) | No (-) | Debit |
| **Liability** | No (-) | Yes (+) | Credit |
| **Equity** | No (-) | Yes (+) | Credit |
| **Revenue** | No (-) | Yes (+) | Credit |
| **Expense** | Yes (+) | No (-) | Debit |

## 3. Schema Invariants
- `ledger_transactions`: `(id UUID, status VARCHAR, idempotency_key VARCHAR UNIQUE, posted_at TIMESTAMPTZ)`
- `ledger_entries`: `(id UUID, transaction_id UUID REFERENCES ledger_transactions, account_id UUID REFERENCES accounts, direction VARCHAR(6) CHECK (direction IN ('DEBIT', 'CREDIT')), amount BIGINT CHECK (amount > 0), currency VARCHAR(3))`
- **Database Trigger or Deferred Constraint:** At transaction commit, verify:
  `SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END) = 0`.
