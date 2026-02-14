// Individual colonist system — names, roles, health, morale, efficiency
import { mulberry32 } from '~/utils/hex'

// --- Name Pools ---

export const FIRST_NAMES = [
  'Yuri',
  'Mei',
  'Amir',
  'Suki',
  'Kofi',
  'Elena',
  'Raj',
  'Astrid',
  'Nova',
  'Kai',
  'Luna',
  'Orion',
  'Zara',
  'Idris',
  'Mika',
  'Sol',
  'Petra',
  'Dmitri',
  'Ines',
  'Tao',
  'Freya',
  'Akira',
  'Nia',
  'Hugo',
  'Cleo',
  'Atlas',
  'Lyra',
  'Soren',
  'Ada',
  'Ravi',
  'Quinn',
  'Elio',
  'Juno',
  'Hana',
  'Omar',
  'Kira',
  'Leo',
  'Iris',
  'Malik',
  'Vera',
  'Niko',
  'Stella',
  'Dante',
  'Maya',
  'Felix',
  'Thea',
  'Ronan',
  'Zoe',
  'Jasper',
  'Lena',
  'Ezra',
  'Sasha',
  'Bodhi',
  'Noor',
  'Axel',
  'Ivy',
  'Cyrus',
  'Maren',
  'Silas',
  'Esme',
  'Milo',
  'Lila',
  'Arlo',
  'Sage',
  'Remy',
  'Dara',
  'Jett',
  'Opal',
  'Rune',
  'Vega',
  'Cruz',
  'Wren',
  'Ash',
  'Echo',
  'Phoenix',
  'Terra',
  'Cosmo',
  'Io',
  'Rigel',
  'Ceres',
  'Halley',
  'Altair',
  'Phoebe',
  'Cassius',
  'Selene',
  'Titan',
  'Rhea',
  'Oberon',
  'Callisto',
  'Ariel',
  'Triton',
  'Elara',
  'Kepler',
  'Tycho',
  'Herschel',
  'Sagan',
  'Valentina',
  'Yakov',
  'Chiyo',
  'Emeka',
  'Priya',
  'Henrik',
]

export const LAST_NAMES = [
  'Tanaka',
  'Okafor',
  'Petrov',
  'Chen',
  'Johansson',
  'Al-Rashid',
  'Kowalski',
  'Santos',
  'Nakamura',
  'Singh',
  'Fernandez',
  'Kim',
  'Mueller',
  'Osei',
  'Larsson',
  'Patel',
  'Costa',
  'Novak',
  'Ivanova',
  'Park',
  'Schmidt',
  'Torres',
  'Suzuki',
  'Sharma',
  'Anderson',
  'Dubois',
  'Morales',
  'Yamamoto',
  'Hansen',
  'Ali',
  'Volkov',
  'Reyes',
  'Watanabe',
  'Gupta',
  'Lindqvist',
  'Diallo',
  'Korhonen',
  'Silva',
  'Takahashi',
  'Nguyen',
  'Berg',
  'Rossi',
  'Sato',
  'Kumar',
  'Eriksson',
  'Cruz',
  'Kato',
  'Das',
  'Olsen',
  'Mendoza',
  'Ito',
  'Chandra',
  'Nilsson',
  'Bello',
  'Virtanen',
  'Lima',
  'Mori',
  'Rao',
  'Lund',
  'Adeyemi',
  'Hoshino',
  'Popov',
  'Nkosi',
  'Varga',
  'Fuentes',
  'Ishida',
  'Kovalenko',
  'Mbeki',
  'Svensson',
  'Ortega',
  'Hayashi',
  'Malhotra',
  'Bakker',
  'Guerrero',
  'Ueda',
  'Joshi',
  'Hedlund',
  'Mensah',
]

// --- Role Definitions ---

export const ROLES = {
  ENGINEER: { id: 'ENGINEER', name: 'Engineer', abbr: 'ENG', color: '#d97706' },
  BOTANIST: { id: 'BOTANIST', name: 'Botanist', abbr: 'BOT', color: '#16a34a' },
  GEOLOGIST: {
    id: 'GEOLOGIST',
    name: 'Geologist',
    abbr: 'GEO',
    color: '#ea580c',
  },
  MEDIC: { id: 'MEDIC', name: 'Medic', abbr: 'MED', color: '#ef4444' },
  GENERAL: { id: 'GENERAL', name: 'General', abbr: 'GEN', color: '#8b5cf6' },
  SOLDIER: { id: 'SOLDIER', name: 'Soldier', abbr: 'SOL', color: '#dc2626' },
}

const ROLE_LIST = Object.keys(ROLES)

