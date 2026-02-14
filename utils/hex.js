// Hex utility functions (odd-q offset coordinates, flat-top)

export function hexNeighbors(col, row) {
  const parity = col & 1
  if (parity === 0) {
    return [
      [col + 1, row - 1],
      [col + 1, row],
      [col, row + 1],
      [col - 1, row],
      [col - 1, row - 1],
      [col, row - 1],
    ]
  } else {
    return [
      [col + 1, row],
      [col + 1, row + 1],
      [col, row + 1],
      [col - 1, row + 1],
      [col - 1, row],
      [col, row - 1],
    ]
  }
}

export function offsetToCube(col, row) {
  const x = col
  const z = row - (col - (col & 1)) / 2
  const y = -x - z
  return { x, y, z }
}

export function hexDistance(c1, r1, c2, r2) {
  const a = offsetToCube(c1, r1)
  const b = offsetToCube(c2, r2)
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z))
}

export function hexesInRadius(col, row, radius, gw, gh) {
  const result = []
  for (
    let c = Math.max(0, col - radius - 1);
    c <= Math.min(gw - 1, col + radius + 1);
    c++
  ) {
    for (
      let r = Math.max(0, row - radius - 1);
      r <= Math.min(gh - 1, row + radius + 1);
      r++
    ) {
      if (hexDistance(col, row, c, r) <= radius) {
        result.push([c, r])
      }
    }
  }
  return result
}

/**
 * A* pathfinding on hex grid.
 * Returns array of {x, y} steps from start to target (excluding start, including target),
 * or [] if unreachable.
 * walkableSet: Set of "x,y" strings, or null to treat all in-bounds tiles as walkable.
 */
export function hexPathfind(sx, sy, tx, ty, walkableSet, gw, gh) {
  if (sx === tx && sy === ty) return []
  const startKey = sx + ',' + sy
  const targetKey = tx + ',' + ty
  if (walkableSet && !walkableSet.has(targetKey)) return []

  const MAX_ITER = 2000
  const gScore = new Map()
  gScore.set(startKey, 0)
  const fScore = new Map()
  const h = hexDistance(sx, sy, tx, ty)
  fScore.set(startKey, h)
  const cameFrom = new Map()

  // Simple priority queue using sorted array (sufficient for hex grids)
  const open = [{ key: startKey, x: sx, y: sy, f: h }]
  const closed = new Set()
  let iter = 0

  while (open.length > 0 && iter < MAX_ITER) {
    iter++
    // Find node with lowest f
    let bestIdx = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i
    }
    const current = open[bestIdx]
    open.splice(bestIdx, 1)

    if (current.key === targetKey) {
      // Reconstruct path
      const path = []
      let k = targetKey
      while (cameFrom.has(k)) {
        const [px, py] = k.split(',').map(Number)
        path.push({ x: px, y: py })
        k = cameFrom.get(k)
      }
      path.reverse()
      return path
    }

    closed.add(current.key)
    const neighbors = hexNeighbors(current.x, current.y)
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue
      const nKey = nx + ',' + ny
      if (closed.has(nKey)) continue
      if (walkableSet && !walkableSet.has(nKey)) continue

      const tentativeG = (gScore.get(current.key) || 0) + 1
      const prevG = gScore.get(nKey)
      if (prevG !== undefined && tentativeG >= prevG) continue

      cameFrom.set(nKey, current.key)
      gScore.set(nKey, tentativeG)
      const f = tentativeG + hexDistance(nx, ny, tx, ty)
      fScore.set(nKey, f)

      // Add to open if not already there (or update)
      const existing = open.find((n) => n.key === nKey)
      if (existing) {
        existing.f = f
      } else {
        open.push({ key: nKey, x: nx, y: ny, f })
      }
    }
  }

  return [] // No path found
}

// Seeded PRNG (simple mulberry32)
export function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
