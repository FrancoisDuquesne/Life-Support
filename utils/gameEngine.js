// Pure JS game engine — port of Colony.java + ColonyService.java
// No server needed: all game logic runs in the browser.

import {
  getTerrainAt,
  getProductionMultiplier,
  getPlacementCostMultiplier,
  getTerrainBonusText,
} from '~/utils/terrain'
import {
  rollRandomEvent,
  applyEventStart,
  getActiveModifiers,
  cleanupExpiredEvents,
} from '~/utils/eventEngine'
import {
  processColonistTick,
  applyEventToColonists,
  applyBuildingLostPenalty,
  computeRoleBonuses,
  computeColonyEfficiency,
  checkPopulationGrowth,
  createInitialColonists,
} from '~/utils/colonistEngine'
import { hexNeighbors, hexDistance, hexesInRadius } from '~/utils/hex'

export const GRID_WIDTH = 64
export const GRID_HEIGHT = 64

export const START_RESOURCES = {
  energy: 100,
  food: 50,
  water: 50,
  minerals: 30,
  oxygen: 80,
}

// HP repair pool distributed evenly across all buildings per repair station
const REPAIR_POOL_PER_STATION = 5
// HP degradation per tick per building
const DEGRADATION_PER_TICK = 0.5
// Waste generated per active building per tick
const WASTE_PER_BUILDING = 0.3
// Waste generated per colonist per tick
const WASTE_PER_COLONIST = 0.2
// Waste reduced per active recycling center per tick
const WASTE_REDUCTION_PER_RECYCLER = 3
// Production penalty when waste overflows
export const WASTE_OVERFLOW_PENALTY = 0.75

export const BUILDING_TYPES = [
  {
    id: 'MDV_LANDING_SITE',
    name: 'MDV Landing Site',
    maxHp: 999,
    description: 'Mars Descent Vehicle and landing platform',
    cost: {},
    produces: {},
    consumes: {},
    buildable: false,
    footprintSize: 5,
    special: 'Starting structure',
  },
  {
    id: 'SOLAR_PANEL',
    name: 'Solar Panel',
    maxHp: 100,
    description: 'Generates energy from sunlight',
    cost: { minerals: 10 },
    produces: { energy: 5 },
    consumes: {},
  },
  {
    id: 'HYDROPONIC_FARM',
    name: 'Hydroponic Farm',
    maxHp: 100,
    description: 'Grows food using water and energy',
    cost: { minerals: 15, energy: 5 },
    produces: { food: 3 },
    consumes: { water: 1, energy: 1 },
  },
  {
    id: 'WATER_EXTRACTOR',
    name: 'Water Extractor',
    maxHp: 100,
    description: 'Extracts water from the Martian ice',
    cost: { minerals: 12 },
    produces: { water: 4 },
    consumes: { energy: 2 },
  },
  {
    id: 'MINE',
    name: 'Mining Facility',
    maxHp: 100,
    description: 'Extracts minerals from the ground',
    cost: { minerals: 8 },
    produces: { minerals: 2 },
    consumes: { energy: 3 },
    footprintSize: 2,
  },
  {
    id: 'HABITAT',
    name: 'Living Habitat',
    maxHp: 100,
    description: 'Houses colonists, increases population capacity by 5',
    cost: { minerals: 25, water: 10 },
    produces: {},
    consumes: { energy: 2 },
    footprintSize: 2,
  },
  {
    id: 'OXYGEN_GENERATOR',
    name: 'Oxygen Generator',
    maxHp: 100,
    description: 'Electrolyzes water to produce breathable oxygen',
    cost: { minerals: 15, energy: 10 },
    produces: { oxygen: 4 },
    consumes: { energy: 2, water: 1 },
  },
  {
    id: 'RTG',
    name: 'RTG Power Unit',
    maxHp: 100,
    description:
      'Radioisotope generator — steady power, unaffected by dust storms',
    cost: { minerals: 20 },
    produces: { energy: 3 },
    consumes: {},
  },
  {
    id: 'RECYCLING_CENTER',
    name: 'Recycling Center',
    maxHp: 100,
    description: 'Processes colony waste, reducing buildup by 3/tick',
    cost: { minerals: 20, energy: 10 },
    produces: {},
    consumes: { energy: 2 },
    special: 'Reduces waste by 3/tick',
    footprintSize: 3,
  },
  {
    id: 'REPAIR_STATION',
    name: 'Repair Station',
    maxHp: 100,
    description: 'Automated drones that maintain colony infrastructure',
    cost: { minerals: 25, energy: 15 },
    produces: {},
    consumes: { energy: 3, minerals: 1 },
    special: 'Repairs all buildings (5 HP/tick shared)',
  },
]

