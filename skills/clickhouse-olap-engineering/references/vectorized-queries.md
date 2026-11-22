# Vectorized Queries, Materialized Views & Compression

## 1. Materialized Views with AggregatingMergeTree
Instead of querying raw event tables with 1 billion rows, create real-time pre-aggregated projections:
```sql
CREATE MATERIALIZED VIEW daily_active_users_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (tenant_id, event_date)
AS SELECT
    toDate(created_at) AS event_date,
    tenant_id,
    uniqState(user_id) AS dau_state
FROM event_analytics
GROUP BY event_date, tenant_id;

-- Querying the aggregated view:
SELECT event_date, uniqMerge(dau_state) AS dau
FROM daily_active_users_mv
WHERE tenant_id = $1
GROUP BY event_date;
```
