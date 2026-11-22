# Toxiproxy Network Fault Injection

## 1. What is Toxiproxy?
Toxiproxy (by Shopify) is a TCP proxy designed for simulating network chaos in automated integration tests:
- Sits between application code and downstream services (PostgreSQL, Redis, Kafka, external APIs).
- Exposes an HTTP API to dynamically inject toxic network conditions ("toxics").

## 2. Common Toxic Types
- `latency`: Injects latency (e.g. +3000ms with 500ms jitter) to verify client timeout budgets and circuit breaker opening.
- `bandwidth`: Throttles connection throughput (e.g. 10 KB/s) to test backpressure.
- `slow_close`: Delays closing TCP sockets to test thread pool exhaustion.
- `reset_peer`: Abruptly sends TCP RST packets to verify connection retry strategies and socket pool recovery.

## 3. Example Test Harness in Vitest
```typescript
import { Toxiproxy } from 'toxiproxy-node-client';

const toxiproxy = new Toxiproxy('http://localhost:8474');
const redisProxy = await toxiproxy.get('redis_proxy');

// Inject 4-second latency into Redis connection
const toxic = await redisProxy.addToxic({
    type: 'latency',
    name: 'redis_slow',
    toxicity: 1.0,
    attributes: { latency: 4000, jitter: 200 }
});

// Assert that application circuit breaker trips to OPEN within 3 requests
await expect(userService.getProfile(userId)).rejects.toThrow("CircuitBreakerOpenException");

// Clean up toxic
await toxic.destroy();
```