const BUILDING_MAP = Object.fromEntries(BUILDING_TYPES.map((b) => [b.id, b]))
const RESOURCE_KEYS = Object.keys(START_RESOURCES)

function cellKey(x, y) {
  return x + ',' + y
}

function collectFootprintCells(x, y, footprintSize) {
  const target = Math.max(1, footprintSize || 1)
  const cells = [{ x, y }]
  if (target === 1) return cells

  const queue = [{ x, y }]
  const seen = new Set([cellKey(x, y)])

  while (queue.length > 0 && cells.length < target) {
    const current = queue.shift()
    const neighbors = hexNeighbors(current.x, current.y)
    for (const [nx, ny] of neighbors) {
      const key = cellKey(nx, ny)
      if (seen.has(key)) continue
      seen.add(key)
      const next = { x: nx, y: ny }
      cells.push(next)
      queue.push(next)
      if (cells.length >= target) break
    }
  }

  return cells
}

export function getFootprintCellsForType(type, x, y) {
  const buildingType = BUILDING_MAP[type]
  if (!buildingType) return []
  return collectFootprintCells(x, y, buildingType.footprintSize)
}

function getBuildingCells(pb) {
  if (Array.isArray(pb.cells) && pb.cells.length > 0) return pb.cells
  return [{ x: pb.x, y: pb.y }]
}

function createCollapseReason(cause, hint) {
  return { cause, hint }
}

function isBuildingActive(pb, tickCount) {
  if (pb.disabledUntilTick && pb.disabledUntilTick > tickCount) return false
  if (pb.hp !== undefined && pb.hp <= 0) return false
  return true
}

function clampResourcesNonNegative(resources) {
  if (!resources) return
  for (const key of RESOURCE_KEYS) {
    resources[key] = Math.max(0, resources[key] || 0)
  }
}

/** Get population count (works with both colonist array and legacy integer) */
function getPopulation(state) {
  if (state.colonists) return state.colonists.length
  return state.population || 0
}

/**
 * Calculate terrain quality score at a location for MDV landing site.
 * Returns 0.0 (poor) to 1.0 (excellent) based on plains tiles, hazards, and nearby deposits.
 */
function calculateLandingSiteQuality(terrainMap, x, y) {
  if (!terrainMap) return 0.5

  const radius = 3
  let plainsCount = 0
  let totalCount = 0
  let hazardPenalty = 0
  let depositBonus = 0

  // Check tiles in radius using hexesInRadius from hex.js
  const tiles = hexesInRadius(x, y, radius, GRID_WIDTH, GRID_HEIGHT)

  for (const [tx, ty] of tiles) {
    const tile = getTerrainAt(terrainMap, tx, ty, GRID_WIDTH)
    if (!tile) continue

    totalCount++
    if (tile.terrain?.id === 'PLAINS') plainsCount++
    if (tile.hazard) hazardPenalty += 0.15
    if (tile.deposit && hexDistance(x, y, tx, ty) <= 2) depositBonus += 0.1
  }

  const plainsRatio = totalCount > 0 ? plainsCount / totalCount : 0
  const score = Math.max(0, Math.min(1, plainsRatio + depositBonus - hazardPenalty))

  return score
}

/**
 * Find optimal landing site for MDV - closest plains tile to center without hazards.
 */
function findLandingSite(terrainMap) {
  const centerX = Math.floor(GRID_WIDTH / 2)
  const centerY = Math.floor(GRID_HEIGHT / 2)
  if (!terrainMap || terrainMap.length === 0) {
    return { x: centerX, y: centerY }
  }

  let best = null
  for (let y = 1; y < GRID_HEIGHT - 1; y++) {
    for (let x = 1; x < GRID_WIDTH - 1; x++) {
      const tile = getTerrainAt(terrainMap, x, y, GRID_WIDTH)
      if (!tile || tile.terrain?.id !== 'PLAINS') continue
      if (tile.hazard) continue
      const dist = Math.abs(x - centerX) + Math.abs(y - centerY)
      if (!best || dist < best.dist) {
        best = { x, y, dist }
      }
    }
  }

  if (best) return { x: best.x, y: best.y }
  return { x: centerX, y: centerY }
}

