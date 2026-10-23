# Project #6: Geospatial Real-Time Fleet Tracking & Dispatch Platform

> **Role in Series:** The Spatial Data Project.  
> **Domain Analogy:** A production-grade geospatial dispatch and routing engine (Uber / DoorDash / Deliveroo driver dispatch backend).  
> **Status:** Specification Document.

---

## 1. System Vision & Problem Statement

### The Engineering Challenge
Location-based applications present severe mathematical and I/O challenges:
1. **The 2D Spatial Search Complexity:** Calculating distance using the Haversine formula across 100,000 drivers in SQL requires calculating trigonometric operations on every single row: $O(N)$ full table scans that bring databases to a halt.
2. **High-Frequency GPS Ingestion:** 50,000 active couriers transmitting GPS coordinates every 3 seconds generates ~16,600 write operations per second. Persisting every single GPS ping into relational disk destroys database write capacity.
3. **Geofencing & Polygon Matching:** Determining whether a moving point is currently inside a complex multi-sided polygon (e.g., delivery zone, airport surcharge area) requires specialized Point-in-Polygon (PIP) algorithms.
4. **Dynamic Driver Dispatching:** Finding the top 5 nearest *available* drivers to a restaurant within 3 km in under 50 milliseconds while preventing multiple orders from locking the same driver.

### The Solution
A **Hybrid In-Memory Spatial Pipeline**. High-velocity live driver coordinates are buffered and queried in **Redis GEO** ($O(\log N)$ spatial lookups). Static boundaries, historical routes, and complex polygons reside in **PostgreSQL with PostGIS** using **GiST R-Tree indexing**. Spatial space is partitioned into discrete hexagonal grids using **Uber's H3 spatial index**, enabling $O(1)$ spatial cell lookups and surge-pricing calculations.

---

## 2. Core Architectural Decisions (ADRs)

| ADR | Decision | Rationale | Alternatives Rejected |
|---|---|---|---|
| **ADR-0001** | PostGIS `GEOGRAPHY(Point, 4326)` for Durable Geo State | Native ellipsoidal spatial calculations accounting for Earth's curvature (WGS 84). | Storing raw `latitude` and `longitude` numeric columns (requires slow manual Haversine math). |
| **ADR-0002** | Redis GEO for Live Driver Pings | In-memory spatial indexing using Geohash sorted sets (`ZSET`). Handles 20,000 writes/sec with sub-millisecond lookups. | Direct PostgreSQL writes for every 3-second ping (database disk saturation). |
| **ADR-0003** | Uber H3 Hexagonal Grid Partitioning | Hexagons have equal distances between all 6 neighbors (unlike squares), making radius searches and surge aggregation consistent. | Square grids or raw Geohashes (boundary distortion issues). |
| **ADR-0004** | GiST (Generalized Search Tree) R-Tree Indexes | Allows PostgreSQL to filter 2D bounding boxes hierarchically in logarithmic time. | Standard B-Tree indexes (cannot index 2-dimensional spatial data). |
| **ADR-0005** | Batch Route History Downsampling | Downsamples raw driver trails using the Ramer-Douglas-Peucker algorithm before archiving to PostgreSQL. | Saving raw 3-second GPS points forever (wastes 90% of storage on stationary points). |

---

## 3. Back-of-the-Envelope Capacity Planning

| Metric | Target | Derived Math & Constraints |
|---|---|---|
| **Active Drivers Online** | 50,000 Drivers | Each driver pings every 3 seconds. |
| **Location Ingestion QPS** | ~16,666 Writes / Sec | 50,000 / 3s. Handled entirely in memory via Redis `GEOADD`. |
| **Redis Memory for Live Fleet** | ~25 MB RAM | 50,000 entries * ~500 bytes per driver state in Redis. Ultra-lightweight. |
| **Dispatch Nearest Search QPS** | 500 QPS Peak | p95 latency target: < 15ms using Redis `GEORADIUSBYMEMBER` / `GEOSEARCH`. |
| **Historical Route Storage** | ~15 GB / Month | Downsampled routes stored every 30 seconds rather than every 3 seconds. |

---

## 4. System Architecture & Dispatch Lifecycle

