# PostGIS Spatial Mechanics & Indexing

## 1. Geometry vs. Geography
- `GEOMETRY`: Planar Cartesian coordinates $(x, y)$. Fast calculations, but Euclidean distances on planar projections distort true Earth curvature across large distances.
- `GEOGRAPHY`: Spherical coordinates $(\text{longitude}, \text{latitude})$ on the WGS 84 ellipsoid (SRID 4326). Distances are accurately measured in meters using Great Circle / geodesic math.

## 2. GiST R-Tree Indexing
B-Trees cannot index multi-dimensional coordinates. GiST (Generalized Search Tree) implements an **R-Tree** hierarchy of Minimum Bounding Boxes (MBR):
```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE drivers (
    id UUID PRIMARY KEY,
    name VARCHAR(100),
    location GEOGRAPHY(Point, 4326) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_drivers_location ON drivers USING GIST (location);
```

## 3. High-Performance Spatial Querying
Always use index-accelerated spatial operators:
```sql
-- GOOD: Uses GiST index to filter within 3000 meters
SELECT id, ST_Distance(location, ST_MakePoint($1, $2)::geography) AS distance_meters
FROM drivers
WHERE ST_DWithin(location, ST_MakePoint($1, $2)::geography, 3000)
ORDER BY location <-> ST_MakePoint($1, $2)::geography
LIMIT 10;
```
