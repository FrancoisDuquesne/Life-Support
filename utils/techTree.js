// Colony-wide research tech tree — pure JS, no Vue deps.
// Players spend accumulated research to unlock global bonuses.

export const TECH_BRANCHES = [
  { id: 'engineering', name: 'Engineering', color: '#f59e0b' },
  { id: 'biology', name: 'Biology', color: '#22c55e' },
  { id: 'geology', name: 'Geology', color: '#f97316' },
]

export const TECHS = [
  // --- Engineering (Energy) ---
  {
    id: 'efficient_wiring',
    name: 'Efficient Wiring',
    description: '-15% energy consumption all buildings',
    branch: 'engineering',
    tier: 1,
    cost: 15,
    requires: [],
    effects: { energyConsumptionMult: 0.85 },
  },
  {
    id: 'advanced_materials',
    name: 'Advanced Materials',
    description: '-20% mineral cost for building',
    branch: 'engineering',
    tier: 2,
    cost: 35,
    requires: ['efficient_wiring'],
    effects: { mineralCostMult: 0.8 },
  },
  {
    id: 'fusion_theory',
    name: 'Fusion Theory',
    description: 'RTGs produce 40% more energy',
    branch: 'engineering',
    tier: 3,
    cost: 70,
    requires: ['advanced_materials'],
    effects: { rtgProductionMult: 1.4 },
  },

  // --- Biology (Life Support) ---
  {
    id: 'nutrient_optimization',
    name: 'Nutrient Optimization',
    description: '+20% food production',
    branch: 'biology',
    tier: 1,
    cost: 15,
    requires: [],
    effects: { foodProductionMult: 1.2 },
  },
  {
    id: 'closed_loop_water',
    name: 'Closed-Loop Water',
    description: '-25% water consumption',
    branch: 'biology',
    tier: 2,
    cost: 35,
    requires: ['nutrient_optimization'],
    effects: { waterConsumptionMult: 0.75 },
  },
  {
    id: 'atmospheric_processors',
    name: 'Atmospheric Processors',
    description: '+75% oxygen prod, +3 pop cap/habitat',
    branch: 'biology',
    tier: 3,
    cost: 70,
    requires: ['closed_loop_water'],
    effects: { oxygenProductionMult: 1.75, habitatCapacityBonus: 3 },
  },

  // --- Geology (Industry) ---
  {
    id: 'survey_techniques',
    name: 'Survey Techniques',
    description: 'Build radius +2 hexes',
    branch: 'geology',
    tier: 1,
    cost: 15,
    requires: [],
    effects: { buildRadiusBonus: 2 },
  },
  {
    id: 'deep_core_mining',
    name: 'Deep Core Mining',
    description: '+30% mineral production',
    branch: 'geology',
    tier: 2,
    cost: 35,
    requires: ['survey_techniques'],
    effects: { mineralsProductionMult: 1.3 },
  },
  {
    id: 'autonomous_extraction',
    name: 'Autonomous Extraction',
    description: 'Mines consume no energy',
    branch: 'geology',
    tier: 3,
    cost: 70,
    requires: ['deep_core_mining'],
    effects: { mineEnergyConsumptionMult: 0.0 },
  },

  // --- Capstones ---
  {
    id: 'rapid_deployment',
    name: 'Rapid Deployment',
    description: 'Construction -1 tick (min 1)',
    branch: 'capstone',
    tier: 4,
    cost: 100,
    requires: [],
    requiresAnyT3Count: 2,
    effects: { buildTimeReduction: 1 },
  },
  {
    id: 'colony_optimization',
    name: 'Colony Optimization',
    description: '+15% all production',
    branch: 'capstone',
    tier: 4,
    cost: 100,
    requires: ['advanced_materials', 'closed_loop_water', 'deep_core_mining'],
    effects: { globalProductionMult: 1.15 },
  },
]

export const TECH_MAP = Object.fromEntries(TECHS.map((t) => [t.id, t]))

const TIER_3_IDS = TECHS.filter((t) => t.tier === 3).map((t) => t.id)