// Which buildings each role boosts (+10% per colonist with that role)
const ROLE_BUILDING_MAP = {
  ENGINEER: ['SOLAR_PANEL', 'RTG', 'RESEARCH_LAB'],
  BOTANIST: ['HYDROPONIC_FARM', 'OXYGEN_GENERATOR'],
  GEOLOGIST: ['MINE', 'WATER_EXTRACTOR'],
  MEDIC: [], // heals colonists, no building boost
  GENERAL: null, // null = all buildings (smaller bonus)
  SOLDIER: ['DEFENSE_TURRET', 'RADAR_STATION'],
}

// Per-role bonus multiplier for matched buildings
const ROLE_BONUS = 0.1 // +10% per colonist of matching role
const GENERAL_BONUS = 0.03 // +3% per GENERAL colonist (all buildings)
const MEDIC_HEAL_RATE = 0.5 // +0.5 HP/tick per MEDIC

// Event effects on colonists
const EVENT_COLONIST_EFFECTS = {
  METEOR_STRIKE: { health: -20, morale: -10 },
  DUST_STORM: { health: -5, morale: -5 },
  SOLAR_FLARE: { health: 0, morale: -10 },
  EQUIPMENT_FAILURE: { health: 0, morale: -5 },
  RESOURCE_DISCOVERY: { health: 0, morale: 5 },
}

// --- Colonist Creation ---

/**
 * Create a new colonist with random name and role.
 */
export function createColonist(state) {
  const rng = mulberry32(
    (state.terrainSeed || 42) * 97 + (state.nextColonistId || 1) * 131,
  )
  const firstIdx = Math.floor(rng() * FIRST_NAMES.length)
  const lastIdx = Math.floor(rng() * LAST_NAMES.length)
  const roleIdx = Math.floor(rng() * ROLE_LIST.length)

  const colonist = {
    id: state.nextColonistId++,
    name: FIRST_NAMES[firstIdx] + ' ' + LAST_NAMES[lastIdx],
    role: ROLE_LIST[roleIdx],
    health: 100,
    morale: 80,
    arrivalTick: state.tickCount || 0,
  }
  return colonist
}

/**
 * Create the initial roster for a new colony (3 colonists).
 * Guarantees at least 1 ENGINEER, 1 BOTANIST, 1 GEOLOGIST.
 */
export function createInitialColonists(state) {
  const colonists = []

  // First 3: guaranteed roles
  const guaranteed = ['ENGINEER', 'BOTANIST', 'GEOLOGIST']
  for (const role of guaranteed) {
    const rng = mulberry32(
      (state.terrainSeed || 42) * 97 + (state.nextColonistId || 1) * 131,
    )
    const firstIdx = Math.floor(rng() * FIRST_NAMES.length)
    const lastIdx = Math.floor(rng() * LAST_NAMES.length)
    colonists.push({
      id: state.nextColonistId++,
      name: FIRST_NAMES[firstIdx] + ' ' + LAST_NAMES[lastIdx],
      role,
      health: 100,
      morale: 80,
      arrivalTick: 0,
    })
  }

  return colonists
}

// --- Health & Morale Processing ---

/**
 * Process colonist health and morale for one tick.
 * Mutates colonists in place. Returns { deaths, messages }.
 */
export function processColonistTick(state) {
  const messages = []
  const deaths = []
  const pop = state.colonists.length
  const res = state.resources || {}

  // Resource adequacy — are there enough resources for the population?
  const foodAdequate = (res.food || 0) > pop * 0.5
  const waterAdequate = (res.water || 0) > pop * 0.33
  const oxygenAdequate = (res.oxygen || 0) > pop

  // Count medics for healing bonus
  const medicCount = state.colonists.filter(
    (c) => c.role === 'MEDIC' && c.health > 0,
  ).length

  const overcrowded = pop > (state.populationCapacity || 10)

  for (const c of state.colonists) {
    // --- Health ---
    if (foodAdequate && waterAdequate && oxygenAdequate) {
      c.health = Math.min(100, c.health + 0.5) // natural recovery
    } else {
      if (!foodAdequate) c.health = Math.max(0, c.health - 2)
      if (!waterAdequate) c.health = Math.max(0, c.health - 2)
      if (!oxygenAdequate) c.health = Math.max(0, c.health - 5)
    }

    // Medic bonus (stacks)
    if (medicCount > 0) {
      c.health = Math.min(100, c.health + medicCount * MEDIC_HEAL_RATE)
    }

    // --- Morale ---
    if (c.health > 50 && !overcrowded) {
      c.morale = Math.min(100, c.morale + 0.3) // natural recovery
    }
    if (overcrowded) {
      c.morale = Math.max(0, c.morale - 1)
    }

    // --- Death check ---
    if (c.health <= 0) {
      deaths.push(c)
      let cause = 'unknown causes'
      if (!oxygenAdequate) cause = 'oxygen deprivation'
      else if (!foodAdequate) cause = 'starvation'
      else if (!waterAdequate) cause = 'dehydration'
      messages.push(`${c.name} has died from ${cause}!`)
    }
  }

  // Remove dead colonists
  if (deaths.length > 0) {
    const deadIds = new Set(deaths.map((d) => d.id))
    state.colonists = state.colonists.filter((c) => !deadIds.has(c.id))
  }

  return { deaths, messages }
}

