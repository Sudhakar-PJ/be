# Redis GEO In-Memory Telemetry

## 1. Redis GEO Internals
Redis GEO stores coordinates inside a **Sorted Set (ZSET)** using a 52-bit **Geohash** as the score:
- `GEOADD drivers:active <longitude> <latitude> <driver_id>`
- Coordinates are mapped to integer scores, enabling range scans.

## 2. High-Frequency Telemetry Pipeline
1. Driver mobile client sends ping every 2 seconds: `(driver_id, lat, lng, speed, bearing)`.
2. Edge ingest server validates coordinates and writes to Redis:
   - `GEOADD drivers:locations <lng> <lat> <driver_id>`
   - `HSET driver:meta:<driver_id> speed <speed> bearing <bearing> last_seen <ts>`
   - `EXPIRE driver:meta:<driver_id> 30` (Heartbeat auto-expiry).
3. Search nearby drivers:
   `GEOSEARCH drivers:locations FROMLONLAT <lng> <lat> BYRADIUS 3 km ASC WITHCOORD WITHDIST COUNT 20`.
