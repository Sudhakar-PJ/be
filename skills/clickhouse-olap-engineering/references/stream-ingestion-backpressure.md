# Stream Ingestion & Node.js Backpressure

## 1. The Micro-Batch Ingestion Buffer
To ingest 50,000 events/second in Node.js:
- Collect incoming events in an in-memory ring buffer.
- Flush to ClickHouse when:
  - Buffer reaches `10,000` items, OR
  - Elapsed time reaches `1,000 ms`.

## 2. Stream Backpressure
If ClickHouse disk IO slows down, the Node.js ingestion stream must pause upstream reading (from Kafka or HTTP) rather than buffering indefinitely in RAM:
```typescript
import { pipeline, Transform } from 'node:stream';

// Use stream.pipeline to automatically propagate backpressure
pipeline(
    kafkaInputStream,
    batchingTransform,
    clickhouseInsertStream,
    (err) => {
        if (err) logger.error("Ingestion pipeline failed", { err });
    }
);
```
