// Hex utility functions (odd-q offset coordinates, flat-top)

export function hexNeighbors(col, row) {
  const parity = col & 1
  if (parity === 0) {
    return [[col+1,row-1],[col+1,row],[col,row+1],[col-1,row],[col-1,row-1],[col,row-1]]
  } else {
    return [[col+1,row],[col+1,row+1],[col,row+1],[col-1,row+1],[col-1,row],[col,row-1]]
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
  for (let c = Math.max(0, col - radius - 1); c <= Math.min(gw - 1, col + radius + 1); c++) {
    for (let r = Math.max(0, row - radius - 1); r <= Math.min(gh - 1, row + radius + 1); r++) {
      if (hexDistance(col, row, c, r) <= radius) {
        result.push([c, r])
      }
    }
  }
  return result
}

// Seeded PRNG (simple mulberry32)
export function mulberry32(seed) {
  return function() {
    seed |= 0
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