export function createColonyState(options = {}) {
  const terrainSeed =
    options.terrainSeed || Math.floor(Math.random() * 2147483647)
  const state = {
    name: 'Life Support',
    resources: { ...START_RESOURCES },
    buildings: Object.fromEntries(
      BUILDING_TYPES.map((b) => [b.id.toLowerCase(), 0]),
    ),
    placedBuildings: [],
    occupiedCells: new Set(),
    nextBuildingId: 1,
    colonists: [],
    nextColonistId: 1,
    lastColonistArrivalTick: 0,
    populationCapacity: 10,
    tickCount: 0,
    alive: true,
    terrainSeed,
    activeEvents: [],
    nextEventId: 1,
    waste: 0,
    wasteCapacity: 50,
  }
  state.colonists = createInitialColonists(state)
  const landing = findLandingSite(options.terrainMap)

  // Calculate terrain quality at landing site to determine MDV footprint size
  const quality = calculateLandingSiteQuality(
    options.terrainMap,
    landing.x,
    landing.y,
  )

  // Map quality to footprint size: poor=4, average=5, good=6
  let mdvFootprintSize = 5 // default
  if (quality < 0.33) mdvFootprintSize = 4
  else if (quality >= 0.67) mdvFootprintSize = 6

  const mdvCells = collectFootprintCells(landing.x, landing.y, mdvFootprintSize)
  state.placedBuildings.push({
    id: state.nextBuildingId++,
    type: 'MDV_LANDING_SITE',
    x: landing.x,
    y: landing.y,
    cells: mdvCells,
    disabledUntilTick: 0,
    hp: 999,
    maxHp: 999,
  })
  state.buildings.mdv_landing_site = 1
  for (const cell of mdvCells) {
    state.occupiedCells.add(cellKey(cell.x, cell.y))
  }
  return state
}

/**
 * Compute resource deltas per tick, accounting for terrain, events, HP, waste, and colonist roles.
 * Shared by processTick (for actual mutation) and useColony (for UI preview).
 */
export function computeResourceDeltas(state, terrainMap) {
  const deltas = { energy: 0, food: 0, water: 0, minerals: 0, oxygen: 0 }
  const modifiers = getActiveModifiers(state)
  const wasteOverflow = state.waste > state.wasteCapacity
  const wastePenalty = wasteOverflow ? WASTE_OVERFLOW_PENALTY : 1.0

  // Colonist role bonuses and colony efficiency
  const roleBonuses = computeRoleBonuses(state)
  const colonyEff = computeColonyEfficiency(state.colonists)

  let activeBuildingCount = 0
  let activeRecyclerCount = 0

  for (const pb of state.placedBuildings) {
    const bType = BUILDING_MAP[pb.type]
    if (!bType) continue
    if (!isBuildingActive(pb, state.tickCount)) continue

    activeBuildingCount++

    const hpEfficiency = pb.hp !== undefined ? pb.hp / (pb.maxHp || 100) : 1

    const tile = getTerrainAt(terrainMap, pb.x, pb.y, GRID_WIDTH)
    const terrainMult = getProductionMultiplier(bType, tile)

    for (const [res, amt] of Object.entries(bType.produces)) {
      let effectiveMult = terrainMult * hpEfficiency * wastePenalty * colonyEff
      // Role bonus for this building type
      if (roleBonuses.buildingMultipliers[pb.type]) {
        effectiveMult *= roleBonuses.buildingMultipliers[pb.type]
      }
      effectiveMult *= roleBonuses.globalMultiplier
      // Event modifiers
      if (res === 'energy' && bType.id === 'SOLAR_PANEL') {
        effectiveMult *= modifiers.solarMultiplier
      }
      if (res === 'energy') {
        effectiveMult *= modifiers.energyMultiplier
      }
      deltas[res] = (deltas[res] || 0) + amt * effectiveMult
    }
    for (const [res, amt] of Object.entries(bType.consumes)) {
      deltas[res] = (deltas[res] || 0) - amt * hpEfficiency
    }

    if (bType.id === 'RECYCLING_CENTER') activeRecyclerCount++
  }

  // Population drain
  const pop = getPopulation(state)
  deltas.food -= Math.floor(pop / 2)
  deltas.water -= Math.floor(pop / 3)
  deltas.oxygen -= pop

  // Waste delta
  deltas.waste =
    activeBuildingCount * WASTE_PER_BUILDING +
    pop * WASTE_PER_COLONIST -
    activeRecyclerCount * WASTE_REDUCTION_PER_RECYCLER

  return deltas
}

