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
import { processMissionTick } from '~/utils/missionEngine'
import {
  rollAlienEvent,
  resolveAlienEvent,
  computeDefenseRating,
} from '~/utils/defenseEngine'
import {
  hexDistance,
  hexNeighbors,
  hexesInRadius,
  hexPathfind,
} from '~/utils/hex'

export const GRID_WIDTH = 64
export const GRID_HEIGHT = 64

export const START_RESOURCES = {
  energy: 100,
  food: 50,
  water: 50,
  minerals: 30,
  oxygen: 80,
  research: 0,
}

const MDV_FOOTPRINT_SIZE = 7
const MAX_BUILD_RADIUS_FROM_COLONY = 5
export const MAX_UPGRADE_LEVEL = 5
const EFFICIENCY_RADIUS = 8
const PIPELINE_RESOURCES = ['energy', 'water', 'oxygen']

export const BUILDING_TYPES = [
  {
    id: 'MDV_LANDING_SITE',
    name: 'MDV Landing Site',
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
    produces: { food: 5 },
    consumes: { water: 1, energy: 1 },
    buildTime: 2,
  },
  {
    id: 'WATER_EXTRACTOR',
    name: 'Water Extractor',
    description: 'Extracts water from the Martian ice',
    cost: { minerals: 12 },
    produces: { water: 6 },
    consumes: { energy: 2 },
    buildTime: 2,
  },
  {
    id: 'MINE',
    name: 'Mining Facility',
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
    description: 'Electrolyzes water to produce breathable oxygen',
    cost: { minerals: 15, energy: 10 },
    produces: { oxygen: 6 },
    consumes: { energy: 2, water: 1 },
    buildTime: 2,
  },
  {
    id: 'RTG',
    name: 'RTG Power Unit',
    description:
      'Radioisotope generator — steady power, unaffected by dust storms',
    cost: { minerals: 20 },
    produces: { energy: 5 },
    consumes: {},
    buildTime: 2,
  },
  {
    id: 'RESEARCH_LAB',
    name: 'Research Lab',
    description: 'Generates research points for advanced upgrades',
    cost: { minerals: 30, energy: 20 },
    produces: { research: 3 },
    consumes: { energy: 4, water: 1 },
    buildTime: 3,
  },
  {
    id: 'DEFENSE_TURRET',
    name: 'Defense Turret',
    description: 'Automated turret that defends against alien threats',
    cost: { minerals: 30, energy: 15, research: 5 },
    produces: {},
    consumes: { energy: 3 },
    special: '+10 defense per level',
    buildTime: 2,
  },
  {
    id: 'RADAR_STATION',
    name: 'Radar Station',
    description: 'Detects incoming alien threats with early warning',
    cost: { minerals: 20, energy: 10, research: 3 },
    produces: {},
    consumes: { energy: 2 },
    special: '+5 defense, 2-tick early warning',
    buildTime: 2,
  },
]

const BUILDING_MAP = Object.fromEntries(BUILDING_TYPES.map((b) => [b.id, b]))
const RESOURCE_KEYS = Object.keys(START_RESOURCES)

