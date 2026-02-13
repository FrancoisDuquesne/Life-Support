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

// --- Anomaly Types (mission targets, ~2% of tiles, far from center) ---

export const ANOMALY_TYPES = {
  SIGNAL_SOURCE: {
    id: 'SIGNAL_SOURCE',
    name: 'Unknown Signal',
    description: 'A faint electronic signal of unknown origin',
    missionType: 'investigate_anomaly',
  },
  CRASH_SITE: {
    id: 'CRASH_SITE',
    name: 'Crash Site',
    description: 'Debris from an unidentified craft',
    missionType: 'salvage_run',
  },
  GEOLOGICAL_FEATURE: {
    id: 'GEOLOGICAL_FEATURE',
    name: 'Geological Anomaly',
    description: 'An unusual rock formation worth studying',
    missionType: 'explore_sector',
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

// Biome selection thresholds based on combined terrain noise.
const BIOME_THRESHOLDS = {
  CRATER_MAX: 0.15,
  VOLCANIC_MAX: 0.3,
  HIGHLANDS_MAX: 0.45,
  PLAINS_MAX: 0.8,
}

// Spawn thresholds for secondary features.
const FEATURE_THRESHOLDS = {
  DEPOSIT_MIN: 0.92,
  HAZARD_MIN: 0.95,
}

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
      if (combined < BIOME_THRESHOLDS.CRATER_MAX) {
        terrain = TERRAIN_TYPES.CRATER
      } else if (combined < BIOME_THRESHOLDS.VOLCANIC_MAX) {
        terrain = TERRAIN_TYPES.VOLCANIC
      } else if (combined < BIOME_THRESHOLDS.HIGHLANDS_MAX) {
        terrain = TERRAIN_TYPES.HIGHLANDS
      } else if (combined < BIOME_THRESHOLDS.PLAINS_MAX) {
        terrain = TERRAIN_TYPES.PLAINS
      } else {
        terrain = TERRAIN_TYPES.ICE_FIELD
      }

      // Resource deposits — biased by terrain, ~8% of tiles
      let deposit = null
      const depositNoise = valueNoise(x, y, seed + 5000, 3)
      if (depositNoise > FEATURE_THRESHOLDS.DEPOSIT_MIN) {
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
      if (hazardNoise > FEATURE_THRESHOLDS.HAZARD_MIN) {
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

      // Anomalies — ~2% of tiles, only far from center (distance >= 12)
      let anomaly = null
      const cx = Math.floor(gw / 2)
      const cy = Math.floor(gh / 2)
      const dx = x - cx
      const dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist >= 12 && !deposit && !hazard) {
        const anomalyNoise = valueNoise(x, y, seed + 12000, 3)
        if (anomalyNoise > 0.98) {
          const anomalyRoll = rng()
          if (anomalyRoll < 0.33) {
            anomaly = ANOMALY_TYPES.SIGNAL_SOURCE
          } else if (anomalyRoll < 0.66) {
            anomaly = ANOMALY_TYPES.CRASH_SITE
          } else {
            anomaly = ANOMALY_TYPES.GEOLOGICAL_FEATURE
          }
        }
      }

      data[y * gw + x] = { terrain, deposit, hazard, anomaly }
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
    return {
      terrain: TERRAIN_TYPES.PLAINS,
      deposit: null,
      hazard: null,
      anomaly: null,
    }
  return (
    terrainMap[y * gridWidth + x] || {
      terrain: TERRAIN_TYPES.PLAINS,
      deposit: null,
      hazard: null,
      anomaly: null,
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
