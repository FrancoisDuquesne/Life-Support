// Terrain system — types, deposits, hazards, and procedural generation
import { valueNoise } from '~/utils/drawing'
import { mulberry32 } from '~/utils/hex'

// --- Terrain Types ---

export const TERRAIN_TYPES = {
  PLAINS: { id: 'PLAINS', name: 'Martian Plains', hue: 28, sat: 30, light: 58 },
  HIGHLANDS: {
    id: 'HIGHLANDS',
    name: 'Rocky Highlands',
    hue: 20,
    sat: 20,
    light: 48,
  },
  CRATER: { id: 'CRATER', name: 'Crater Basin', hue: 30, sat: 15, light: 40 },
  ICE_FIELD: {
    id: 'ICE_FIELD',
    name: 'Ice Field',
    hue: 200,
    sat: 40,
    light: 70,
  },
  VOLCANIC: {
    id: 'VOLCANIC',
    name: 'Volcanic Zone',
    hue: 10,
    sat: 50,
    light: 35,
  },
}

// --- Resource Deposits ---

export const DEPOSIT_TYPES = {
  MINERAL_VEIN: {
    id: 'MINERAL_VEIN',
    name: 'Mineral Vein',
    resource: 'minerals',
    multiplier: 1.5,
  },
  ICE_DEPOSIT: {
    id: 'ICE_DEPOSIT',
    name: 'Ice Deposit',
    resource: 'water',
    multiplier: 1.5,
  },
  GEOTHERMAL_VENT: {
    id: 'GEOTHERMAL_VENT',
    name: 'Geothermal Vent',
    resource: 'energy',
    multiplier: 1.5,
  },
  RARE_EARTH: {
    id: 'RARE_EARTH',
    name: 'Rare Earth Deposit',
    resource: 'research',
    multiplier: 1.0,
  },
}

// --- Hazard Zones ---

export const HAZARD_TYPES = {
  RADIATION: {
    id: 'RADIATION',
    name: 'Radiation Hotspot',
    effect: 'block_growth',
  },
  UNSTABLE: {
    id: 'UNSTABLE',
    name: 'Unstable Ground',
    effect: 'cost_increase',
    costMultiplier: 1.5,
  },
  TOXIC_VENT: {
    id: 'TOXIC_VENT',
    name: 'Toxic Vent',
    effect: 'production_penalty',
    productionMultiplier: 0.75,
  },
}

// --- Terrain Map Cache ---

let terrainMapCache = null

/**
 * Generate (or return cached) terrain map for the given grid dimensions and seed.
 * Returns a flat Array of { terrain, deposit, hazard } objects, indexed by row * gw + col.
 */
export function generateTerrainMap(gw, gh, seed) {
  if (
    terrainMapCache &&
    terrainMapCache.gw === gw &&
    terrainMapCache.gh === gh &&
    terrainMapCache.seed === seed
  ) {
    return terrainMapCache.data
  }

  const rng = mulberry32(seed)
  const data = new Array(gw * gh)

  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      // Terrain type from multi-octave noise
      const n1 = valueNoise(x, y, seed, 8)
      const n2 = valueNoise(x, y, seed + 1000, 4)
      const combined = n1 * 0.6 + n2 * 0.4

      let terrain
      if (combined < 0.15) {
        terrain = TERRAIN_TYPES.CRATER
      } else if (combined < 0.3) {
        terrain = TERRAIN_TYPES.VOLCANIC
      } else if (combined < 0.45) {
        terrain = TERRAIN_TYPES.HIGHLANDS
      } else if (combined < 0.8) {
        terrain = TERRAIN_TYPES.PLAINS
      } else {
        terrain = TERRAIN_TYPES.ICE_FIELD
      }

      // Resource deposits — biased by terrain, ~8% of tiles
      let deposit = null
      const depositNoise = valueNoise(x, y, seed + 5000, 3)
      if (depositNoise > 0.92) {
        if (
          terrain === TERRAIN_TYPES.HIGHLANDS ||
          terrain === TERRAIN_TYPES.PLAINS
        ) {
          deposit = DEPOSIT_TYPES.MINERAL_VEIN
        } else if (terrain === TERRAIN_TYPES.ICE_FIELD) {
          deposit = DEPOSIT_TYPES.ICE_DEPOSIT
        } else if (terrain === TERRAIN_TYPES.VOLCANIC) {
          deposit = DEPOSIT_TYPES.GEOTHERMAL_VENT
        } else if (terrain === TERRAIN_TYPES.CRATER) {
          deposit = DEPOSIT_TYPES.RARE_EARTH
        }
      }

      // Hazard zones — biased by terrain, ~5% of tiles
      let hazard = null
      const hazardNoise = valueNoise(x, y, seed + 9000, 3)
      if (hazardNoise > 0.95) {
        if (
          terrain === TERRAIN_TYPES.CRATER ||
          terrain === TERRAIN_TYPES.PLAINS
        ) {
          hazard = HAZARD_TYPES.RADIATION
        } else if (terrain === TERRAIN_TYPES.HIGHLANDS) {
          hazard = HAZARD_TYPES.UNSTABLE
        } else if (terrain === TERRAIN_TYPES.VOLCANIC) {
          hazard = HAZARD_TYPES.TOXIC_VENT
        }
      }

      // A tile can't have both a deposit and a hazard — deposit wins
      if (deposit && hazard) hazard = null

      data[y * gw + x] = { terrain, deposit, hazard }
    }
  }

  terrainMapCache = { gw, gh, seed, data }
  return data
}

