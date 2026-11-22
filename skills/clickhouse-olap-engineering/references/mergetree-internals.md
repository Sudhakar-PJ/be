# MergeTree Engine Internals & Index Mechanics

## 1. Sparse Index & Granules
Unlike PostgreSQL B-Trees (which index every individual row), ClickHouse uses a **sparse index**:
- Data is split into **granules** of 8,192 rows by default.
- ClickHouse stores index entries only for the *first row of each granule*.
- This allows millions of rows to be indexed with an index that fits entirely in CPU L1/L2 cache!

## 2. Primary Sort Key (`ORDER BY`) vs Partition Key (`PARTITION BY`)
```sql
CREATE TABLE event_analytics (
    event_date Date,
    tenant_id UUID,
    event_type LowCardinality(String),
    user_id UUID,
    properties String,
    created_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_date)
ORDER BY (tenant_id, event_type, created_at);
```
- `PARTITION BY toYYYYMM(event_date)`: Divides data into monthly chunks for easy data lifecycle management (`DROP PARTITION`).
- `ORDER BY (tenant_id, event_type, created_at)`: Dictates physical disk layout and sparse index sorting.
