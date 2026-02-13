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
import { hexDistance, hexNeighbors, hexesInRadius } from '~/utils/hex'

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
const DEGRADATION_PER_TICK = 0.25
// Waste generated per active building per tick
const WASTE_PER_BUILDING = 0.3
// Waste generated per colonist per tick
const WASTE_PER_COLONIST = 0.2
// Waste reduced per active recycling center per tick
const WASTE_REDUCTION_PER_RECYCLER = 3
// Production penalty when waste overflows
export const WASTE_OVERFLOW_PENALTY = 0.75
const MDV_FOOTPRINT_SIZE = 7
const MAX_BUILD_RADIUS_FROM_COLONY = 5
const MAX_UPGRADE_LEVEL = 3
const PIPELINE_RESOURCES = ['energy', 'water', 'oxygen']

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
    footprintSize: MDV_FOOTPRINT_SIZE,
    special: 'Starting structure',
  },
  {
    id: 'PIPELINE',
    name: 'Pipeline',
    maxHp: 80,
    description:
      'Resource conduit that carries adjacent water, oxygen, and energy',
    cost: { minerals: 2 },
    produces: {},
    consumes: {},
    buildTime: 1,
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
    produces: { food: 5 },
    consumes: { water: 1, energy: 1 },
    buildTime: 2,
  },
  {
    id: 'WATER_EXTRACTOR',
    name: 'Water Extractor',
    maxHp: 100,
    description: 'Extracts water from the Martian ice',
    cost: { minerals: 12 },
    produces: { water: 6 },
    consumes: { energy: 2 },
    buildTime: 2,
  },
  {
    id: 'MINE',
    name: 'Mining Facility',
    maxHp: 100,
    description: 'Extracts minerals from the ground',
    cost: { minerals: 8 },
    produces: { minerals: 4 },
    consumes: { energy: 3 },
    footprintSize: 2,
    buildTime: 3,
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
    buildTime: 3,
  },
  {
    id: 'OXYGEN_GENERATOR',
    name: 'Oxygen Generator',
    maxHp: 100,
    description: 'Electrolyzes water to produce breathable oxygen',
    cost: { minerals: 15, energy: 10 },
    produces: { oxygen: 6 },
    consumes: { energy: 2, water: 1 },
    buildTime: 2,
  },
  {
    id: 'RTG',
    name: 'RTG Power Unit',
    maxHp: 100,
    description:
      'Radioisotope generator — steady power, unaffected by dust storms',
    cost: { minerals: 20 },
    produces: { energy: 5 },
    consumes: {},
    buildTime: 2,
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
    buildTime: 3,
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
    buildTime: 3,
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

function hasOccupiedCell(state, x, y) {
  const key = cellKey(x, y)
  if (state?.occupiedCells && typeof state.occupiedCells.has === 'function') {
    return state.occupiedCells.has(key)
  }
  return (state?.placedBuildings || []).some((pb) =>
    getBuildingCells(pb).some((c) => c.x === x && c.y === y),
  )
}

function createCollapseReason(cause, hint) {
  return { cause, hint }
}

function isUnderConstruction(pb) {
  return !!pb.isUnderConstruction
}

function buildingLevel(pb) {
  return Math.max(1, pb.level || 1)
}

function productionMultiplierFromLevel(pb) {
  return 1 + (buildingLevel(pb) - 1) * 0.5
}

function consumptionMultiplierFromLevel(pb) {
  return 1 + (buildingLevel(pb) - 1) * 0.2
}

function isWithinBuildRadius(state, footprint) {
  const colonyCells = []
  for (const pb of state.placedBuildings || []) {
    if (pb.type !== 'PIPELINE' && pb.type !== 'MDV_LANDING_SITE') continue
    colonyCells.push(...getBuildingCells(pb))
  }
  if (colonyCells.length === 0) return true
  return footprint.some((f) =>
    colonyCells.some(
      (c) => hexDistance(c.x, c.y, f.x, f.y) <= MAX_BUILD_RADIUS_FROM_COLONY,
    ),
  )
}

function isPipeline(pb) {
  return pb?.type === 'PIPELINE'
}

function computePipelineNetworks(state) {
  const pipelines = (state.placedBuildings || []).filter(isPipeline)
  const byKey = new Map()
  for (const pb of pipelines) {
    byKey.set(cellKey(pb.x, pb.y), pb)
  }

  const visited = new Set()
  const networks = []
  const resourceTypes = new Set(PIPELINE_RESOURCES)

  for (const pb of pipelines) {
    const key = cellKey(pb.x, pb.y)
    if (visited.has(key)) continue

    const queue = [pb]
    const cells = []
    const cellSet = new Set()
    const resources = new Set()

    while (queue.length > 0) {
      const cur = queue.shift()
      const curKey = cellKey(cur.x, cur.y)
      if (visited.has(curKey)) continue
      visited.add(curKey)
      cells.push({ x: cur.x, y: cur.y })
      cellSet.add(curKey)

      for (const [nx, ny] of hexNeighbors(cur.x, cur.y)) {
        const nKey = cellKey(nx, ny)
        const np = byKey.get(nKey)
        if (np && !visited.has(nKey)) queue.push(np)
      }
    }

    for (const b of state.placedBuildings || []) {
      if (isPipeline(b)) continue
      if (!isBuildingActive(b, state.tickCount)) continue
      if (isUnderConstruction(b)) continue
      const bType = BUILDING_MAP[b.type]
      if (!bType) continue
      const adjacentToNetwork = buildingTouchesPipelineNetwork(b, cellSet)
      if (!adjacentToNetwork) continue
      for (const res of Object.keys(bType.produces || {})) {
        if (resourceTypes.has(res)) resources.add(res)
      }
    }

    networks.push({ cells, cellSet, resources })
  }

  return networks
}

function isAdjacentToInfrastructure(state, x, y) {
  return (state.placedBuildings || []).some((pb) => {
    if (pb.type !== 'PIPELINE' && pb.type !== 'MDV_LANDING_SITE') return false
    return getBuildingCells(pb).some(
      (cell) => hexDistance(cell.x, cell.y, x, y) <= 1,
    )
  })
}

function isAdjacentToExistingStructure(state, x, y) {
  return (state.placedBuildings || []).some((pb) =>
    getBuildingCells(pb).some((cell) => hexDistance(cell.x, cell.y, x, y) <= 1),
  )
}

function buildingTouchesPipelineNetwork(pb, cellSet) {
  return getBuildingCells(pb).some((cell) =>
    hexNeighbors(cell.x, cell.y).some(([nx, ny]) => cellSet.has(cellKey(nx, ny))),
  )
}

function canBuildingAccessPipelineResources(state, pb, bType, networks) {
  const needed = Object.keys(bType.consumes || {}).filter((res) =>
    PIPELINE_RESOURCES.includes(res),
  )
  if (needed.length === 0) return true
  const adjacentNetworks = networks.filter((n) =>
    buildingTouchesPipelineNetwork(pb, n.cellSet),
  )
  if (adjacentNetworks.length === 0) return false
  return needed.every((res) =>
    adjacentNetworks.some((net) => net.resources.has(res)),
  )
}

function syncColonistUnits(state) {
  if (!Array.isArray(state.colonistUnits)) state.colonistUnits = []
  const aliveIds = new Set((state.colonists || []).map((c) => c.id))
  state.colonistUnits = state.colonistUnits.filter((u) =>
    aliveIds.has(u.colonistId),
  )
  const landing = (state.placedBuildings || []).find(
    (b) => b.type === 'MDV_LANDING_SITE',
  )
  const lx = landing?.x ?? Math.floor(GRID_WIDTH / 2)
  const ly = landing?.y ?? Math.floor(GRID_HEIGHT / 2)
  for (const c of state.colonists || []) {
    if (!state.colonistUnits.some((u) => u.colonistId === c.id)) {
      state.colonistUnits.push({ colonistId: c.id, x: lx, y: ly })
    }
  }
}

export function getBuildableCells(state) {
  const cells = new Set()
  for (const pb of state?.placedBuildings || []) {
    if (pb.type !== 'PIPELINE' && pb.type !== 'MDV_LANDING_SITE') continue
    for (const origin of getBuildingCells(pb)) {
      const nearby = hexesInRadius(
        origin.x,
        origin.y,
        MAX_BUILD_RADIUS_FROM_COLONY,
        GRID_WIDTH,
        GRID_HEIGHT,
      )
      for (const [x, y] of nearby) {
        cells.add(cellKey(x, y))
      }
    }
  }
  return cells
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

function canPlaceFootprint(state, footprint) {
  for (const cell of footprint) {
    if (
      cell.x < 0 ||
      cell.x >= GRID_WIDTH ||
      cell.y < 0 ||
      cell.y >= GRID_HEIGHT
    ) {
      return false
    }
    if (state.occupiedCells.has(cellKey(cell.x, cell.y))) return false
  }
  return true
}

function findOpenCellNear(state, ox, oy, minDist, maxDist, footprintSize = 1) {
  for (let dist = Math.max(0, minDist); dist <= maxDist; dist++) {
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (hexDistance(ox, oy, x, y) !== dist) continue
        const footprint = collectFootprintCells(x, y, footprintSize)
        if (canPlaceFootprint(state, footprint)) {
          return { x, y, footprint }
        }
      }
    }
  }
  return null
}

