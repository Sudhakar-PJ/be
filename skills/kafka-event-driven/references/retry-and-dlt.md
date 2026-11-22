# Dead-Letter Topics & Exponential Retry Policies

## 1. The Poison Pill Problem
If a consumer encounters a malformed payload or unrecoverable error, retrying indefinitely blocks the entire partition forever.

## 2. Three-Tier Topic Topology
1. `orders.v1`: Main ingress topic.
2. `orders.v1.retry.<10s|1m|5m>`: Delayed retry topics managed with exponential backoff and jitter.
3. `orders.v1.dlt`: Dead-Letter Topic (DLT). Poison messages are forwarded here after max retries, alerting on-call engineers.