// --- Branching Upgrade Trees ---
// Branch levels: 2 and 4. Non-branch levels give +25% production.
export const UPGRADE_TREES = {
  SOLAR_PANEL: {
    2: [
      {
        id: 'high_efficiency',
        name: 'High Efficiency',
        desc: '+80% production',
        prodMult: 1.8,
        consMult: 1.0,
      },
      {
        id: 'array_expansion',
        name: 'Array Expansion',
        desc: '+40% prod, +15% to adjacent solar',
        prodMult: 1.4,
        consMult: 1.0,
        adjacentBonus: { type: 'SOLAR_PANEL', mult: 0.15 },
      },
    ],
    4: [
      {
        id: 'storm_hardening',
        name: 'Storm Hardening',
        desc: 'Immune to dust storms',
        prodMult: 1.0,
        consMult: 1.0,
        dustImmune: true,
      },
      {
        id: 'overcharge',
        name: 'Overcharge',
        desc: '+150% production',
        prodMult: 2.5,
        consMult: 1.0,
      },
    ],
  },
  MINE: {
    2: [
      {
        id: 'deep_bore',
        name: 'Deep Bore',
        desc: '2x mineral production',
        prodMult: 2.0,
        consMult: 1.0,
      },
      {
        id: 'survey',
        name: 'Survey Module',
        desc: '+30% prod, reveals nearby deposits',
        prodMult: 1.3,
        consMult: 1.0,
        revealDeposits: true,
      },
    ],
    4: [
      {
        id: 'automation',
        name: 'Automation',
        desc: 'Halve energy consumption',
        prodMult: 1.0,
        consMult: 0.5,
      },
      {
        id: 'refinery',
        name: 'Refinery',
        desc: '+2 research/tick',
        prodMult: 1.0,
        consMult: 1.0,
        bonusProduction: { research: 2 },
      },
    ],
  },
  HYDROPONIC_FARM: {
    2: [
      {
        id: 'bio_optimize',
        name: 'Bio-Optimize',
        desc: '+80% food production',
        prodMult: 1.8,
        consMult: 1.0,
      },
      {
        id: 'aquaponics',
        name: 'Aquaponics',
        desc: '+40% food, -50% water use',
        prodMult: 1.4,
        consMult: 0.5,
      },
    ],
    4: [
      {
        id: 'vertical_stacking',
        name: 'Vertical Stacking',
        desc: '+120% food prod',
        prodMult: 2.2,
        consMult: 1.0,
      },
      {
        id: 'nutrient_recycler',
        name: 'Nutrient Recycler',
        desc: '+60% food, -30% water use',
        prodMult: 1.6,
        consMult: 0.7,
      },
    ],
  },
  WATER_EXTRACTOR: {
    2: [
      {
        id: 'deep_well',
        name: 'Deep Well',
        desc: '+80% water output',
        prodMult: 1.8,
        consMult: 1.0,
      },
      {
        id: 'purification',
        name: 'Purification',
        desc: '+40% water, +1 oxygen/tick',
        prodMult: 1.4,
        consMult: 1.0,
        bonusProduction: { oxygen: 1 },
      },
    ],
    4: [
      {
        id: 'geothermal_pump',
        name: 'Geothermal Pump',
        desc: 'No energy cost',
        prodMult: 1.0,
        consMult: 0.0,
      },
      {
        id: 'ice_harvester',
        name: 'Ice Harvester',
        desc: '+150% on ice tiles',
        prodMult: 1.0,
        consMult: 1.0,
        terrainBonus: { ICE_FIELD: 2.5 },
      },
    ],
  },
  OXYGEN_GENERATOR: {
    2: [
      {
        id: 'electrolysis_boost',
        name: 'Electrolysis Boost',
        desc: '+80% oxygen output',
        prodMult: 1.8,
        consMult: 1.0,
      },
      {
        id: 'catalytic',
        name: 'Catalytic Process',
        desc: '+50% oxygen, -30% water use',
        prodMult: 1.5,
        consMult: 0.7,
      },
    ],
    4: [
      {
        id: 'atmospheric_processor',
        name: 'Atmospheric Processor',
        desc: '+2 oxygen/colonist capacity',
        prodMult: 1.0,
        consMult: 1.0,
        perCapitaOxygen: 2,
      },
      {
        id: 'cryo_separator',
        name: 'Cryo Separator',
        desc: '+200% oxygen prod',
        prodMult: 3.0,
        consMult: 1.0,
      },
    ],
  },
  RTG: {
    2: [
      {
        id: 'enhanced_core',
        name: 'Enhanced Core',
        desc: '+80% energy output',
        prodMult: 1.8,
        consMult: 1.0,
      },
      {
        id: 'heat_recovery',
        name: 'Heat Recovery',
        desc: '+40% energy, heats adjacent habitat',
        prodMult: 1.4,
        consMult: 1.0,
        habitatBonus: true,
      },
    ],
    4: [
      {
        id: 'fusion_prototype',
        name: 'Fusion Prototype',
        desc: '+200% energy',
        prodMult: 3.0,
        consMult: 1.0,
      },
      {
        id: 'distributed_grid',
        name: 'Distributed Grid',
        desc: '+100% energy, +5% to all adjacent buildings',
        prodMult: 2.0,
        consMult: 1.0,
        adjacentBonus: { type: null, mult: 0.05 },
      },
    ],
  },
  RESEARCH_LAB: {
    2: [
      {
        id: 'ai_assist',
        name: 'AI Assist',
        desc: '+80% research output',
        prodMult: 1.8,
        consMult: 1.0,
      },
      {
        id: 'field_analysis',
        name: 'Field Analysis',
        desc: '+40% research, reveals anomalies',
        prodMult: 1.4,
        consMult: 1.0,
        revealAnomalies: true,
      },
    ],
    4: [
      {
        id: 'quantum_computing',
        name: 'Quantum Computing',
        desc: '+200% research',
        prodMult: 3.0,
        consMult: 1.2,
      },
      {
        id: 'collaborative_net',
        name: 'Collaborative Network',
        desc: '+5% prod to all buildings',
        prodMult: 1.0,
        consMult: 1.0,
        globalProdBonus: 0.05,
      },
    ],
  },
}

