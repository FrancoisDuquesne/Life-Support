// localStorage save/load for colony state + revealed tiles
import { FIRST_NAMES, LAST_NAMES, ROLES } from '~/utils/colonistEngine'
import { mulberry32 } from '~/utils/hex'
import { getFootprintCellsForType } from '~/utils/gameEngine'

const SAVE_KEY = 'life-support-save'
const SAVE_VERSION = 6

function normalizePlacedBuilding(pb) {
  const fallbackCells = getFootprintCellsForType(pb.type, pb.x, pb.y)
  const forceFootprint = pb.type === 'MDV_LANDING_SITE'
  const cells =
    !forceFootprint && Array.isArray(pb.cells) && pb.cells.length > 0
      ? pb.cells
      : fallbackCells
  return {
    id: pb.id,
    type: pb.type,
    x: pb.x,
    y: pb.y,
    cells: cells.map((c) => ({ x: c.x, y: c.y })),
    disabledUntilTick: pb.disabledUntilTick || 0,
    level: pb.level || 1,
    isUnderConstruction: !!pb.isUnderConstruction,
    constructionDoneTick: pb.constructionDoneTick || 0,
    upgradeChoices: pb.upgradeChoices || {},
  }
}

/**
 * Persist colony state and revealed tiles to localStorage.
 */
export function saveGame(state, revealedTiles) {
  const data = {
    v: SAVE_VERSION,
    state: {
      name: state.name,
      resources: state.resources,
      buildings: state.buildings,
      placedBuildings: state.placedBuildings.map(normalizePlacedBuilding),
      nextBuildingId: state.nextBuildingId,
      colonists: (state.colonists || []).map((c) => ({ ...c })),
      nextColonistId: state.nextColonistId || 1,
      populationCapacity: state.populationCapacity,
      tickCount: state.tickCount,
      alive: state.alive,
      terrainSeed: state.terrainSeed,
      activeEvents: state.activeEvents || [],
      nextEventId: state.nextEventId || 1,
      waste: state.waste || 0,
      wasteCapacity: state.wasteCapacity || 50,
      lastColonistArrivalTick: state.lastColonistArrivalTick || 0,
      colonistUnits: (state.colonistUnits || []).map((u) => ({
        colonistId: u.colonistId,
        x: u.x,
        y: u.y,
        targetX: u.targetX ?? null,
        targetY: u.targetY ?? null,
      })),
      missions: state.missions || [],
      nextMissionId: state.nextMissionId || 1,
      completedMissions: state.completedMissions || [],
      defenseRating: state.defenseRating || 0,
      alienThreatLevel: state.alienThreatLevel || 0,
      alienEvents: state.alienEvents || [],
    },
    revealedTiles: Array.from(revealedTiles),
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
    return true
  } catch (_) {
    return false
  }
}

/**
 * Migrate v1 saves to v2 (add terrain + events).
 */
function migrateV1toV2(data) {
  const s = data.state
  s.terrainSeed = (s.tickCount * 7919 + 42) | 0
  s.activeEvents = []
  s.nextEventId = 1
  if (s.placedBuildings) {
    for (const pb of s.placedBuildings) {
      if (pb.disabledUntilTick === undefined) pb.disabledUntilTick = 0
    }
  }
  data.v = 2
  return data
}

/**
 * Migrate v2 saves to v3 (add oxygen, HP, waste).
 */
function migrateV2toV3(data) {
  const s = data.state
  // Add oxygen resource
  if (s.resources && s.resources.oxygen === undefined) {
    s.resources.oxygen = 80
  }
  // Add waste fields
  if (s.waste === undefined) s.waste = 0
  if (s.wasteCapacity === undefined) s.wasteCapacity = 50
  // Add HP to placed buildings
  if (s.placedBuildings) {
    for (const pb of s.placedBuildings) {
      if (pb.hp === undefined) pb.hp = 100
      if (pb.maxHp === undefined) pb.maxHp = 100
    }
  }
  // Add building counts for new building types
  if (s.buildings) {
    if (s.buildings.oxygen_generator === undefined)
      s.buildings.oxygen_generator = 0
    if (s.buildings.rtg === undefined) s.buildings.rtg = 0
    if (s.buildings.recycling_center === undefined)
      s.buildings.recycling_center = 0
    if (s.buildings.repair_station === undefined) s.buildings.repair_station = 0
  }
  data.v = 3
  return data
}

/**
 * Migrate v3 saves to v4 (add individual colonists).
 */