/**
 * Process one game tick — production, consumption, events, colonists, population dynamics.
 * Mutates state in place. Returns { tick, events, colonyState, newRevealedTiles }.
 */
export function processTick(state, terrainMap, revealedTiles) {
  if (!state.alive) {
    return {
      tick: state.tickCount,
      events: 'Colony has collapsed!',
      colonyState: toSnapshot(state),
      newRevealedTiles: [],
    }
  }

  state.tickCount++
  let events = ''
  let newRevealedTiles = []

  // 1. Cleanup expired events
  const resolvedMsgs = cleanupExpiredEvents(state)
  for (const msg of resolvedMsgs) {
    events += msg + ' '
  }

  // 2. Roll for random events + apply colonist effects
  const newEvent = rollRandomEvent(state, revealedTiles)
  if (newEvent) {
    state.activeEvents.push(newEvent)
    const eventMsg = applyEventStart(state, newEvent, revealedTiles)
    if (eventMsg) events += eventMsg + ' '

    if (newEvent.data.revealedTiles) {
      newRevealedTiles = newEvent.data.revealedTiles
    }

    // Apply event effects to colonists
    if (state.colonists && state.colonists.length > 0) {
      const colonistMsgs = applyEventToColonists(state, newEvent.type)
      for (const msg of colonistMsgs) events += msg + ' '

      // Extra morale penalty if building was destroyed by meteor
      if (newEvent.data.buildingDestroyed) {
        applyBuildingLostPenalty(state)
      }
    }
  }

  // 3. Building degradation
  for (const pb of state.placedBuildings) {
    if (pb.hp !== undefined) {
      pb.hp = Math.max(0, pb.hp - DEGRADATION_PER_TICK)
    }
  }

  // 4. Repair station effect — distribute repair pool evenly
  const activeRepairStations = state.placedBuildings.filter(
    (pb) =>
      pb.type === 'REPAIR_STATION' && isBuildingActive(pb, state.tickCount),
  )
  if (activeRepairStations.length > 0 && state.placedBuildings.length > 0) {
    const totalPool = activeRepairStations.length * REPAIR_POOL_PER_STATION
    const repairPerBuilding = totalPool / state.placedBuildings.length
    for (const pb of state.placedBuildings) {
      if (pb.hp !== undefined) {
        pb.hp = Math.min(pb.maxHp, pb.hp + repairPerBuilding)
      }
    }
  }

  // 5. Remove dead buildings (hp <= 0) + morale penalty
  const deadBuildings = state.placedBuildings.filter(
    (pb) => pb.type !== 'MDV_LANDING_SITE' && pb.hp !== undefined && pb.hp <= 0,
  )
  for (const dead of deadBuildings) {
    for (const cell of getBuildingCells(dead)) {
      state.occupiedCells.delete(cellKey(cell.x, cell.y))
    }
    state.buildings[dead.type.toLowerCase()] = Math.max(
      0,
      (state.buildings[dead.type.toLowerCase()] || 0) - 1,
    )
    if (dead.type === 'HABITAT')
      state.populationCapacity = Math.max(10, state.populationCapacity - 5)
    const bName = BUILDING_MAP[dead.type]
      ? BUILDING_MAP[dead.type].name
      : dead.type
    events += `${bName} at (${dead.x},${dead.y}) collapsed from disrepair! `
  }
  if (deadBuildings.length > 0) {
    state.placedBuildings = state.placedBuildings.filter(
      (pb) => pb.hp === undefined || pb.hp > 0,
    )
    if (state.colonists && state.colonists.length > 0) {
      applyBuildingLostPenalty(state)
    }
  }

  // 6. Process colonist health, morale, deaths
  if (state.colonists && state.colonists.length > 0) {
    const colonistResult = processColonistTick(state)
    for (const msg of colonistResult.messages) events += msg + ' '
  }

  // Hard fail when no humans remain.
  if (state.colonists && state.colonists.length === 0) {
    state.alive = false
    state.collapseReason = createCollapseReason(
      'All colonists have died.',
      'Stabilize food, water, and oxygen before expanding your colony footprint.',
    )
    events += `COLONY COLLAPSED: ${state.collapseReason.cause} `
    return {
      tick: state.tickCount,
      events,
      colonyState: toSnapshot(state),
      newRevealedTiles,
    }
  }

  clampResourcesNonNegative(state.resources)

  // 7. Compute role bonuses + colony efficiency for production
  const roleBonuses = computeRoleBonuses(state)
  const colonyEff = computeColonyEfficiency(state.colonists)

  // 8. Building production & consumption
  const modifiers = getActiveModifiers(state)
  const wasteOverflow = state.waste > state.wasteCapacity
  const wastePenalty = wasteOverflow ? WASTE_OVERFLOW_PENALTY : 1.0

  for (const pb of state.placedBuildings) {
    const bType = BUILDING_MAP[pb.type]
    if (!bType) continue
    if (!isBuildingActive(pb, state.tickCount)) continue

    const hpEfficiency = pb.hp !== undefined ? pb.hp / (pb.maxHp || 100) : 1
    const tile = getTerrainAt(terrainMap, pb.x, pb.y, GRID_WIDTH)
    const terrainMult = getProductionMultiplier(bType, tile)

    for (const [res, amt] of Object.entries(bType.produces)) {
      let effectiveMult = terrainMult * hpEfficiency * wastePenalty * colonyEff
      if (roleBonuses.buildingMultipliers[pb.type]) {
        effectiveMult *= roleBonuses.buildingMultipliers[pb.type]
      }
      effectiveMult *= roleBonuses.globalMultiplier
      if (res === 'energy' && bType.id === 'SOLAR_PANEL') {
        effectiveMult *= modifiers.solarMultiplier
      }
      if (res === 'energy') {
        effectiveMult *= modifiers.energyMultiplier
      }
      state.resources[res] = (state.resources[res] || 0) + amt * effectiveMult
    }
    for (const [res, amt] of Object.entries(bType.consumes)) {
      state.resources[res] = (state.resources[res] || 0) - amt * hpEfficiency
    }
  }

  // 9. Population food/water/oxygen drain
  const pop = getPopulation(state)
  const foodConsumed = Math.floor(pop / 2)
  const waterConsumed = Math.floor(pop / 3)
  const oxygenConsumed = pop
  state.resources.food -= foodConsumed
  state.resources.water -= waterConsumed
  state.resources.oxygen -= oxygenConsumed

  // 10. Waste accumulation
  const activeBuildingCount = state.placedBuildings.filter((pb) =>
    isBuildingActive(pb, state.tickCount),
  ).length
  const activeRecyclerCount = state.placedBuildings.filter(
    (pb) =>
      pb.type === 'RECYCLING_CENTER' && isBuildingActive(pb, state.tickCount),
  ).length
  const wasteGenerated =
    activeBuildingCount * WASTE_PER_BUILDING + pop * WASTE_PER_COLONIST
  const wasteReduced = activeRecyclerCount * WASTE_REDUCTION_PER_RECYCLER
  state.waste = Math.max(0, state.waste + wasteGenerated - wasteReduced)

  // 11. Death checks
  events += `Tick ${state.tickCount} processed. `

  if (state.resources.food <= 0) {
    state.resources.food = 0
    events += 'WARNING: Food shortage — colonists are starving! '
  }

  if (state.resources.oxygen <= 0) {
    state.resources.oxygen = Math.max(0, state.resources.oxygen)
    if (state.colonists && state.colonists.length > 0) {
      events +=
        'CRITICAL: Oxygen depleted — all colonists suffocated instantly. '
      state.colonists = []
    }
  }

  if (state.resources.water <= 0) {
    state.resources.water = Math.max(0, state.resources.water)
    events += 'WARNING: No water reserves — severe dehydration risk! '
  }

  if (state.resources.energy < 0) {
    state.resources.energy = 0
    events += 'WARNING: Power shortage! '
  }

  if (state.colonists && state.colonists.length === 0) {
    state.alive = false
    if (state.resources.oxygen <= 0) {
      state.collapseReason = createCollapseReason(
        'All colonists died from oxygen loss.',
        'Prioritize Oxygen Generators and keep a buffer of water + energy to avoid chain failures.',
      )
    } else if (state.resources.water <= 0) {
      state.collapseReason = createCollapseReason(
        'All colonists died from dehydration.',
        'Secure Water Extractors early and keep backup energy so extraction never halts.',
      )
    } else {
      state.collapseReason = createCollapseReason(
        'All colonists have died.',
        'Watch warning events and keep food, water, and oxygen safely above demand.',
      )
    }
    events += `COLONY COLLAPSED: ${state.collapseReason.cause} `
  }

  // 12. Waste overflow warning
  if (state.waste > state.wasteCapacity) {
    events += 'WARNING: Waste overflow — production reduced! '
  } else if (state.waste > state.wasteCapacity * 0.8) {
    events += 'WARNING: Waste nearing capacity! '
  }

  // 13. Population growth — create new colonist
  if (state.colonists) {
    const newColonist = checkPopulationGrowth(state, modifiers)
    if (newColonist) {
      state.colonists.push(newColonist)
      state.lastColonistArrivalTick = state.tickCount
      events += `${newColonist.name} (${newColonist.role}) has arrived! `
    }
  }

  return {
    tick: state.tickCount,
    events,
    colonyState: toSnapshot(state),
    newRevealedTiles,
  }
}

