// AI decision-making engine for competitive mode rival factions.
// Rule-based priority: energy → water → food → O2 → minerals → habitats → research → expansion.

import {
  BUILDING_TYPES,
  validateBuildPlacement,
  getBuildableCells,
  getBaseAnchors,
  countBuildingsForBase,
  getNearestBase,
  GRID_WIDTH,
  GRID_HEIGHT,
} from '~/utils/gameEngine'
import { getTerrainAt, getProductionMultiplier } from '~/utils/terrain'
import { hexNeighbors, hexDistance } from '~/utils/hex'

const BUILDING_MAP = Object.fromEntries(BUILDING_TYPES.map((b) => [b.id, b]))

/**
 * Plan AI actions for one tick. Returns array of { action: 'build', type, x, y }.
 * Rate-limited to max 1 building per tick.
 */
export function planAITurn(state, terrainMap, globalOccupied) {
  if (!state || !state.alive) return []

  const actions = []

  // Determine what to build based on resource deficits
  const buildType = pickBuildingType(state)
  if (!buildType) return actions

  // Find best cell for this building type
  const cell = findBestCell(state, buildType, terrainMap, globalOccupied)
  if (cell) {
    actions.push({ action: 'build', type: buildType, x: cell.x, y: cell.y })
  }

  return actions
}

/**
 * Decide which building type to build based on current needs.
 */
function pickBuildingType(state) {
  const res = state.resources || {}
  const pop = (state.colonists || []).length

  // Compute approximate deltas from current buildings
  const deltas = estimateDeltas(state, pop)

  // Critical: if energy delta is negative or energy is low, build power
  if (deltas.energy < 0 || res.energy < 20) {
    if (canBuildType(state, 'SOLAR_PANEL')) return 'SOLAR_PANEL'
    if (canBuildType(state, 'RTG')) return 'RTG'
  }

  // Water needed
  if (deltas.water < 0 || res.water < 15) {
    if (canBuildType(state, 'WATER_EXTRACTOR')) return 'WATER_EXTRACTOR'
  }

  // Food needed
  if (deltas.food < 0 || res.food < 15) {
    if (canBuildType(state, 'HYDROPONIC_FARM')) return 'HYDROPONIC_FARM'
  }

  // Oxygen needed
  if (deltas.oxygen < 0 || res.oxygen < 20) {
    if (canBuildType(state, 'OXYGEN_GENERATOR')) return 'OXYGEN_GENERATOR'
  }

  // Minerals for economy
  if (res.minerals < 30) {
    if (canBuildType(state, 'MINE')) return 'MINE'
  }

  // Population capacity — build habitat if near cap
  if (pop >= state.populationCapacity - 2) {
    if (canBuildType(state, 'HABITAT')) return 'HABITAT'
  }

  // Expansion: always try to lay pipeline to grow territory
  if (canBuildType(state, 'PIPELINE')) return 'PIPELINE'

  return null
}

/**
 * Estimate resource deltas from current buildings (simplified).
 */
function estimateDeltas(state, pop) {
  const deltas = { energy: 0, food: 0, water: 0, minerals: 0, oxygen: 0 }
  for (const pb of state.placedBuildings || []) {
    if (pb.isUnderConstruction) continue
    const bType = BUILDING_MAP[pb.type]
    if (!bType) continue
    for (const [res, amt] of Object.entries(bType.produces || {})) {
      deltas[res] = (deltas[res] || 0) + amt
    }
    for (const [res, amt] of Object.entries(bType.consumes || {})) {
      deltas[res] = (deltas[res] || 0) - amt
    }
  }
  // Population consumption
  deltas.food -= pop > 0 ? Math.max(1, Math.floor(pop / 2)) : 0
  deltas.water -= pop > 0 ? Math.max(1, Math.floor(pop / 3)) : 0
  deltas.oxygen -= pop
  return deltas
}

/**
 * Check if a building type can be afforded and has available cap.
 */
