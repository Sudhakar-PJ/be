# Redlock Algorithm & Fencing Tokens

## 1. The Distributed Lock Problem
Redis locks using `SET key token NX PX 10000` protect against concurrent execution, but **TTL expiration** causes a fatal failure mode:
1. Client 1 acquires lock (TTL = 10s).
2. Client 1 enters a long GC pause or network delay lasting 12s.
3. Lock expires in Redis.
4. Client 2 acquires lock.
5. Client 1 wakes up and commits stale write! (Zombie Write).

## 2. The Solution: Monotonically Increasing Fencing Tokens
1. When a client acquires a distributed lock, Redis increments and returns a monotonic counter: `INCR lock_counter:resource`.
2. Every database write must include the fencing token.
3. The database rejects any write where `fencing_token <= last_seen_fencing_token`.