// --- Event Effects ---

/**
 * Apply event damage to all colonists.
 */
export function applyEventToColonists(state, eventType) {
  const effects = EVENT_COLONIST_EFFECTS[eventType]
  if (!effects) return []

  const messages = []
  for (const c of state.colonists) {
    if (effects.health !== 0)
      c.health = Math.max(0, Math.min(100, c.health + effects.health))
    if (effects.morale !== 0)
      c.morale = Math.max(0, Math.min(100, c.morale + effects.morale))
  }

  if (effects.health < 0 || effects.morale < 0) {
    const parts = []
    if (effects.health !== 0) parts.push(`${effects.health} health`)
    if (effects.morale !== 0) parts.push(`${effects.morale} morale`)
    messages.push(`Colonists affected: ${parts.join(', ')}`)
  }

  return messages
}

/**
 * Apply building-loss morale penalty to all colonists.
 */
export function applyBuildingLostPenalty(state) {
  for (const c of state.colonists) {
    c.morale = Math.max(0, c.morale - 5)
  }
}

// --- Role Bonuses ---

/**
 * Compute production bonus multipliers from colonist roles.
 * Returns { globalMultiplier, buildingMultipliers }.
 */
export function computeRoleBonuses(state) {
  const buildingMultipliers = {}
  let globalMultiplier = 1.0

  if (!state.colonists || state.colonists.length === 0) {
    return { globalMultiplier, buildingMultipliers }
  }

  // Count effective colonists by role (weighted by individual efficiency)
  // Exclude colonists on missions — they don't contribute role bonuses
  const roleCounts = {}
  for (const c of state.colonists) {
    if (c.onMission) continue
    const eff = getColonistEfficiency(c)
    roleCounts[c.role] = (roleCounts[c.role] || 0) + eff
  }

  // Apply role-specific building bonuses
  for (const [role, effectiveCount] of Object.entries(roleCounts)) {
    if (role === 'GENERAL') {
      // General bonus applies to all buildings
      globalMultiplier += effectiveCount * GENERAL_BONUS
    } else if (role === 'MEDIC') {
      // Medic doesn't boost buildings (heals colonists instead)
      continue
    } else {
      const buildings = ROLE_BUILDING_MAP[role]
      if (buildings) {
        for (const bId of buildings) {
          buildingMultipliers[bId] =
            (buildingMultipliers[bId] || 1.0) + effectiveCount * ROLE_BONUS
        }
      }
    }
  }

  return { globalMultiplier, buildingMultipliers }
}

/**
 * Get individual colonist work efficiency (0-1).
 */
export function getColonistEfficiency(colonist) {
  let eff = 1.0
  if (colonist.health < 30) eff *= 0.5
  if (colonist.morale < 20) eff *= 0.7
  return eff
}

/**
 * Compute colony-wide efficiency factor from average colonist health/morale.
 * Returns a multiplier 0-1.
 */
export function computeColonyEfficiency(colonists) {
  if (!colonists || colonists.length === 0) return 1.0

  // Exclude colonists on missions from efficiency calculation
  const present = colonists.filter((c) => !c.onMission)
  if (present.length === 0) return 1.0

  let totalHealthFactor = 0
  let totalMoraleFactor = 0

  for (const c of present) {
    totalHealthFactor += c.health < 30 ? 0.5 : 1.0
    totalMoraleFactor += c.morale < 20 ? 0.7 : 1.0
  }

  const avgHealth = totalHealthFactor / present.length
  const avgMorale = totalMoraleFactor / present.length
  return avgHealth * avgMorale
}

// --- Population Growth ---

const POPULATION_GROWTH_INTERVAL_TICKS = 10

/**
 * Check if a new colonist should arrive. Returns colonist or null.
 */
export function checkPopulationGrowth(state, modifiers) {
  const pop = state.colonists.length
  const res = state.resources || {}

  if (!state.alive) return null
  if (modifiers.blockPopulationGrowth) return null
  if ((res.food || 0) <= 20) return null
  if ((res.water || 0) <= 20) return null
  if ((res.oxygen || 0) <= 10) return null
  if (pop >= (state.populationCapacity || 10)) return null

  const lastArrivalTick = state.lastColonistArrivalTick ?? 0
  if (
    (state.tickCount || 0) - lastArrivalTick <
    POPULATION_GROWTH_INTERVAL_TICKS
  )
    return null

  // Require avg morale > 40 for growth
  if (state.colonists.length > 0) {
    const avgMorale =
      state.colonists.reduce((s, c) => s + c.morale, 0) / state.colonists.length
    if (avgMorale <= 40) return null
  }

  return createColonist(state)
}