/**
 * Attempt to build at (x, y). Returns { success, message, colonyState }.
 */
export function buildAt(state, type, x, y, terrainMap) {
  const bType = BUILDING_MAP[type]
  if (!bType) {
    return {
      success: false,
      message: `Unknown building type: ${type}`,
      colonyState: toSnapshot(state),
    }
  }
  if (bType.buildable === false) {
    return {
      success: false,
      message: `${bType.name} cannot be built manually`,
      colonyState: toSnapshot(state),
    }
  }
  if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
    return {
      success: false,
      message: `Invalid coordinates (${x},${y})`,
      colonyState: toSnapshot(state),
    }
  }
  const footprint = collectFootprintCells(x, y, bType.footprintSize)
  for (const cell of footprint) {
    if (
      cell.x < 0 ||
      cell.x >= GRID_WIDTH ||
      cell.y < 0 ||
      cell.y >= GRID_HEIGHT
    ) {
      return {
        success: false,
        message: `${bType.name} footprint does not fit on map`,
        colonyState: toSnapshot(state),
      }
    }
    if (state.occupiedCells.has(cellKey(cell.x, cell.y))) {
      return {
        success: false,
        message: `Cell (${cell.x},${cell.y}) is already occupied`,
        colonyState: toSnapshot(state),
      }
    }
  }

  const tile = getTerrainAt(terrainMap, x, y, GRID_WIDTH)
  const costMult = getPlacementCostMultiplier(tile)

  for (const [res, amt] of Object.entries(bType.cost)) {
    const adjustedCost = res === 'minerals' ? Math.ceil(amt * costMult) : amt
    if ((state.resources[res] || 0) < adjustedCost) {
      return {
        success: false,
        message: `Not enough resources to build ${bType.name}`,
        colonyState: toSnapshot(state),
      }
    }
  }

  for (const [res, amt] of Object.entries(bType.cost)) {
    const adjustedCost = res === 'minerals' ? Math.ceil(amt * costMult) : amt
    state.resources[res] -= adjustedCost
  }

  const placed = {
    id: state.nextBuildingId++,
    type: bType.id,
    x,
    y,
    cells: footprint,
    disabledUntilTick: 0,
    hp: bType.maxHp,
    maxHp: bType.maxHp,
  }
  state.placedBuildings.push(placed)
  for (const cell of footprint) {
    state.occupiedCells.add(cellKey(cell.x, cell.y))
  }
  state.buildings[bType.id.toLowerCase()] =
    (state.buildings[bType.id.toLowerCase()] || 0) + 1

  if (bType.id === 'HABITAT') {
    state.populationCapacity += 5
  }

  let message = `Successfully built ${bType.name} at (${x},${y})`
  const bonuses = getTerrainBonusText(bType, tile)
  if (bonuses.length > 0) {
    message += ' — ' + bonuses.join(', ')
  }

  return {
    success: true,
    message,
    colonyState: toSnapshot(state),
  }
}

