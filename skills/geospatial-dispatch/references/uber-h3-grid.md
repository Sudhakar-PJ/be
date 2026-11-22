# Uber H3 Discrete Global Grid

## 1. Why Hexagons?
- **Equal Distance to Neighbors:** Unlike squares (which have orthogonal neighbors at distance $1$ and diagonal neighbors at $\sqrt{2}$), a hexagon has 6 continuous neighbors all at identical center-to-center distances.
- **Natural Clumping:** Hexagons approximate circles better than any other regular polygon that tessellates a plane.

## 2. Resolution Hierarchy
- **Resolution 7:** Area ~5.16 km², edge ~1.22 km (City zone / borough level).
- **Resolution 8:** Area ~0.74 km², edge ~461 m (Neighborhood dispatch cluster).
- **Resolution 9:** Area ~0.10 km², edge ~174 m (Block / street-level pickup matching).

## 3. Fast Proximity with k-Rings
Instead of calculating distances to 50,000 drivers:
1. Determine pickup location H3 index at resolution 8: `h3_index = latLngToCell(lat, lng, 8)`.
2. Get k-ring neighbors: `cells = gridDisk(h3_index, 1)` (returns 7 cells: origin + 6 adjacent).
3. Query Redis sets for drivers currently residing in those 7 hexagonal cells:
   `SUNION driver_cells:cell_1 driver_cells:cell_2 ... driver_cells:cell_7`.
   Runtime: $O(1)$ set union!
