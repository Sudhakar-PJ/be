# Geofencing & Point-in-Polygon Algorithms

## 1. Point-in-Polygon (PIP) Ray-Casting Algorithm
To determine if coordinate $P$ is inside polygon $V$:
- Cast a horizontal ray from $P$ to infinity $(+\infty, y)$.
- Count the number of times the ray intersects the polygon edges.
- **Odd intersections:** Point is INSIDE.
- **Even intersections:** Point is OUTSIDE.

## 2. Two-Phase Optimization
1. **Phase 1: Bounding Box Filter (Fast Reject):**
   Check if $P$ falls within $[x_{min}, y_{min}, x_{max}, y_{max}]$. If outside, return false in $O(1)$.
2. **Phase 2: Exact Ray-Casting:**
   Only run PIP if point is within the bounding box.