function migrateV3toV4(data) {
  const s = data.state
  const pop = s.population || 5
  const seed = s.terrainSeed || 42
  const ROLE_LIST = Object.keys(ROLES)

  const colonists = []
  let nextId = 1

  // Generate colonists from old population count
  const guaranteed = ['ENGINEER', 'BOTANIST', 'GEOLOGIST']
  for (let i = 0; i < pop; i++) {
    const rng = mulberry32(seed * 97 + nextId * 131)
    const firstIdx = Math.floor(rng() * FIRST_NAMES.length)
    const lastIdx = Math.floor(rng() * LAST_NAMES.length)
    const role =
      i < guaranteed.length
        ? guaranteed[i]
        : ROLE_LIST[Math.floor(rng() * ROLE_LIST.length)]

    colonists.push({
      id: nextId++,
      name: FIRST_NAMES[firstIdx] + ' ' + LAST_NAMES[lastIdx],
      role,
      health: 100,
      morale: 80,
      arrivalTick: i < 3 ? 0 : Math.floor(i * 5),
    })
  }

  s.colonists = colonists
  s.nextColonistId = nextId
  delete s.population

  data.v = 4
  return data
}

/**
 * Migrate v4 saves to v5 (add research, upgrade choices, missions, defense).
 */
function migrateV4toV5(data) {
  const s = data.state
  // Add research resource
  if (s.resources && s.resources.research === undefined) {
    s.resources.research = 0
  }
  // Add upgrade choices to placed buildings
  if (s.placedBuildings) {
    for (const pb of s.placedBuildings) {
      if (!pb.upgradeChoices) pb.upgradeChoices = {}
    }
  }
  // Add mission fields
  if (!s.missions) s.missions = []
  if (!s.nextMissionId) s.nextMissionId = 1
  if (!s.completedMissions) s.completedMissions = []
  // Add defense fields
  if (s.defenseRating === undefined) s.defenseRating = 0
  if (s.alienThreatLevel === undefined) s.alienThreatLevel = 0
  if (!s.alienEvents) s.alienEvents = []
  // Add onMission to colonists
  if (s.colonists) {
    for (const c of s.colonists) {
      if (c.onMission === undefined) c.onMission = null
    }
  }
  // Add building counts for new building types
  if (s.buildings) {
    if (s.buildings.research_lab === undefined) s.buildings.research_lab = 0
    if (s.buildings.defense_turret === undefined) s.buildings.defense_turret = 0
    if (s.buildings.radar_station === undefined) s.buildings.radar_station = 0
  }
  data.v = 5
  return data
}

/**
 * Migrate v5 saves to v6 (remove HP system and REPAIR_STATION).
 */
function migrateV5toV6(data) {
  const s = data.state
  // Strip hp/maxHp from placed buildings and remove REPAIR_STATION buildings
  if (s.placedBuildings) {
    s.placedBuildings = s.placedBuildings.filter(
      (pb) => pb.type !== 'REPAIR_STATION',
    )
    for (const pb of s.placedBuildings) {
      delete pb.hp
      delete pb.maxHp
    }
  }
  // Reset repair_station building count
  if (s.buildings) {
    delete s.buildings.repair_station
  }
  data.v = 6
  return data
}

/**
 * Load saved game from localStorage.
 * Returns { state, revealedTiles } or null if no save / incompatible version.
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    let data = JSON.parse(raw)

    // Progressive migration
    if (data.v === 1) data = migrateV1toV2(data)
    if (data.v === 2) data = migrateV2toV3(data)
    if (data.v === 3) data = migrateV3toV4(data)
    if (data.v === 4) data = migrateV4toV5(data)
    if (data.v === 5) data = migrateV5toV6(data)

    if (data.v !== SAVE_VERSION) return null

    const s = data.state
    const placedBuildings = (s.placedBuildings || []).map(
      normalizePlacedBuilding,
    )

    // Rebuild occupiedCells Set from placedBuildings
    const occupiedCells = new Set()
    for (const pb of placedBuildings) {
      for (const cell of pb.cells) {
        occupiedCells.add(cell.x + ',' + cell.y)
      }
    }

    const state = {
      name: s.name,
      resources: s.resources,
      buildings: s.buildings,
      placedBuildings,
      occupiedCells,
      nextBuildingId: s.nextBuildingId,
      colonists: s.colonists || [],
      nextColonistId: s.nextColonistId || 1,
      populationCapacity: s.populationCapacity,
      tickCount: s.tickCount,
      alive: s.alive,
      terrainSeed: s.terrainSeed,
      activeEvents: s.activeEvents || [],
      nextEventId: s.nextEventId || 1,
      waste: s.waste || 0,
      wasteCapacity: s.wasteCapacity || 50,
      lastColonistArrivalTick: s.lastColonistArrivalTick || 0,
      colonistUnits: (s.colonistUnits || []).map((u) => ({
        colonistId: u.colonistId,
        x: u.x,
        y: u.y,
        targetX: u.targetX ?? null,
        targetY: u.targetY ?? null,
        path: [],
      })),
      missions: s.missions || [],
      nextMissionId: s.nextMissionId || 1,
      completedMissions: s.completedMissions || [],
      defenseRating: s.defenseRating || 0,
      alienThreatLevel: s.alienThreatLevel || 0,
      alienEvents: s.alienEvents || [],
    }

    const revealedTiles = new Set(data.revealedTiles)
    return { state, revealedTiles }
  } catch (_) {
    return null
  }
}

/**
 * Delete saved game.
 */
export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch (_) {
    // ignore
  }
}