```
[Driver Mobile App]
       │ (Sends GPS: lat, lng, speed, bearing every 3s via WSS/UDP/HTTP)
       ▼
┌─────────────────────────────────┐
│ Ingestion Gateway Service       │
│  • Validates GPS boundaries     │
│  • Computes H3 Cell Index (Res 8│
└──────────────┬──────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Redis In-Memory Spatial Cluster                                        │
│  • `GEOADD drivers:available <lng> <lat> <driver_id>`                  │
│  • `HSET driver:state:<id> speed 35 bearing 180 h3_cell 882681...`     │
└──────────────┬─────────────────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Order Dispatch Service (Triggered on New Food Order)                   │
│                                                                        │
│  1. Receives Restaurant Location: (lat, lng)                           │
│  2. Queries Redis for Available Drivers within 3.0 km:                │
│     `GEOSEARCH drivers:available FROMLONLAT <lng> <lat>                │
│      BYRADIUS 3 km ASC COUNT 10 WITHDIST`                              │
│  3. Filters candidate drivers (checks rating, vehicle type, heading)   │
│  4. Acquires Distributed Lock on Selected Driver                       │
│  5. Dispatches Order Offer via Push Notification (ntfy/FCM)           │
└──────────────┬─────────────────────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PostgreSQL + PostGIS (Durable Spatial Database)                        │
│  • Restaurant locations & service polygons                             │
│  • Geofences (Delivery zones, city borders, airport surcharges)        │
│  • Downsampled route histories & completed trip audit trails           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Geospatial Data Modeling & PostGIS Schema

```sql
-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Delivery Zones / Geofences (Polygons)
CREATE TABLE delivery_zones (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    polygon GEOMETRY(Polygon, 4326) NOT NULL, -- SRID 4326: WGS 84 GPS coordinates
    base_fee_cents INT NOT NULL DEFAULT 500,
    surge_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Restaurants Table (Points)
CREATE TABLE restaurants (
    id UUID PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL, -- GEOGRAPHY type for accurate meter distances
    address TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Trips & Downsampled Historical GPS Tracks
CREATE TABLE trips (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    pickup_location GEOGRAPHY(Point, 4326) NOT NULL,
    dropoff_location GEOGRAPHY(Point, 4326) NOT NULL,
    actual_route GEOMETRY(LineString, 4326), -- Recorded trip route
    distance_meters INT,
    status VARCHAR(30) NOT NULL DEFAULT 'DISPATCHING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Spatial GiST Indexes (R-Tree)
CREATE INDEX idx_zones_polygon ON delivery_zones USING GIST (polygon);
CREATE INDEX idx_restaurants_location ON restaurants USING GIST (location);
CREATE INDEX idx_trips_actual_route ON trips USING GIST (actual_route);
```

---

## 6. Implementation Milestones

```
Milestone 1: PostGIS Foundations & Spatial SQL
├── Setting up PostGIS extension and understanding SRID 4326 vs 3857
├── Point, LineString, and Polygon geometry creation
├── Spatial functions: `ST_Distance`, `ST_DWithin`, and `ST_Contains`
└── R-Tree indexing with GiST and analyzing execution plans (`EXPLAIN ANALYZE`)

Milestone 2: In-Memory Fleet Tracking with Redis GEO
├── High-frequency location ingestion endpoint
├── Redis `GEOADD` and `GEOSEARCH` operations for nearest-driver lookups
├── Driver state lifecycle (ONLINE, BUSY, OFFLINE) with TTLs
└── Geohash mechanics and precision levels

Milestone 3: Uber H3 Discrete Global Grid Integration
├── Converting GPS lat/lng coordinates to H3 hexagonal index cells
├── Spatial aggregation: Counting driver supply vs order demand per H3 cell
├── Dynamic surge pricing calculation per hexagon
└── Hexagonal neighbor lookups (k-ring search) for expanded dispatch

Milestone 4: Geofencing & Polygon Event Triggers
├── Delivery zone polygon creation and verification
├── Point-in-Polygon (PIP) checks: Determining if driver entered a restricted zone
├── Push notification delivery when courier arrives within 100 meters of customer
└── Handling GPS drift and noise filtering algorithms

Milestone 5: Dispatch Engine & Atomic Driver Locking
├── Multi-criteria driver ranking (distance, rating, vehicle type)
├── Distributed locking to prevent dispatch race conditions (two orders assigning same driver)
├── Timeout-and-reassign state machine if driver fails to accept offer within 15 seconds
└── Dead-Letter handling for unfulfilled orders

Milestone 6: High-Scale GPS Simulation & Load Testing
├── Simulating 5,000 virtual drivers moving along real road networks
├── Benchmarking location write throughput (target: 10,000 writes/sec)
└── Measuring p99 dispatch latency under concurrent order spikes
```

---

## 7. Failure Modes & Adversarial Verification Labs

1. **The Spatial Cross-Border Geofence Test:** Ingest a GPS coordinate located 1 meter outside a delivery boundary polygon. Verify that PostGIS `ST_Contains` returns false and rejects the order with an RFC 9457 out-of-zone error.
2. **The Simultaneous Order Dispatch Collision:** Trigger 2 orders simultaneously for the exact same location with only 1 available driver in range. Prove using Redis distributed locks that only 1 order locks the driver, while the second order cleanly falls back to expanding its search radius.
3. **The GPS Noise Spike:** Feed a sequence of GPS points where a driver suddenly teleports 5 kilometers in 1 second (impossible speed anomaly). Verify that the ingestion validation pipeline rejects the anomalous coordinate and maintains route integrity.