const DEFAULT_EFFECTS = {
  energyConsumptionMult: 1.0,
  mineralCostMult: 1.0,
  rtgProductionMult: 1.0,
  foodProductionMult: 1.0,
  waterConsumptionMult: 1.0,
  oxygenProductionMult: 1.0,
  habitatCapacityBonus: 0,
  buildRadiusBonus: 0,
  mineralsProductionMult: 1.0,
  mineEnergyConsumptionMult: 1.0,
  buildTimeReduction: 0,
  globalProductionMult: 1.0,
}

/**
 * Check if a tech can be researched.
 * Returns { canResearch, reason }.
 */
export function canResearch(unlockedTechs, techId, researchPoints) {
  const tech = TECH_MAP[techId]
  if (!tech) return { canResearch: false, reason: 'Unknown technology' }

  const unlocked = new Set(unlockedTechs || [])
  if (unlocked.has(techId))
    return { canResearch: false, reason: 'Already researched' }

  // Check standard prerequisites
  for (const req of tech.requires) {
    if (!unlocked.has(req)) {
      const reqTech = TECH_MAP[req]
      return {
        canResearch: false,
        reason: `Requires ${reqTech?.name || req}`,
      }
    }
  }

  // Check special "any N tier-3 techs" prerequisite
  if (tech.requiresAnyT3Count) {
    const unlockedT3 = TIER_3_IDS.filter((id) => unlocked.has(id)).length
    if (unlockedT3 < tech.requiresAnyT3Count) {
      return {
        canResearch: false,
        reason: `Requires any ${tech.requiresAnyT3Count} tier-3 techs (have ${unlockedT3})`,
      }
    }
  }

  if ((researchPoints || 0) < tech.cost) {
    return { canResearch: false, reason: 'Not enough research' }
  }

  return { canResearch: true, reason: '' }
}

/**
 * Attempt to research a tech. Deducts cost, pushes to state.unlockedTechs.
 * Returns { success, message }.
 */
export function researchTech(state, techId) {
  const tech = TECH_MAP[techId]
  if (!tech) return { success: false, message: 'Unknown technology' }

  const check = canResearch(
    state.unlockedTechs,
    techId,
    state.resources?.research,
  )
  if (!check.canResearch) {
    return { success: false, message: check.reason }
  }

  state.resources.research -= tech.cost
  if (!state.unlockedTechs) state.unlockedTechs = []
  state.unlockedTechs.push(techId)

  return { success: true, message: `Researched: ${tech.name}` }
}

/**
 * Compute aggregated tech effects from unlocked techs.
 * Multipliers stack multiplicatively, additive bonuses stack additively.
 */
export function getTechEffects(unlockedTechs) {
  const result = { ...DEFAULT_EFFECTS }
  if (!unlockedTechs || unlockedTechs.length === 0) return result

  for (const techId of unlockedTechs) {
    const tech = TECH_MAP[techId]
    if (!tech || !tech.effects) continue
    for (const [key, value] of Object.entries(tech.effects)) {
      if (!(key in result)) continue
      if (
        key === 'habitatCapacityBonus' ||
        key === 'buildRadiusBonus' ||
        key === 'buildTimeReduction'
      ) {
        // Additive bonuses
        result[key] += value
      } else {
        // Multiplicative bonuses
        result[key] *= value
      }
    }
  }

  return result
}

/**
 * Compute tech statuses for UI display.
 * Returns { techId: 'unlocked' | 'available' | 'locked' }.
 */
export function getTechStatuses(unlockedTechs, researchPoints) {
  const unlocked = new Set(unlockedTechs || [])
  const statuses = {}

  for (const tech of TECHS) {
    if (unlocked.has(tech.id)) {
      statuses[tech.id] = 'unlocked'
      continue
    }

    // Check prerequisites (without checking cost)
    let prereqsMet = true
    for (const req of tech.requires) {
      if (!unlocked.has(req)) {
        prereqsMet = false
        break
      }
    }
    if (prereqsMet && tech.requiresAnyT3Count) {
      const unlockedT3 = TIER_3_IDS.filter((id) => unlocked.has(id)).length
      if (unlockedT3 < tech.requiresAnyT3Count) prereqsMet = false
    }

    statuses[tech.id] = prereqsMet ? 'available' : 'locked'
  }

  return statuses
}