/**
 * Get upgrade options for a building at a branch level.
 * Returns null if not a branch level, or array of branch choices.
 */
export function getUpgradeOptions(state, x, y) {
  const target = state.placedBuildings.find((pb) =>
    getBuildingCells(pb).some((cell) => cell.x === x && cell.y === y),
  )
  if (!target) return null
  const nextLevel = (target.level || 1) + 1
  if (nextLevel > MAX_UPGRADE_LEVEL) return null
  const tree = UPGRADE_TREES[target.type]
  if (!tree || !tree[nextLevel]) return null
  return { building: target, level: nextLevel, branches: tree[nextLevel] }
}

/**
 * Compute production/consumption multipliers from upgrade tree choices.
 */
function getUpgradeMultipliers(pb) {
  let prodMult = 1.0
  let consMult = 1.0
  const choices = pb.upgradeChoices || {}
  const tree = UPGRADE_TREES[pb.type]

  for (let lvl = 2; lvl <= (pb.level || 1); lvl++) {
    if (tree && tree[lvl]) {
      // Branch level — apply chosen branch
      const chosen = choices[lvl]
      if (chosen) {
        const branch = tree[lvl].find((b) => b.id === chosen)
        if (branch) {
          prodMult *= branch.prodMult
          consMult *= branch.consMult
        }
      }
      // If no choice recorded, treat as standard boost
      else {
        prodMult *= 1.25
      }
    } else {
      // Non-branch level: standard +25% production
      prodMult *= 1.25
    }
  }

  return { prodMult, consMult }
}

/**
 * Check if a building has dust storm immunity from upgrades.
 */
function hasUpgradeEffect(pb, effectKey) {
  const choices = pb.upgradeChoices || {}
  const tree = UPGRADE_TREES[pb.type]
  if (!tree) return false
  for (const [lvl, branchId] of Object.entries(choices)) {
    const branches = tree[lvl]
    if (!branches) continue
    const branch = branches.find((b) => b.id === branchId)
    if (branch && branch[effectKey]) return true
  }
  return false
}

/**
 * Get bonus production from upgrade effects (e.g., refinery adding research).
 */
