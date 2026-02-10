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
const WASTE_OVERFLOW_PENALTY = 0.75

export const BUILDING_TYPES = [
  {
    id: 'SOLAR_PANEL',
    name: 'Solar Panel',
    description: 'Generates energy from sunlight',
    cost: { minerals: 10 },
    produces: { energy: 5 },
    consumes: {},
  },
  {
    id: 'HYDROPONIC_FARM',
    name: 'Hydroponic Farm',
    description: 'Grows food using water and energy',
    cost: { minerals: 15, energy: 5 },
    produces: { food: 3 },
    consumes: { water: 1, energy: 1 },
  },
  {
    id: 'WATER_EXTRACTOR',
    name: 'Water Extractor',
    description: 'Extracts water from the Martian ice',
    cost: { minerals: 12 },
    produces: { water: 4 },
    consumes: { energy: 2 },
  },
  {
    id: 'MINE',
    name: 'Mining Facility',
    description: 'Extracts minerals from the ground',
    cost: { minerals: 8 },
    produces: { minerals: 2 },
    consumes: { energy: 3 },
  },
  {
    id: 'HABITAT',
    name: 'Living Habitat',
    description: 'Houses colonists, increases population capacity by 5',
    cost: { minerals: 25, water: 10 },
    produces: {},
    consumes: { energy: 2 },
  },
  {
    id: 'OXYGEN_GENERATOR',
    name: 'Oxygen Generator',
    description: 'Electrolyzes water to produce breathable oxygen',
    cost: { minerals: 15, energy: 10 },
    produces: { oxygen: 4 },
    consumes: { energy: 2, water: 1 },
  },
  {
    id: 'RTG',
    name: 'RTG Power Unit',
    description:
      'Radioisotope generator — steady power, unaffected by dust storms',
    cost: { minerals: 20 },
    produces: { energy: 3 },
    consumes: {},
  },
  {
    id: 'RECYCLING_CENTER',
    name: 'Recycling Center',
    description: 'Processes colony waste, reducing buildup by 3/tick',
    cost: { minerals: 20, energy: 10 },
    produces: {},
    consumes: { energy: 2 },
    special: 'Reduces waste by 3/tick',
  },
  {
    id: 'REPAIR_STATION',
    name: 'Repair Station',
    description: 'Automated drones that maintain colony infrastructure',
    cost: { minerals: 25, energy: 15 },
    produces: {},
    consumes: { energy: 3, minerals: 1 },
    special: 'Repairs all buildings (5 HP/tick shared)',
  },
]

const BUILDING_MAP = Object.fromEntries(BUILDING_TYPES.map((b) => [b.id, b]))

function cellKey(x, y) {
  return x + ',' + y
}

function isBuildingActive(pb, tickCount) {
  if (pb.disabledUntilTick && pb.disabledUntilTick > tickCount) return false
  if (pb.hp !== undefined && pb.hp <= 0) return false
  return true
}

/** Get population count (works with both colonist array and legacy integer) */
function getPopulation(state) {
  if (state.colonists) return state.colonists.length
  return state.population || 0
}

/**
 * Create a fresh colony state object.
 */
export function createColonyState() {
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
    terrainSeed: Math.floor(Math.random() * 2147483647),
    activeEvents: [],
    nextEventId: 1,
    waste: 0,
    wasteCapacity: 50,
  }
  state.colonists = createInitialColonists(state)
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
    (pb) => pb.hp !== undefined && pb.hp <= 0,
  )
  for (const dead of deadBuildings) {
    state.occupiedCells.delete(cellKey(dead.x, dead.y))
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

  if (state.resources.oxygen <= 0) {
    state.alive = false
    state.resources.oxygen = Math.max(0, state.resources.oxygen)
    events += 'COLONY COLLAPSED: Suffocation! '
  } else if (state.resources.food <= 0) {
    state.alive = false
    state.resources.food = Math.max(0, state.resources.food)
    events += 'COLONY COLLAPSED: Starvation! '
  } else if (state.resources.water <= 0) {
    state.alive = false
    state.resources.water = Math.max(0, state.resources.water)
    events += 'COLONY COLLAPSED: Dehydration! '
  } else if (state.resources.energy < 0) {
    state.resources.energy = 0
    events += 'WARNING: Power shortage! '
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
  if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
    return {
      success: false,
      message: `Invalid coordinates (${x},${y})`,
      colonyState: toSnapshot(state),
    }
  }
  if (state.occupiedCells.has(cellKey(x, y))) {
    return {
      success: false,
      message: `Cell (${x},${y}) is already occupied`,
      colonyState: toSnapshot(state),
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
    disabledUntilTick: 0,
    hp: 100,
    maxHp: 100,
  }
  state.placedBuildings.push(placed)
  state.occupiedCells.add(cellKey(x, y))
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
 * Convert internal state to snapshot for reactive UI.
 */
export function toSnapshot(state) {
  const colonists = state.colonists || []
  const pop = colonists.length || state.population || 0

  return {
    name: state.name,
    resources: { ...state.resources },
    buildings: { ...state.buildings },
    population: pop,
    populationCapacity: state.populationCapacity,
    tickCount: state.tickCount,
    alive: state.alive,
    terrainSeed: state.terrainSeed,
    waste: state.waste || 0,
    wasteCapacity: state.wasteCapacity || 50,
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
    special: b.special || null,
  }))
}