function canBuildType(state, typeId) {
  const bType = BUILDING_MAP[typeId]
  if (!bType || bType.buildable === false) return false

  // Check cost
  for (const [res, amt] of Object.entries(bType.cost || {})) {
    if ((state.resources[res] || 0) < amt) return false
  }

  // Check per-base cap — at least one base with room
  if (bType.maxPerBase) {
    const anchors = getBaseAnchors(state)
    let hasRoom = false
    for (const anchor of anchors) {
      const count = countBuildingsForBase(state, anchor, typeId)
      if (count < bType.maxPerBase) {
        hasRoom = true
        break
      }
    }
    if (!hasRoom) return false
  }

  return true
}

/**
 * Find the best cell to place a building of the given type.
 */
function findBestCell(state, typeId, terrainMap, globalOccupied) {
  const bType = BUILDING_MAP[typeId]
  if (!bType) return null

  const buildable = getBuildableCells(state)
  if (buildable.size === 0) return null

  // For pipelines, find cells adjacent to existing structures that expand territory
  if (typeId === 'PIPELINE') {
    return findPipelineExpansionCell(
      state,
      buildable,
      terrainMap,
      globalOccupied,
    )
  }

  // For other buildings, find adjacent-to-pipeline cells with best terrain
  let bestCell = null
  let bestScore = -Infinity

  for (const key of buildable) {
    const [x, y] = key.split(',').map(Number)

    const validation = validateBuildPlacement(state, typeId, x, y, terrainMap, {
      globalOccupied,
    })
    if (!validation.ok) continue

    const score = scoreCellForBuilding(state, x, y, terrainMap, bType)
    if (score > bestScore) {
      bestScore = score
      bestCell = { x, y }
    }
  }

  return bestCell
}

/**
 * Score a cell for a given building type. Higher = better.
 */
function scoreCellForBuilding(state, x, y, terrainMap, bType) {
  let score = 0

  // Terrain bonus
  if (terrainMap) {
    const tile = getTerrainAt(terrainMap, x, y, GRID_WIDTH)
    if (tile) {
      const mult = getProductionMultiplier(bType, tile)
      score += (mult - 1) * 50 // Bonus for terrain deposits
      if (tile.hazard) score -= 30
    }
  }

  // Proximity to nearest base anchor (closer = better)
  const nearest = getNearestBase(state, x, y)
  if (nearest) {
    const dist = hexDistance(nearest.x, nearest.y, x, y)
    score -= dist * 2
  }

  return score
}

/**
 * Find a good cell to extend pipeline for territory expansion.
 */
function findPipelineExpansionCell(
  state,
  buildable,
  terrainMap,
  globalOccupied,
) {
  const occupied = state.occupiedCells || new Set()
  let bestCell = null
  let bestScore = -Infinity

  // Find cells adjacent to existing structures (required for pipeline)
  for (const key of buildable) {
    const [x, y] = key.split(',').map(Number)
    if (occupied.has(key)) continue
    if (globalOccupied && globalOccupied.has(key)) continue

    const validation = validateBuildPlacement(
      state,
      'PIPELINE',
      x,
      y,
      terrainMap,
      { globalOccupied },
    )
    if (!validation.ok) continue

    // Score: prefer cells that extend outward from colony center
    let score = 0
    const nearest = getNearestBase(state, x, y)
    if (nearest) {
      // Prefer medium distance — not too close (already covered), not too far
      const dist = hexDistance(nearest.x, nearest.y, x, y)
      score += dist * 3 // Prefer farther to expand territory
      if (dist > 12) score -= (dist - 12) * 5 // But not too far
    }

    // Bonus for cells near deposits
    if (terrainMap) {
      const tile = getTerrainAt(terrainMap, x, y, GRID_WIDTH)
      if (tile?.deposit) score += 15
    }

    // Bonus for cells adjacent to unoccupied space (more room to build)
    let freeNeighbors = 0
    for (const [nx, ny] of hexNeighbors(x, y)) {
      if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue
      const nKey = nx + ',' + ny
      if (
        !occupied.has(nKey) &&
        (!globalOccupied || !globalOccupied.has(nKey))
      ) {
        freeNeighbors++
      }
    }
    score += freeNeighbors * 2

    if (score > bestScore) {
      bestScore = score
      bestCell = { x, y }
    }
  }

  return bestCell
}