/**
 * Demolish building occupying (x, y). Returns { success, message, colonyState }.
 */
export function demolishAt(state, x, y) {
  if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
    return {
      success: false,
      message: `Invalid coordinates (${x},${y})`,
      colonyState: toSnapshot(state),
    }
  }

  const target = state.placedBuildings.find((pb) =>
    getBuildingCells(pb).some((cell) => cell.x === x && cell.y === y),
  )

  if (!target) {
    return {
      success: false,
      message: `No building found at (${x},${y})`,
      colonyState: toSnapshot(state),
    }
  }

  if (target.type === 'MDV_LANDING_SITE') {
    return {
      success: false,
      message: 'MDV Landing Site cannot be demolished',
      colonyState: toSnapshot(state),
    }
  }

  const bType = BUILDING_MAP[target.type]
  for (const cell of getBuildingCells(target)) {
    state.occupiedCells.delete(cellKey(cell.x, cell.y))
  }
  state.placedBuildings = state.placedBuildings.filter(
    (pb) => pb.id !== target.id,
  )
  state.buildings[target.type.toLowerCase()] = Math.max(
    0,
    (state.buildings[target.type.toLowerCase()] || 0) - 1,
  )

  if (target.type === 'HABITAT') {
    state.populationCapacity = Math.max(10, state.populationCapacity - 5)
  }

  return {
    success: true,
    message: `${bType ? bType.name : target.type} at (${target.x},${target.y}) was demolished`,
    colonyState: toSnapshot(state),
  }
}

