# Project #9: Cloud-Native API Gateway & Backend-for-Frontend (BFF) Pattern

> **Role in Series:** The Edge & Protocol Translation Project.  
> **Domain Analogy:** A production-grade edge gateway and routing platform (Kong / Envoy / Netflix Zuul edge router).  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
In distributed microservices, exposing internal services directly to mobile and web clients causes severe systemic failure:
1. **Chatty Mobile Clients & Over-Fetching:** Loading a single dashboard page requires a mobile app to make 12 separate HTTP requests to 6 internal microservices, draining battery and compounding latency.
2. **Protocol Mismatch:** Internal microservices communicate via high-performance binary **gRPC/Protobuf**, but web browsers cannot natively initiate standard HTTP/2 gRPC calls without translation.
3. **Fragmented Security & Authentication:** If each internal microservice independently verifies JWTs, parses rate limits, and validates CORS, code is duplicated and a single misconfigured service exposes the private network.
4. **DDoS & Uncontrolled Ingress:** An upstream traffic spike or bad actor will saturate internal databases unless traffic is throttled at the network perimeter.

### The Solution
A high-throughput **API Gateway & Backend-for-Frontend (BFF)**. The gateway acts as the single perimeter ingress: terminating SSL/TLS, verifying asymmetric JWTs once, enforcing distributed **Token Bucket Rate Limiting** in Redis, translating external **REST/GraphQL** requests into internal **gRPC** calls, aggregating multi-service responses into compact client-specific payloads, and utilizing the **DataLoader pattern** to eliminate N+1 queries.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | Fastify as the Gateway Runtime | Low-overhead routing and HTTP parsing engine; achieves > 2x the throughput of Express for pure proxying. | Express (higher overhead per request hop), Nginx (harder to write custom JS auth business logic). |
| **ADR-0002** | Perimeter Authentication & Header Injection | Gateway verifies the RS256 JWT, strips untrusted headers, and forwards sanitized headers (`X-User-ID`, `X-User-Roles`, `X-Tenant-ID`) to internal services. | Re-authenticating JWTs inside every individual microservice. |
| **ADR-0003** | REST-to-gRPC Protocol Transcoding | Exposes clean REST/JSON endpoints to public clients while invoking internal binary gRPC microservices over multiplexed HTTP/2. | Exposing internal REST endpoints (slower internal communication). |
| **ADR-0004** | Distributed Token Bucket Rate Limiting | Implemented via atomic Redis Lua scripts to provide smooth rate shaping with burst tolerance. | Fixed-window rate limiting (causes double-rate boundary bursts). |
| **ADR-0005** | The DataLoader Pattern for GraphQL Aggregations | Batches and caches concurrent entity lookups across internal services, solving the N+1 problem. | Naive field resolvers making sequential downstream calls. |
| **ADR-0006** | BFF Pattern (Separate Mobile vs Web Endpoints) | Tailors payload sizes and structures specifically for mobile bandwidth constraints vs desktop rich clients. | Single generic monolithic API payload for all devices. |

---

## 3. Back-of-the-Envelope Capacity Planning

| Metric | Target | Derived Math & Constraints |
|---|---|---|
| **Edge Gateway Throughput** | 15,000 Requests / Sec | Distributed across 3 clustered gateway instances (5,000 QPS/node). |
| **Gateway Proxy Overhead** | Latency penalty < 3ms | Fastify zero-copy streaming proxying. |
| **Redis Rate Limit Throughput** | 15,000 Operations / Sec | Atomic Redis Lua script checking tokens in memory in < 0.2ms. |
| **Internal gRPC Multiplexing** | 1 Connection per Microservice | HTTP/2 multiplexes hundreds of concurrent streams over a single TCP connection. |
| **Payload Size Optimization** | 60% Reduction for Mobile | BFF payload stripping removes unused desktop fields from JSON responses. |

---

## 4. System Architecture & Request Lifecycle

```
[Web Browser / Mobile Client]
       │ (HTTPS / REST / GraphQL)
       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Cloud-Native API Gateway & BFF (Port 8080)                             │
│                                                                        │
│  1. W3C Trace Context Propagation (`traceparent` header injection)     │
│  2. Token Bucket Rate Limiter (Redis Lua: per-IP / per-Tenant)         │
│  3. Perimeter RS256 JWT Verification & JWKS Cache                      │
│  4. Header Sanitization: Injects verified `X-User-ID`, `X-Tenant-ID`   │
│  5. Protocol Transcoder: Translates REST/GraphQL into gRPC calls       │
│  6. DataLoader Batcher: Collapses multiple sub-queries into 1 call     │
└──────────────┬──────────────────────────┬──────────────────────────────┘
               │                          │
               │ (Internal gRPC over H2)  │ (Internal gRPC over H2)
               ▼                          ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│ Order Microservice      │    │ Customer Microservice   │
│ (gRPC on Port 50051)    │    │ (gRPC on Port 50052)    │
└─────────────────────────┘    └─────────────────────────┘
```