function getUpgradeBonusProduction(pb) {
  const bonuses = {}
  const choices = pb.upgradeChoices || {}
  const tree = UPGRADE_TREES[pb.type]
  if (!tree) return bonuses
  for (const [lvl, branchId] of Object.entries(choices)) {
    const branches = tree[lvl]
    if (!branches) continue
    const branch = branches.find((b) => b.id === branchId)
    if (branch && branch.bonusProduction) {
      for (const [res, amt] of Object.entries(branch.bonusProduction)) {
        bonuses[res] = (bonuses[res] || 0) + amt
      }
    }
  }
  return bonuses
}

/**
 * Compute distance efficiency for a building based on proximity to MDV or pipelines.
 * Buildings beyond EFFICIENCY_RADIUS suffer linear production falloff (floor 50%).
 */
function computeDistanceEfficiency(state, pb) {
  let minDist = Infinity
  for (const other of state.placedBuildings) {
    if (other.type !== 'MDV_LANDING_SITE') continue
    for (const cell of getBuildingCells(other)) {
      const dist = hexDistance(cell.x, cell.y, pb.x, pb.y)
      if (dist < minDist) minDist = dist
    }
  }
  if (minDist <= EFFICIENCY_RADIUS) return 1.0
  // Linear falloff beyond radius, floor at 0.5
  const excess = minDist - EFFICIENCY_RADIUS
  return Math.max(0.5, 1.0 - excess * 0.05)
}

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

function productionMultiplierFromLevel(pb) {
  const { prodMult } = getUpgradeMultipliers(pb)
  return prodMult
}