/**
 * Convert internal state to snapshot for reactive UI.
 */
export function toSnapshot(state) {
  const colonists = state.colonists || []
  const pop = colonists.length || state.population || 0

  return {
    name: state.name,
    resources: RESOURCE_KEYS.reduce((acc, key) => {
      acc[key] = Math.max(0, state.resources[key] || 0)
      return acc
    }, {}),
    buildings: { ...state.buildings },
    population: pop,
    populationCapacity: state.populationCapacity,
    tickCount: state.tickCount,
    alive: state.alive,
    terrainSeed: state.terrainSeed,
    waste: state.waste || 0,
    wasteCapacity: state.wasteCapacity || 50,
    collapseReason: state.collapseReason ? { ...state.collapseReason } : null,
    activeEvents: (state.activeEvents || []).map((e) => ({
      ...e,
      data: { ...e.data },
    })),
    placedBuildings: state.placedBuildings.map((pb) => ({
      id: pb.id,
      type: pb.type,
      x: pb.x,
      y: pb.y,
      disabledUntilTick: pb.disabledUntilTick || 0,
      hp: pb.hp !== undefined ? pb.hp : 100,
      maxHp: pb.maxHp || 100,
      cells: getBuildingCells(pb).map((c) => ({ x: c.x, y: c.y })),
    })),
    colonists: colonists.map((c) => ({ ...c })),
    lastColonistArrivalTick: state.lastColonistArrivalTick || 0,
    avgHealth:
      colonists.length > 0
        ? Math.round(
            colonists.reduce((s, c) => s + c.health, 0) / colonists.length,
          )
        : 100,
    avgMorale:
      colonists.length > 0
        ? Math.round(
            colonists.reduce((s, c) => s + c.morale, 0) / colonists.length,
          )
        : 100,
  }
}

/**
 * Return building metadata.
 */
export function getBuildingsInfo() {
  return BUILDING_TYPES.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    cost: { ...b.cost },
    produces: { ...b.produces },
    consumes: { ...b.consumes },
    maxHp: b.maxHp,
    special: b.special || null,
    footprintSize: b.footprintSize || 1,
    buildable: b.buildable !== false,
  }))
}
