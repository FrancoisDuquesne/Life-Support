// Pure JS game engine — port of Colony.java + ColonyService.java
// No server needed: all game logic runs in the browser.

export const GRID_WIDTH = 64
export const GRID_HEIGHT = 64

export const START_RESOURCES = {
  energy: 100,
  food: 50,
  water: 50,
  minerals: 30
}

export const BUILDING_TYPES = [
  {
    id: 'SOLAR_PANEL',
    name: 'Solar Panel',
    description: 'Generates energy from sunlight',
    cost: { minerals: 10 },
    produces: { energy: 5 },
    consumes: {}
  },
  {
    id: 'HYDROPONIC_FARM',
    name: 'Hydroponic Farm',
    description: 'Grows food using water and energy',
    cost: { minerals: 15, energy: 5 },
    produces: { food: 3 },
    consumes: { water: 1, energy: 1 }
  },
  {
    id: 'WATER_EXTRACTOR',
    name: 'Water Extractor',
    description: 'Extracts water from the Martian ice',
    cost: { minerals: 12 },
    produces: { water: 4 },
    consumes: { energy: 2 }
  },
  {
    id: 'MINE',
    name: 'Mining Facility',
    description: 'Extracts minerals from the ground',
    cost: { minerals: 8 },
    produces: { minerals: 2 },
    consumes: { energy: 3 }
  },
  {
    id: 'HABITAT',
    name: 'Living Habitat',
    description: 'Houses colonists, increases population capacity by 5',
    cost: { minerals: 25, water: 10 },
    produces: {},
    consumes: { energy: 2 }
  }
]

const BUILDING_MAP = Object.fromEntries(BUILDING_TYPES.map(b => [b.id, b]))

function cellKey(x, y) {
  return x + ',' + y
}

/**
 * Create a fresh colony state object.
 */
export function createColonyState() {
  return {
    name: 'Life Support',
    resources: { ...START_RESOURCES },
    buildings: Object.fromEntries(BUILDING_TYPES.map(b => [b.id.toLowerCase(), 0])),
    placedBuildings: [],
    occupiedCells: new Set(),
    nextBuildingId: 1,
    population: 5,
    populationCapacity: 10,
    tickCount: 0,
    alive: true
  }
}

/**
 * Process one game tick — production, consumption, population dynamics.
 * Mutates state in place. Returns { tick, events, colonyState }.
 */
export function processTick(state) {
  if (!state.alive) {
    return {
      tick: state.tickCount,
      events: 'Colony has collapsed!',
      colonyState: toSnapshot(state)
    }
  }

  state.tickCount++

  // Building production & consumption
  for (const bType of BUILDING_TYPES) {
    const count = state.buildings[bType.id.toLowerCase()] || 0
    if (count > 0) {
      for (const [res, amt] of Object.entries(bType.produces)) {
        state.resources[res] = (state.resources[res] || 0) + amt * count
      }
      for (const [res, amt] of Object.entries(bType.consumes)) {
        state.resources[res] = (state.resources[res] || 0) - amt * count
      }
    }
  }

  // Population food/water drain
  const foodConsumed = Math.floor(state.population / 2)
  const waterConsumed = Math.floor(state.population / 3)
  state.resources.food -= foodConsumed
  state.resources.water -= waterConsumed

  // Death checks
  let events = `Tick ${state.tickCount} processed. `

  if (state.resources.food <= 0) {
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

  // Population growth
  if (
    state.alive &&
    state.resources.food > 20 &&
    state.resources.water > 20 &&
    state.population < state.populationCapacity
  ) {
    state.population++
    events += 'Population grew! '
  }

  return {
    tick: state.tickCount,
    events,
    colonyState: toSnapshot(state)
  }
}

/**
 * Attempt to build at (x, y). Returns { success, message, colonyState }.
 */
export function buildAt(state, type, x, y) {
  const bType = BUILDING_MAP[type]
  if (!bType) {
    return { success: false, message: `Unknown building type: ${type}`, colonyState: toSnapshot(state) }
  }
  if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
    return { success: false, message: `Invalid coordinates (${x},${y})`, colonyState: toSnapshot(state) }
  }
  if (state.occupiedCells.has(cellKey(x, y))) {
    return { success: false, message: `Cell (${x},${y}) is already occupied`, colonyState: toSnapshot(state) }
  }

  // Check resources
  for (const [res, amt] of Object.entries(bType.cost)) {
    if ((state.resources[res] || 0) < amt) {
      return { success: false, message: `Not enough resources to build ${bType.name}`, colonyState: toSnapshot(state) }
    }
  }

  // Deduct cost
  for (const [res, amt] of Object.entries(bType.cost)) {
    state.resources[res] -= amt
  }

  // Place building
  const placed = { id: state.nextBuildingId++, type: bType.id, x, y }
  state.placedBuildings.push(placed)
  state.occupiedCells.add(cellKey(x, y))
  state.buildings[bType.id.toLowerCase()] = (state.buildings[bType.id.toLowerCase()] || 0) + 1

  // Population capacity for habitats
  if (bType.id === 'HABITAT') {
    state.populationCapacity += 5
  }

  return {
    success: true,
    message: `Successfully built ${bType.name} at (${x},${y})`,
    colonyState: toSnapshot(state)
  }
}

/**
 * Convert internal state to the same JSON shape the REST API returned.
 */
export function toSnapshot(state) {
  return {
    name: state.name,
    resources: { ...state.resources },
    buildings: { ...state.buildings },
    population: state.population,
    populationCapacity: state.populationCapacity,
    tickCount: state.tickCount,
    alive: state.alive,
    placedBuildings: state.placedBuildings.map(pb => ({
      id: pb.id,
      type: pb.type,
      x: pb.x,
      y: pb.y
    }))
  }
}

/**
 * Return building metadata in the same shape as GET /colony/config .buildings
 */
export function getBuildingsInfo() {
  return BUILDING_TYPES.map(b => ({
    id: b.id,
    name: b.name,
    description: b.description,
    cost: { ...b.cost },
    produces: { ...b.produces },
    consumes: { ...b.consumes }
  }))
}
