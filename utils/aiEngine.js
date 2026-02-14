// AI decision-making engine for competitive mode rival factions.
// Rule-based priority with upgrade logic, research, defense, and multi-building per tick.

import {
  BUILDING_TYPES,
  validateBuildPlacement,
  getBuildableCells,
  getBaseAnchors,
  countBuildingsForBase,
  getNearestBase,
  getUpgradeOptions,
  GRID_WIDTH,
  GRID_HEIGHT,
  MAX_UPGRADE_LEVEL,
} from '~/utils/gameEngine'
import { getTerrainAt, getProductionMultiplier } from '~/utils/terrain'
import { hexNeighbors, hexDistance } from '~/utils/hex'

const BUILDING_MAP = Object.fromEntries(BUILDING_TYPES.map((b) => [b.id, b]))

// How many buildings the AI can place per tick (scales with tick count)
function getMaxBuildsPerTick(state) {
  const tick = state.tickCount || 0
  if (tick < 20) return 1
  if (tick < 60) return 2
  return 3
}

/**
 * Plan AI actions for one tick. Returns array of actions:
 * - { action: 'build', type, x, y }
 * - { action: 'upgrade', x, y, branch }
 */
export function planAITurn(state, terrainMap, globalOccupied) {
  if (!state || !state.alive) return []

  const actions = []
  const maxBuilds = getMaxBuildsPerTick(state)

  // Try upgrading existing buildings first (cheap, high impact)
  const upgradeAction = pickUpgrade(state)
  if (upgradeAction) {
    actions.push(upgradeAction)
  }

  // Build up to maxBuilds buildings
  const buildTypes = pickBuildingTypes(state, maxBuilds)
  for (const buildType of buildTypes) {
    const cell = findBestCell(state, buildType, terrainMap, globalOccupied)
    if (cell) {
      actions.push({ action: 'build', type: buildType, x: cell.x, y: cell.y })
    }
  }

  return actions
}

/**
 * Pick the best building to upgrade. Returns action or null.
 */
function pickUpgrade(state) {
  const res = state.resources || {}
  // Need enough minerals and energy for upgrade (12 * nextLevel minerals, 5 * nextLevel energy)
  if ((res.minerals || 0) < 24 || (res.energy || 0) < 10) return null

  // Prioritize upgrading production buildings
  const upgradeOrder = [
    'RTG',
    'SOLAR_PANEL',
    'MINE',
    'WATER_EXTRACTOR',
    'HYDROPONIC_FARM',
    'OXYGEN_GENERATOR',
    'RESEARCH_LAB',
    'DEFENSE_TURRET',
  ]

  for (const typeId of upgradeOrder) {
    for (const pb of state.placedBuildings || []) {
      if (pb.type !== typeId || pb.isUnderConstruction) continue
      const level = pb.level || 1
      if (level >= MAX_UPGRADE_LEVEL) continue

      const nextLevel = level + 1
      const cost = { minerals: 12 * nextLevel, energy: 5 * nextLevel }
      if (
        (res.minerals || 0) < cost.minerals ||
        (res.energy || 0) < cost.energy
      )
        continue

      // Pick branch choice if needed
      const options = getUpgradeOptions(state, pb.x, pb.y)
      let branch = null
      if (options?.branches) {
        // Pick the first available branch (production-focused)
        branch = options.branches[0]?.id || null
      }

      return { action: 'upgrade', x: pb.x, y: pb.y, branch }
    }
  }

  return null
}

/**
 * Decide which building types to build (up to maxCount), in priority order.
 */
function pickBuildingTypes(state, maxCount) {
  const res = state.resources || {}
  const pop = (state.colonists || []).length
  const deltas = estimateDeltas(state, pop)
  const types = []

  // Critical: if energy delta is negative or energy is low, build power
  if (deltas.energy < 0 || res.energy < 20) {
    if (canBuildType(state, 'SOLAR_PANEL')) types.push('SOLAR_PANEL')
    else if (canBuildType(state, 'RTG')) types.push('RTG')
  }

  // Water needed
  if (types.length < maxCount && (deltas.water < 0 || res.water < 15)) {
    if (canBuildType(state, 'WATER_EXTRACTOR')) types.push('WATER_EXTRACTOR')
  }

  // Food needed
  if (types.length < maxCount && (deltas.food < 0 || res.food < 15)) {
    if (canBuildType(state, 'HYDROPONIC_FARM')) types.push('HYDROPONIC_FARM')
  }

  // Oxygen needed
  if (types.length < maxCount && (deltas.oxygen < 0 || res.oxygen < 20)) {
    if (canBuildType(state, 'OXYGEN_GENERATOR')) types.push('OXYGEN_GENERATOR')
  }

  // Minerals for economy
  if (types.length < maxCount && res.minerals < 30) {
    if (canBuildType(state, 'MINE')) types.push('MINE')
  }

  // Population capacity — build habitat if near cap
  if (types.length < maxCount && pop >= state.populationCapacity - 2) {
    if (canBuildType(state, 'HABITAT')) types.push('HABITAT')
  }

  // Research — build lab when economy is stable (tick > 30, positive deltas)
  if (
    types.length < maxCount &&
    (state.tickCount || 0) > 30 &&
    deltas.energy >= 5 &&
    deltas.water >= 2
  ) {
    if (canBuildType(state, 'RESEARCH_LAB')) types.push('RESEARCH_LAB')
  }

  // Defense — build turret/radar when threat level rises (tick > 80)
  if (types.length < maxCount && (state.tickCount || 0) > 80) {
    if (canBuildType(state, 'RADAR_STATION')) types.push('RADAR_STATION')
    else if (canBuildType(state, 'DEFENSE_TURRET')) types.push('DEFENSE_TURRET')
  }

  // Outpost Hub — expand when building caps are full (tick > 60)
  if (types.length < maxCount && (state.tickCount || 0) > 60) {
    const anchors = getBaseAnchors(state)
    const allCapped = anchors.every((anchor) => {
      const solarCount = countBuildingsForBase(state, anchor, 'SOLAR_PANEL')
      const mineCount = countBuildingsForBase(state, anchor, 'MINE')
      return solarCount >= 2 && mineCount >= 2
    })
    if (allCapped && canBuildType(state, 'OUTPOST_HUB')) {
      types.push('OUTPOST_HUB')
    }
  }

  // Expansion: fill remaining slots with pipeline
  while (types.length < maxCount) {
    if (canBuildType(state, 'PIPELINE')) {
      types.push('PIPELINE')
      break // Only one pipeline per tick to avoid clumping
    }
    break
  }

  return types
}

/**
 * Estimate resource deltas from current buildings, including level multipliers.
 */
function estimateDeltas(state, pop) {
  const deltas = { energy: 0, food: 0, water: 0, minerals: 0, oxygen: 0 }
  for (const pb of state.placedBuildings || []) {
    if (pb.isUnderConstruction) continue
    if (pb.disabledUntilTick && pb.disabledUntilTick > (state.tickCount || 0))
      continue
    const bType = BUILDING_MAP[pb.type]
    if (!bType) continue
    const levelMult = 1 + ((pb.level || 1) - 1) * 0.3
    for (const [res, amt] of Object.entries(bType.produces || {})) {
      deltas[res] = (deltas[res] || 0) + amt * levelMult
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
