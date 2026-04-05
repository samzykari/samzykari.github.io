/**
 * Axis-aligned bounding box and near-miss collision detection.
 * All checks are done in world-space using simple numeric comparisons
 * to avoid creating temporary Vector3 objects in the hot loop.
 */

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Check overlap of two AABBs (2D top-down, ignoring Y). */
export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.minX <= b.maxX &&
    a.maxX >= b.minX &&
    a.minZ <= b.maxZ &&
    a.maxZ >= b.minZ
  );
}

/**
 * Build an AABB centred on (cx, cz) with given half-widths.
 * Reuses a provided AABB object to avoid allocation.
 */
export function buildAABB(
  out: AABB,
  cx: number,
  cz: number,
  halfW: number,
  halfL: number
): AABB {
  out.minX = cx - halfW;
  out.maxX = cx + halfW;
  out.minZ = cz - halfL;
  out.maxZ = cz + halfL;
  return out;
}

// Pre-allocated scratch AABBs for hot-loop use
export const scratchA: AABB = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
export const scratchB: AABB = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
export const scratchC: AABB = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