/**
 * Clear the terrain map cache (called on reset).
 */
export function clearTerrainCache() {
  terrainMapCache = null
}

/**
 * Look up terrain data for a specific tile.
 */
export function getTerrainAt(terrainMap, x, y, gridWidth) {
  if (!terrainMap)
    return { terrain: TERRAIN_TYPES.PLAINS, deposit: null, hazard: null }
  return (
    terrainMap[y * gridWidth + x] || {
      terrain: TERRAIN_TYPES.PLAINS,
      deposit: null,
      hazard: null,
    }
  )
}

/**
 * Compute production multiplier for a building on a given terrain tile.
 * Takes into account deposits (resource match → bonus) and hazards (toxic → penalty).
 * Also applies highlands bonus for solar panels.
 */
export function getProductionMultiplier(buildingType, terrainTile) {
  let mult = 1.0

  // Deposit bonus: if deposit resource matches any of the building's produced resources
  if (terrainTile.deposit) {
    const depositRes = terrainTile.deposit.resource
    if (buildingType.produces && buildingType.produces[depositRes]) {
      mult *= terrainTile.deposit.multiplier
    }
  }

  // Highlands elevation bonus for solar panels
  if (
    terrainTile.terrain === TERRAIN_TYPES.HIGHLANDS &&
    buildingType.id === 'SOLAR_PANEL'
  ) {
    mult *= 1.2
  }

  // Toxic vent production penalty
  if (terrainTile.hazard && terrainTile.hazard.id === 'TOXIC_VENT') {
    mult *= HAZARD_TYPES.TOXIC_VENT.productionMultiplier
  }

  return mult
}

/**
 * Compute placement cost multiplier for building on a given terrain tile.
 * Unstable ground increases mineral cost by 50%.
 */
export function getPlacementCostMultiplier(terrainTile) {
  if (terrainTile.hazard && terrainTile.hazard.id === 'UNSTABLE') {
    return HAZARD_TYPES.UNSTABLE.costMultiplier
  }
  return 1.0
}

/**
 * Get a human-readable description of terrain bonuses for a building type on a tile.
 * Returns array of strings like ["+50% energy (Geothermal Vent)", "-25% production (Toxic Vent)"].
 */
export function getTerrainBonusText(buildingType, terrainTile) {
  const bonuses = []

  if (terrainTile.deposit) {
    const depositRes = terrainTile.deposit.resource
    if (buildingType.produces && buildingType.produces[depositRes]) {
      const pct = Math.round((terrainTile.deposit.multiplier - 1) * 100)
      bonuses.push(`+${pct}% ${depositRes} (${terrainTile.deposit.name})`)
    }
  }

  if (
    terrainTile.terrain === TERRAIN_TYPES.HIGHLANDS &&
    buildingType.id === 'SOLAR_PANEL'
  ) {
    bonuses.push('+20% energy (Highlands elevation)')
  }

  if (terrainTile.hazard && terrainTile.hazard.id === 'TOXIC_VENT') {
    bonuses.push('-25% production (Toxic Vent)')
  }

  if (terrainTile.hazard && terrainTile.hazard.id === 'UNSTABLE') {
    bonuses.push('+50% mineral cost (Unstable Ground)')
  }

  return bonuses
}