function placeInstantBuilding(state, type, x, y, footprint = null) {
  const bType = BUILDING_MAP[type]
  if (!bType) return null
  const cells = footprint || collectFootprintCells(x, y, bType.footprintSize)
  if (!canPlaceFootprint(state, cells)) return null

  const placed = {
    id: state.nextBuildingId++,
    type: bType.id,
    x,
    y,
    cells,
    disabledUntilTick: 0,
    hp: bType.maxHp,
    maxHp: bType.maxHp,
    level: 1,
    isUnderConstruction: false,
    constructionDoneTick: state.tickCount,
  }
  state.placedBuildings.push(placed)
  for (const cell of cells) {
    state.occupiedCells.add(cellKey(cell.x, cell.y))
  }
  state.buildings[bType.id.toLowerCase()] =
    (state.buildings[bType.id.toLowerCase()] || 0) + 1
  if (bType.id === 'HABITAT') {
    state.populationCapacity += 5
  }
  return placed
}

function createDeveloperBalancedStarter(state) {
  const landing = state.placedBuildings.find((b) => b.type === 'MDV_LANDING_SITE')
  const lx = landing?.x ?? Math.floor(GRID_WIDTH / 2)
  const ly = landing?.y ?? Math.floor(GRID_HEIGHT / 2)

  const hubSpot = findOpenCellNear(state, lx, ly, 2, 8, 1)
  if (!hubSpot) return
  const hub = placeInstantBuilding(state, 'PIPELINE', hubSpot.x, hubSpot.y)
  if (!hub) return

  const pipelineNodes = [{ x: hub.x, y: hub.y }]
  for (const [nx, ny] of hexNeighbors(hub.x, hub.y)) {
    const fp = [{ x: nx, y: ny }]
    if (!canPlaceFootprint(state, fp)) continue
    const branch = placeInstantBuilding(state, 'PIPELINE', nx, ny, fp)
    if (branch) pipelineNodes.push({ x: branch.x, y: branch.y })
    if (pipelineNodes.length >= 7) break
  }

  function findSiteNextToPipeline(type) {
    const footprintSize = BUILDING_MAP[type]?.footprintSize || 1
    for (const p of pipelineNodes) {
      for (const [nx, ny] of hexNeighbors(p.x, p.y)) {
        const footprint = collectFootprintCells(nx, ny, footprintSize)
        if (!canPlaceFootprint(state, footprint)) continue
        return { x: nx, y: ny, footprint }
      }
    }
    return findOpenCellNear(state, lx, ly, 2, 10, footprintSize)
  }

  const starterBuildings = [
    'SOLAR_PANEL',
    'SOLAR_PANEL',
    'SOLAR_PANEL',
    'WATER_EXTRACTOR',
    'OXYGEN_GENERATOR',
    'HYDROPONIC_FARM',
    'MINE',
  ]

  for (const type of starterBuildings) {
    const site = findSiteNextToPipeline(type)
    if (!site) continue
    placeInstantBuilding(state, type, site.x, site.y, site.footprint)
  }
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
    colonistUnits: [],
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
  state.colonistUnits = state.colonists.map((c, idx) => ({
    colonistId: c.id,
    x: landing.x + (idx % 2),
    y: landing.y + (idx > 0 ? 1 : 0),
  }))
  const mdvCells = collectFootprintCells(
    landing.x,
    landing.y,
    MDV_FOOTPRINT_SIZE,
  )
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
  if (options.preset === 'developer-balanced') {
    createDeveloperBalancedStarter(state)
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
  const pipelineNetworks = computePipelineNetworks(state)

  for (const pb of state.placedBuildings) {
    const bType = BUILDING_MAP[pb.type]
    if (!bType) continue
    if (!isBuildingActive(pb, state.tickCount)) continue
    if (isUnderConstruction(pb)) continue
    if (!canBuildingAccessPipelineResources(state, pb, bType, pipelineNetworks))
      continue

    activeBuildingCount++

    const hpEfficiency = pb.hp !== undefined ? pb.hp / (pb.maxHp || 100) : 1
    const levelProdMult = productionMultiplierFromLevel(pb)
    const levelConsMult = consumptionMultiplierFromLevel(pb)

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
      deltas[res] = (deltas[res] || 0) + amt * effectiveMult * levelProdMult
    }
    for (const [res, amt] of Object.entries(bType.consumes)) {
      deltas[res] = (deltas[res] || 0) - amt * hpEfficiency * levelConsMult
    }

    if (bType.id === 'RECYCLING_CENTER') activeRecyclerCount++
  }

  // Population drain
  const pop = getPopulation(state)
  deltas.food -= pop > 0 ? Math.max(1, Math.floor(pop / 2)) : 0
  deltas.water -= pop > 0 ? Math.max(1, Math.floor(pop / 3)) : 0
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
  syncColonistUnits(state)
  let events = ''
  let newRevealedTiles = []

  // 1. Cleanup expired events
  const resolvedMsgs = cleanupExpiredEvents(state)
  for (const msg of resolvedMsgs) {
    events += msg + ' '
  }

  // 1b. Apply pending meteor from previous tick's early warning
  if (state.pendingMeteor) {
    const meteorEvent = state.pendingMeteor
    state.pendingMeteor = null
    state.activeEvents.push(meteorEvent)
    const eventMsg = applyEventStart(state, meteorEvent, revealedTiles)
    if (eventMsg) events += eventMsg + ' '
    if (state.colonists && state.colonists.length > 0) {
      const colonistMsgs = applyEventToColonists(state, meteorEvent.type)
      for (const msg of colonistMsgs) events += msg + ' '
      if (meteorEvent.data.buildingDestroyed) {
        applyBuildingLostPenalty(state)
      }
    }
  }

  // 2. Roll for random events + apply colonist effects
  const newEvent = rollRandomEvent(state, revealedTiles)
  if (newEvent) {
    // Meteor strikes get a 1-tick early warning
    if (newEvent.type === 'METEOR_STRIKE') {
      state.pendingMeteor = newEvent
      events += 'WARNING: Incoming meteor detected! Impact next tick. '
    } else {
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
  }

  // 3. Building degradation
  for (const pb of state.placedBuildings) {
    if (pb.hp !== undefined) {
      pb.hp = Math.max(0, pb.hp - DEGRADATION_PER_TICK)
    }
  }

  for (const pb of state.placedBuildings) {
    if (
      isUnderConstruction(pb) &&
      state.tickCount >= (pb.constructionDoneTick || 0)
    ) {
      pb.isUnderConstruction = false
      const bName = BUILDING_MAP[pb.type]?.name || pb.type
      events += `${bName} construction completed. `
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
      (pb) =>
        pb.type === 'MDV_LANDING_SITE' || pb.hp === undefined || pb.hp > 0,
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
    } else if (state.resources.food <= 0) {
      state.collapseReason = createCollapseReason(
        'All colonists starved to death.',
        'Build Hydroponic Farms early and ensure steady water + energy supply for them.',
      )
    } else {
      state.collapseReason = createCollapseReason(
        'All colonists have died.',
        'Stabilize food, water, and oxygen before expanding your colony footprint.',
      )
    }
    events += `COLONY COLLAPSED: ${state.collapseReason.cause} `
    return {
      tick: state.tickCount,
      events,
      colonyState: toSnapshot(state),
      newRevealedTiles,
    }
  }

  clampResourcesNonNegative(state.resources)

  // 7-10. Production, consumption, population drain, waste (shared with UI deltas)
  const modifiers = getActiveModifiers(state)
  const deltas = computeResourceDeltas(state, terrainMap)
  for (const key of RESOURCE_KEYS) {
    state.resources[key] = (state.resources[key] || 0) + (deltas[key] || 0)
  }
  state.waste = Math.max(0, state.waste + (deltas.waste || 0))

  // 11. Death checks
  events += `Tick ${state.tickCount} processed. `

  if (state.resources.food <= 0) {
    state.resources.food = 0
    events += 'WARNING: Food shortage — colonists are starving! '
  }

  if (state.resources.oxygen <= 0) {
    state.resources.oxygen = 0
    events += 'CRITICAL: Oxygen depleted — colonists are suffocating! '
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

  const revealedSet = new Set(revealedTiles || [])
  const discovered = new Set(newRevealedTiles)
  for (const unit of state.colonistUnits || []) {
    const neighbors = hexNeighbors(unit.x, unit.y).filter(
      ([nx, ny]) => nx >= 0 && nx < GRID_WIDTH && ny >= 0 && ny < GRID_HEIGHT,
    )
    const walkable = neighbors.filter(([nx, ny]) =>
      revealedSet.has(`${nx},${ny}`),
    )
    if (walkable.length > 0) {
      const idx = (state.tickCount + unit.colonistId) % walkable.length
      const [nx, ny] = walkable[idx]
      unit.x = nx
      unit.y = ny
    }
    for (const [nx, ny] of hexNeighbors(unit.x, unit.y)) {
      if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue
      const key = `${nx},${ny}`
      if (!revealedSet.has(key)) {
        revealedSet.add(key)
        discovered.add(key)
      }
    }
  }
  if (discovered.size > 0) {
    newRevealedTiles = Array.from(discovered)
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
  const validation = validateBuildPlacement(state, type, x, y, terrainMap)
  if (!validation.ok) {
    return {
      success: false,
      message: validation.message,
      colonyState: toSnapshot(state),
    }
  }
  const { bType, tile, costMult, footprint } = validation

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
    level: 1,
    isUnderConstruction: true,
    constructionDoneTick: state.tickCount + (bType.buildTime || 2),
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

  let message = `Construction started for ${bType.name} at (${x},${y})`
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

export function validateBuildPlacement(
  state,
  type,
  x,
  y,
  terrainMap,
  options = {},
) {
  const checkResources = options.checkResources !== false
  const bType = BUILDING_MAP[type]
  if (!bType) return { ok: false, message: `Unknown building type: ${type}` }
  if (bType.buildable === false) {
    return { ok: false, message: `${bType.name} cannot be built manually` }
  }
  if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) {
    return { ok: false, message: `Invalid coordinates (${x},${y})` }
  }

  const footprint = collectFootprintCells(x, y, bType.footprintSize)
  if (bType.id === 'PIPELINE') {
    const canAttach = isAdjacentToExistingStructure(state, x, y)
    if (!canAttach) {
      return {
        ok: false,
        message: 'Pipeline must connect to an existing structure',
      }
    }
  } else if (!isWithinBuildRadius(state, footprint)) {
    return {
      ok: false,
      message: `Must build within ${MAX_BUILD_RADIUS_FROM_COLONY} hexes of colony`,
    }
  }

  if (bType.id !== 'PIPELINE' && !isAdjacentToInfrastructure(state, x, y)) {
    return {
      ok: false,
      message: 'Buildings must be placed adjacent to a pipeline',
    }
  }

  for (const cell of footprint) {
    if (
      cell.x < 0 ||
      cell.x >= GRID_WIDTH ||
      cell.y < 0 ||
      cell.y >= GRID_HEIGHT
    ) {
      return { ok: false, message: `${bType.name} footprint does not fit on map` }
    }
    if (hasOccupiedCell(state, cell.x, cell.y)) {
      return { ok: false, message: `Cell (${cell.x},${cell.y}) is already occupied` }
    }
  }

  const tile = getTerrainAt(terrainMap, x, y, GRID_WIDTH)
  const costMult = getPlacementCostMultiplier(tile)

  if (checkResources) {
    for (const [res, amt] of Object.entries(bType.cost)) {
      const adjustedCost = res === 'minerals' ? Math.ceil(amt * costMult) : amt
      if ((state.resources[res] || 0) < adjustedCost) {
        return { ok: false, message: `Not enough resources to build ${bType.name}` }
      }
    }
  }

  return { ok: true, message: '', bType, footprint, tile, costMult }
}

export function upgradeBuildingAt(state, x, y) {
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
      message: 'MDV Landing Site cannot be upgraded',
      colonyState: toSnapshot(state),
    }
  }

  const nextLevel = (target.level || 1) + 1
  if (nextLevel > MAX_UPGRADE_LEVEL) {
    return {
      success: false,
      message: 'Building already at max level',
      colonyState: toSnapshot(state),
    }
  }

  const upgradeCost = { minerals: 12 * nextLevel, energy: 5 * nextLevel }
  for (const [res, amt] of Object.entries(upgradeCost)) {
    if ((state.resources[res] || 0) < amt) {
      return {
        success: false,
        message: 'Not enough resources for upgrade',
        colonyState: toSnapshot(state),
      }
    }
  }
  for (const [res, amt] of Object.entries(upgradeCost)) {
    state.resources[res] -= amt
  }

  target.level = nextLevel

  return {
    success: true,
    message: `${BUILDING_MAP[target.type]?.name || target.type} upgraded to level ${nextLevel}`,
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
      level: pb.level || 1,
      isUnderConstruction: !!pb.isUnderConstruction,
      constructionDoneTick: pb.constructionDoneTick || 0,
      cells: getBuildingCells(pb).map((c) => ({ x: c.x, y: c.y })),
    })),
    colonists: colonists.map((c) => ({ ...c })),
    colonistUnits: (state.colonistUnits || []).map((u) => ({ ...u })),
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
    buildTime: b.buildTime || 2,
    buildable: b.buildable !== false,
  }))
}
