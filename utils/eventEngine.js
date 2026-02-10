// Random event system — generation, effects, and modifiers
import { mulberry32 } from '~/utils/hex'

// --- Event Type Definitions ---

export const EVENT_TYPES = {
  DUST_STORM: {
    id: 'DUST_STORM',
    name: 'Dust Storm',
    severity: 'warning',
    duration: 5,
    probability: 0.015,
    minTick: 5,
    description: 'Reduces solar panel output by 50%',
  },
  METEOR_STRIKE: {
    id: 'METEOR_STRIKE',
    name: 'Meteor Strike',
    severity: 'danger',
    duration: 0, // instant
    probability: 0.008,
    minTick: 10,
    description: 'Impacts a random tile, may destroy a building',
  },
  SOLAR_FLARE: {
    id: 'SOLAR_FLARE',
    name: 'Solar Flare',
    severity: 'warning',
    duration: 3,
    probability: 0.01,
    minTick: 8,
    description: 'Boosts energy +30% but blocks population growth',
  },
  EQUIPMENT_FAILURE: {
    id: 'EQUIPMENT_FAILURE',
    name: 'Equipment Failure',
    severity: 'warning',
    duration: 0, // instant — disables building for 3 ticks
    probability: 0.015,
    minTick: 5,
    minBuildings: 3,
    description: 'Disables a random building for 3 ticks',
  },
  RESOURCE_DISCOVERY: {
    id: 'RESOURCE_DISCOVERY',
    name: 'Resource Discovery',
    severity: 'normal',
    duration: 0, // instant
    probability: 0.02,
    minTick: 3,
    description: 'Reveals frontier tiles and may create a resource deposit',
  },
}

/**
 * Roll for a random event this tick. Returns an event object or null.
 * Uses a seeded PRNG for determinism.
 */
export function rollRandomEvent(state, revealedTiles) {
  const rng = mulberry32(state.terrainSeed * 31 + state.tickCount)

  // Don't stack too many active events
  const activeCount = state.activeEvents.filter(
    (e) => e.endTick > state.tickCount,
  ).length
  if (activeCount >= 2) return null

  // Check each event type
  for (const evtType of Object.values(EVENT_TYPES)) {
    if (state.tickCount < evtType.minTick) continue
    if (
      evtType.minBuildings &&
      state.placedBuildings.length < evtType.minBuildings
    )
      continue

    // Don't duplicate active events of same type
    if (
      state.activeEvents.some(
        (e) => e.type === evtType.id && e.endTick > state.tickCount,
      )
    )
      continue

    if (rng() < evtType.probability) {
      const event = {
        id: state.nextEventId++,
        type: evtType.id,
        startTick: state.tickCount,
        endTick:
          evtType.duration > 0
            ? state.tickCount + evtType.duration
            : state.tickCount,
        data: {},
      }
      return event
    }
  }

  return null
}

/**
 * Apply the immediate effects of an event starting. Returns a log message string.
 * Mutates state as needed (e.g., destroying buildings for meteor strike).
 */
export function applyEventStart(state, event, revealedTiles) {
  switch (event.type) {
    case 'DUST_STORM':
      return '[STORM] Dust storm incoming! Solar output reduced by 50% for 5 ticks.'

    case 'METEOR_STRIKE':
      return applyMeteorStrike(state, event, revealedTiles)

    case 'SOLAR_FLARE':
      return '[FLARE] Solar flare detected! Energy +30%, but population growth blocked for 3 ticks.'

    case 'EQUIPMENT_FAILURE':
      return applyEquipmentFailure(state, event)

    case 'RESOURCE_DISCOVERY':
      return applyResourceDiscovery(state, event, revealedTiles)

    default:
      return `Unknown event: ${event.type}`
  }
}