---

## 5. Distributed Token Bucket Algorithm (Redis Lua)

```lua
-- Keys: [1] rate_limit_key
-- Args: [1] capacity, [2] refill_rate_per_sec, [3] requested_tokens, [4] current_timestamp

local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local requested = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

-- Retrieve current tokens and last refill timestamp
local state = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(state[1])
local last_refill = tonumber(state[2])

if not tokens then
    tokens = capacity
    last_refill = now
else
    -- Calculate refilled tokens based on elapsed time
    local elapsed = math.max(0, now - last_refill)
    tokens = math.min(capacity, tokens + (elapsed * refill_rate))
    last_refill = now
end

-- Check if sufficient tokens exist
if tokens >= requested then
    tokens = tokens - requested
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('EXPIRE', key, math.ceil(capacity / refill_rate) * 2)
    return { 1, tokens } -- 1 = ALLOWED
else
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
    return { 0, tokens } -- 0 = REJECTED (429 Too Many Requests)
end
```

---

## 6. Implementation Milestones

```
Milestone 1: Fastify Reverse Proxy & Dynamic Routing
├── Low-overhead HTTP reverse proxy setup using Fastify & `@fastify/http-proxy`
├── Dynamic path routing rules (routing `/api/v1/orders/*` to downstream services)
├── Request ID generation & W3C `traceparent` context forwarding
└── Header stripping: Preventing client-spoofed internal headers (`X-User-ID`)

Milestone 2: Distributed Rate Limiting & Abuse Prevention
├── Implementing Token Bucket & Leaky Bucket algorithms in atomic Redis Lua
├── Tiered rate-limiting: Unauthenticated IP rate limits vs Tenant API key limits
├── Rate-limit response headers: `X-RateLimit-Limit`, `Remaining`, `Reset`
└── Handling Redis connection failure: Fail-open vs fail-closed strategies

Milestone 3: Perimeter Security & JWT Termination
├── Centralized RS256 JWT verification at the edge gateway
├── Public key caching via JWKS (JSON Web Key Set) with periodic rotation
├── Granular RBAC / Scope validation before forwarding requests
└── Emitting RFC 9457 Problem Details on auth failures

Milestone 4: REST-to-gRPC Protocol Transcoding
├── Compiling Protobuf definitions into the API Gateway
├── Dynamic mapping: Converting incoming HTTP POST/GET to internal gRPC unary calls
├── Error translation: Mapping gRPC status codes (e.g., `NOT_FOUND`, `ALREADY_EXISTS`) to HTTP status codes
└── HTTP/2 multiplexed connection pool management

Milestone 5: Backend-for-Frontend (BFF) & The DataLoader Pattern
├── Creating dedicated endpoints for Mobile (`/mobile/dashboard`) vs Desktop (`/web/dashboard`)
├── Parallel downstream fan-out with `Promise.allSettled`
├── DataLoader pattern: Batching individual entity IDs into single bulk requests
└── Eliminating N+1 database queries at the gateway aggregation layer

Milestone 6: Resilience, Edge Caching & Load Testing
├── Short-TTL HTTP caching at the edge for read-heavy public routes
├── Gateway circuit breaking and health checking of internal microservices
└── Benchmarking gateway throughput (target: 15,000 QPS with < 3ms proxy overhead)
```

---

## 7. Failure Modes & Adversarial Verification Labs

1. **The Header Spoofing Vulnerability Test:** Send an external request with `X-User-ID: admin-uuid` and `X-Tenant-ID: victim-tenant`. Verify that the gateway completely strips these incoming headers and only passes downstream values decoded from the verified JWT.
2. **The Rate Limiter Boundary Burst Test:** Launch a concurrency script firing 500 requests within 100 milliseconds against a rate limit of 100 requests/sec. Prove that the Token Bucket allows the initial burst up to capacity and returns `429 Too Many Requests` with a valid `Retry-After` header for the remainder.
3. **The Microservice Outage Graceful Degradation Test:** Kill the downstream Recommendation Service. Request the mobile dashboard. Verify that the Gateway returns the user profile and recent orders (HTTP 200) with recommendations gracefully set to an empty array rather than failing the entire page with a 500 error.