function consumptionMultiplierFromLevel(pb) {
  const { consMult } = getUpgradeMultipliers(pb)
  return consMult
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
    hexNeighbors(cell.x, cell.y).some(([nx, ny]) =>
      cellSet.has(cellKey(nx, ny)),
    ),
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
      state.colonistUnits.push({
        colonistId: c.id,
        x: lx,
        y: ly,
        targetX: null,
        targetY: null,
        path: [],
      })
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
  const landing = state.placedBuildings.find(
    (b) => b.type === 'MDV_LANDING_SITE',
  )
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
    missions: [],
    nextMissionId: 1,
    completedMissions: [],
    defenseRating: 0,
    alienThreatLevel: 0,
    alienEvents: [],
  }
  state.colonists = createInitialColonists(state)
  const landing = findLandingSite(options.terrainMap)
  state.colonistUnits = state.colonists.map((c, idx) => ({
    colonistId: c.id,
    x: landing.x + (idx % 2),
    y: landing.y + (idx > 0 ? 1 : 0),
    targetX: null,
    targetY: null,
    path: [],
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
 * Compute resource deltas per tick, accounting for terrain, events, and colonist roles.
 * Shared by processTick (for actual mutation) and useColony (for UI preview).
 */
export function computeResourceDeltas(state, terrainMap) {
  const deltas = {
    energy: 0,
    food: 0,
    water: 0,
    minerals: 0,
    oxygen: 0,
    research: 0,
  }
  const modifiers = getActiveModifiers(state)

  // Colonist role bonuses and colony efficiency
  const roleBonuses = computeRoleBonuses(state)
  const colonyEff = computeColonyEfficiency(state.colonists)

  let activeBuildingCount = 0
  const pipelineNetworks = computePipelineNetworks(state)

  for (const pb of state.placedBuildings) {
    const bType = BUILDING_MAP[pb.type]
    if (!bType) continue
    if (!isBuildingActive(pb, state.tickCount)) continue
    if (isUnderConstruction(pb)) continue
    if (!canBuildingAccessPipelineResources(state, pb, bType, pipelineNetworks))
      continue

    activeBuildingCount++

    const levelProdMult = productionMultiplierFromLevel(pb)
    const levelConsMult = consumptionMultiplierFromLevel(pb)
    const distEff = computeDistanceEfficiency(state, pb)

    const tile = getTerrainAt(terrainMap, pb.x, pb.y, GRID_WIDTH)
    const terrainMult = getProductionMultiplier(bType, tile)

    // Check dust storm immunity from upgrades
    const dustImmune = hasUpgradeEffect(pb, 'dustImmune')

    for (const [res, amt] of Object.entries(bType.produces)) {
      let effectiveMult = terrainMult * colonyEff * distEff
      // Role bonus for this building type
      if (roleBonuses.buildingMultipliers[pb.type]) {
        effectiveMult *= roleBonuses.buildingMultipliers[pb.type]
      }
      effectiveMult *= roleBonuses.globalMultiplier
      // Event modifiers
      if (res === 'energy' && bType.id === 'SOLAR_PANEL' && !dustImmune) {
        effectiveMult *= modifiers.solarMultiplier
      }
      if (res === 'energy') {
        effectiveMult *= modifiers.energyMultiplier
      }
      deltas[res] = (deltas[res] || 0) + amt * effectiveMult * levelProdMult
    }

    // Bonus production from upgrade effects (e.g., refinery → research)
    const bonusProd = getUpgradeBonusProduction(pb)
    for (const [res, amt] of Object.entries(bonusProd)) {
      deltas[res] = (deltas[res] || 0) + amt * distEff
    }

    for (const [res, amt] of Object.entries(bType.consumes)) {
      deltas[res] = (deltas[res] || 0) - amt * levelConsMult
    }
  }

  // Population drain
  const pop = getPopulation(state)
  deltas.food -= pop > 0 ? Math.max(1, Math.floor(pop / 2)) : 0
  deltas.water -= pop > 0 ? Math.max(1, Math.floor(pop / 3)) : 0
  deltas.oxygen -= pop

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

  // 3. Check construction completion
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

  // 4. Process colonist health, morale, deaths
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

  // 12b. Process missions
  if (state.missions && state.missions.length > 0) {
    const missionResult = processMissionTick(state, terrainMap, revealedTiles)
    for (const msg of missionResult.messages) events += msg + ' '
    if (
      missionResult.newRevealedTiles &&
      missionResult.newRevealedTiles.length > 0
    ) {
      newRevealedTiles = [
        ...newRevealedTiles,
        ...missionResult.newRevealedTiles,
      ]
    }
  }

  // 12c. Defense / Alien events
  state.defenseRating = computeDefenseRating(state)
  const alienEvent = rollAlienEvent(state)
  if (alienEvent) {
    state.alienEvents = state.alienEvents || []
    state.alienEvents.push(alienEvent)
    const alienResult = resolveAlienEvent(state, alienEvent)
    for (const msg of alienResult.messages) events += msg + ' '
  }
  // Clean up expired alien events
  if (state.alienEvents) {
    state.alienEvents = state.alienEvents.filter(
      (e) => e.endTick >= state.tickCount,
    )
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
    // Movement: targeted or random walk
    if (unit.targetX != null && unit.targetY != null) {
      if (unit.x === unit.targetX && unit.y === unit.targetY) {
        // Arrived at target — clear and do random walk this tick
        unit.targetX = null
        unit.targetY = null
        unit.path = []
      } else if (unit.path && unit.path.length > 0) {
        const next = unit.path.shift()
        unit.x = next.x
        unit.y = next.y
      } else {
        // No path remaining but not at target — recompute or clear
        const newPath = hexPathfind(
          unit.x,
          unit.y,
          unit.targetX,
          unit.targetY,
          null,
          GRID_WIDTH,
          GRID_HEIGHT,
        )
        if (newPath.length > 0) {
          unit.path = newPath
          const next = unit.path.shift()
          unit.x = next.x
          unit.y = next.y
        } else {
          unit.targetX = null
          unit.targetY = null
          unit.path = []
        }
      }
    } else {
      // Random walk (existing behavior)
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
    }
    // Reveal adjacent tiles
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

  const buildTime = bType.buildTime || 2
  const placed = {
    id: state.nextBuildingId++,
    type: bType.id,
    x,
    y,
    cells: footprint,
    disabledUntilTick: 0,
    level: 1,
    isUnderConstruction: true,
    constructionDoneTick: state.tickCount + buildTime,
    buildTime,
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
      return {
        ok: false,
        message: `${bType.name} footprint does not fit on map`,
      }
    }
    if (hasOccupiedCell(state, cell.x, cell.y)) {
      return {
        ok: false,
        message: `Cell (${cell.x},${cell.y}) is already occupied`,
      }
    }
  }

  const tile = getTerrainAt(terrainMap, x, y, GRID_WIDTH)
  const costMult = getPlacementCostMultiplier(tile)

  if (checkResources) {
    for (const [res, amt] of Object.entries(bType.cost)) {
      const adjustedCost = res === 'minerals' ? Math.ceil(amt * costMult) : amt
      if ((state.resources[res] || 0) < adjustedCost) {
        return {
          ok: false,
          message: `Not enough resources to build ${bType.name}`,
        }
      }
    }
  }

  return { ok: true, message: '', bType, footprint, tile, costMult }
}

export function upgradeBuildingAt(state, x, y, branchChoice) {
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

  // Check if this is a branch level requiring a choice
  const tree = UPGRADE_TREES[target.type]
  if (tree && tree[nextLevel]) {
    if (!branchChoice) {
      return {
        success: false,
        message: 'Branch choice required',
        requiresBranch: true,
        branches: tree[nextLevel],
        colonyState: toSnapshot(state),
      }
    }
    const validBranch = tree[nextLevel].find((b) => b.id === branchChoice)
    if (!validBranch) {
      return {
        success: false,
        message: 'Invalid branch choice',
        colonyState: toSnapshot(state),
      }
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
  if (!target.upgradeChoices) target.upgradeChoices = {}
  if (branchChoice) {
    target.upgradeChoices[nextLevel] = branchChoice
  }

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
 * Set a colonist's move target. Computes A* path and stores it on the unit.
 * Returns { success, message }.
 */
export function setColonistTarget(state, colonistId, targetX, targetY) {
  const unit = (state.colonistUnits || []).find(
    (u) => u.colonistId === colonistId,
  )
  if (!unit) return { success: false, message: 'Colonist not found' }
  if (
    targetX < 0 ||
    targetX >= GRID_WIDTH ||
    targetY < 0 ||
    targetY >= GRID_HEIGHT
  ) {
    return { success: false, message: 'Target out of bounds' }
  }
  // Pathfind over the full grid — colonists can walk into unexplored fog
  const path = hexPathfind(
    unit.x,
    unit.y,
    targetX,
    targetY,
    null,
    GRID_WIDTH,
    GRID_HEIGHT,
  )
  if (path.length === 0 && (unit.x !== targetX || unit.y !== targetY)) {
    return { success: false, message: 'No path found' }
  }
  unit.targetX = targetX
  unit.targetY = targetY
  unit.path = path
  return { success: true }
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
      level: pb.level || 1,
      isUnderConstruction: !!pb.isUnderConstruction,
      constructionDoneTick: pb.constructionDoneTick || 0,
      buildTime: pb.buildTime || 2,
      cells: getBuildingCells(pb).map((c) => ({ x: c.x, y: c.y })),
      upgradeChoices: pb.upgradeChoices ? { ...pb.upgradeChoices } : {},
    })),
    missions: (state.missions || []).map((m) => ({ ...m })),
    completedMissions: state.completedMissions || [],
    defenseRating: state.defenseRating || 0,
    alienThreatLevel: state.alienThreatLevel || 0,
    alienEvents: (state.alienEvents || []).map((e) => ({ ...e })),
    colonists: colonists.map((c) => ({ ...c })),
    colonistUnits: (state.colonistUnits || []).map((u) => ({
      colonistId: u.colonistId,
      x: u.x,
      y: u.y,
      targetX: u.targetX ?? null,
      targetY: u.targetY ?? null,
    })),
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
    footprintSize: b.footprintSize || 1,
    buildTime: b.buildTime || 2,
    buildable: b.buildable !== false,
  }))
}