function applyMeteorStrike(state, event, revealedTiles) {
  // Pick a random revealed tile
  const revealedArr = Array.from(revealedTiles)
  if (revealedArr.length === 0)
    return '[METEOR] Meteor struck outside the colony perimeter.'

  const rng = mulberry32(state.terrainSeed * 17 + state.tickCount * 3)
  const targetKey = revealedArr[Math.floor(rng() * revealedArr.length)]
  const [tx, ty] = targetKey.split(',').map(Number)
  event.data.x = tx
  event.data.y = ty

  // Check if a building is at this tile
  const buildingIdx = state.placedBuildings.findIndex(
    (b) => b.x === tx && b.y === ty,
  )
  if (buildingIdx >= 0) {
    const building = state.placedBuildings[buildingIdx]
    const buildingKey = building.type.toLowerCase()

    // Remove building
    state.placedBuildings.splice(buildingIdx, 1)
    state.occupiedCells.delete(tx + ',' + ty)
    state.buildings[buildingKey] = Math.max(
      0,
      (state.buildings[buildingKey] || 0) - 1,
    )

    // Habitat capacity
    if (building.type === 'HABITAT') {
      state.populationCapacity = Math.max(10, state.populationCapacity - 5)
    }

    event.data.buildingDestroyed = true
    const name = building.type.replace(/_/g, ' ').toLowerCase()
    return `[METEOR] Meteor strike at (${tx},${ty})! ${name} destroyed!`
  }

  return `[METEOR] Meteor strike at (${tx},${ty})! No buildings damaged.`
}

function applyEquipmentFailure(state, event) {
  if (state.placedBuildings.length === 0) return null

  const rng = mulberry32(state.terrainSeed * 13 + state.tickCount * 7)
  const idx = Math.floor(rng() * state.placedBuildings.length)
  const building = state.placedBuildings[idx]

  building.disabledUntilTick = state.tickCount + 3
  event.data.buildingId = building.id
  event.data.x = building.x
  event.data.y = building.y

  const name = building.type.replace(/_/g, ' ').toLowerCase()
  return `[FAILURE] Equipment failure! ${name} at (${building.x},${building.y}) disabled for 3 ticks.`
}

function applyResourceDiscovery(state, event, revealedTiles) {
  // Find frontier tiles (unrevealed but adjacent to revealed)
  const frontier = []
  const checked = new Set()

  for (const key of revealedTiles) {
    const [cx, cy] = key.split(',').map(Number)
    const neighbors = [
      [cx + 1, cy - 1],
      [cx + 1, cy],
      [cx, cy + 1],
      [cx - 1, cy],
      [cx - 1, cy - 1],
      [cx, cy - 1],
    ]
    // Adjust for odd-q offset
    const parity = cx & 1
    const offsets =
      parity === 0
        ? [
            [cx + 1, cy - 1],
            [cx + 1, cy],
            [cx, cy + 1],
            [cx - 1, cy],
            [cx - 1, cy - 1],
            [cx, cy - 1],
          ]
        : [
            [cx + 1, cy],
            [cx + 1, cy + 1],
            [cx, cy + 1],
            [cx - 1, cy + 1],
            [cx - 1, cy],
            [cx, cy - 1],
          ]

    for (const [nx, ny] of offsets) {
      if (nx < 0 || nx >= 64 || ny < 0 || ny >= 64) continue
      const nk = nx + ',' + ny
      if (revealedTiles.has(nk) || checked.has(nk)) continue
      checked.add(nk)
      frontier.push(nk)
    }
  }

  if (frontier.length === 0)
    return '[DISCOVERY] Scouts found nothing new on the frontier.'

  const rng = mulberry32(state.terrainSeed * 23 + state.tickCount * 11)
  const count = Math.min(frontier.length, 5 + Math.floor(rng() * 4)) // 5-8 tiles
  const shuffled = frontier.sort(() => rng() - 0.5)
  const revealed = shuffled.slice(0, count)

  event.data.revealedTiles = revealed

  return `[DISCOVERY] Scouts discovered ${revealed.length} new tiles on the frontier!`
}

/**
 * Get active event modifiers that affect production/growth this tick.
 */
export function getActiveModifiers(state) {
  const mods = {
    solarMultiplier: 1.0,
    energyMultiplier: 1.0,
    blockPopulationGrowth: false,
  }

  for (const event of state.activeEvents) {
    if (event.endTick < state.tickCount) continue

    switch (event.type) {
      case 'DUST_STORM':
        mods.solarMultiplier *= 0.5
        break
      case 'SOLAR_FLARE':
        mods.energyMultiplier *= 1.3
        mods.blockPopulationGrowth = true
        break
    }
  }

  return mods
}

/**
 * Clean up expired events. Returns log messages for resolved events.
 */
export function cleanupExpiredEvents(state) {
  const messages = []
  const stillActive = []

  for (const event of state.activeEvents) {
    if (event.endTick < state.tickCount && event.endTick > 0) {
      const evtType = EVENT_TYPES[event.type]
      if (evtType && evtType.duration > 0) {
        messages.push(`${evtType.name} has passed.`)
      }
    } else {
      stillActive.push(event)
    }
  }

  state.activeEvents = stillActive
  return messages
}
