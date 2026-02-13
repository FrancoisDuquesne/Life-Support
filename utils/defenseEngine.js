// Defense and alien event system — pure JS, no Vue dependencies
import { mulberry32 } from '~/utils/hex'

export const ALIEN_EVENT_TYPES = {
  SCOUT_PROBE: {
    id: 'SCOUT_PROBE',
    name: 'Alien Scout Probe',
    minTick: 30,
    probability: 0.01,
    threat: 5,
    duration: 3,
    moralePenalty: 3,
    productionPenalty: 0.05,
    damage: 0,
  },
  RAIDER_PARTY: {
    id: 'RAIDER_PARTY',
    name: 'Alien Raider Party',
    minTick: 80,
    probability: 0.006,
    threat: 15,
    duration: 5,
    moralePenalty: 10,
    productionPenalty: 0,
    damage: 20,
  },
  SIEGE: {
    id: 'SIEGE',
    name: 'Alien Siege',
    minTick: 150,
    probability: 0.003,
    threat: 30,
    duration: 8,
    moralePenalty: 5,
    productionPenalty: 0,
    damagePerTick: 10,
    blocksExpansion: true,
  },
}

/**
 * Compute the colony's total defense rating from turrets, radar, and soldiers.
 */
export function computeDefenseRating(state) {
  let defense = 0

  for (const pb of state.placedBuildings || []) {
    if (pb.hp !== undefined && pb.hp <= 0) continue
    if (pb.isUnderConstruction) continue

    if (pb.type === 'DEFENSE_TURRET') {
      defense += 10 * (pb.level || 1)
    } else if (pb.type === 'RADAR_STATION') {
      defense += 5 * (pb.level || 1)
    }
  }

  // Soldier colonist bonus
  for (const c of state.colonists || []) {
    if (c.onMission) continue
    if (c.role === 'SOLDIER') defense += 5
    if (c.role === 'GENERAL') defense += 3
  }

  return defense
}

/**
 * Roll for an alien event this tick. Returns event object or null.
 */
export function rollAlienEvent(state) {
  const rng = mulberry32(state.terrainSeed * 53 + state.tickCount * 7)

  // Don't stack too many alien events
  const activeCount = (state.alienEvents || []).filter(
    (e) => e.endTick >= state.tickCount,
  ).length
  if (activeCount >= 2) return null

  // Threat escalation: probability multiplier increases with tick count and colony size
  const tickScale = Math.min(3.0, 1.0 + (state.tickCount / 300))
  const colonyScale = Math.min(2.0, 1.0 + (state.placedBuildings || []).length / 30)
  const threatMult = Math.min(3.0, tickScale * colonyScale * 0.5)

  for (const evtType of Object.values(ALIEN_EVENT_TYPES)) {
    if (state.tickCount < evtType.minTick) continue

    // Don't duplicate active alien events of same type
    if (
      (state.alienEvents || []).some(
        (e) => e.type === evtType.id && e.endTick >= state.tickCount,
      )
    )
      continue

    if (rng() < evtType.probability * threatMult) {
      // Check for radar early warning
      const hasRadar = (state.placedBuildings || []).some(
        (pb) => pb.type === 'RADAR_STATION' && !pb.isUnderConstruction && (pb.hp || 0) > 0,
      )

      return {
        id: (state.nextEventId || 1),
        type: evtType.id,
        startTick: state.tickCount,
        endTick: state.tickCount + evtType.duration,
        threat: evtType.threat,
        earlyWarning: hasRadar ? 2 : 0,
        mitigated: false,
      }
    }
  }

  return null
}

/**
 * Resolve an alien event — apply damage mitigated by defense rating.
 */
export function resolveAlienEvent(state, event) {
  const messages = []
  const evtType = ALIEN_EVENT_TYPES[event.type]
  if (!evtType) return { messages }

  state.nextEventId = (state.nextEventId || 1) + 1

  const defenseRatio = Math.min(1.0, (state.defenseRating || 0) / evtType.threat)

  if (defenseRatio >= 1.0) {
    // Fully repelled
    event.mitigated = true
    messages.push(`[DEFENSE] ${evtType.name} was fully repelled by colony defenses!`)
    return { messages }
  }

  const damageScale = 1.0 - defenseRatio

  // Apply morale penalty
  if (evtType.moralePenalty) {
    const moraleDmg = Math.round(evtType.moralePenalty * damageScale)
    for (const c of state.colonists || []) {
      c.morale = Math.max(0, c.morale - moraleDmg)
    }
    if (moraleDmg > 0) {
      messages.push(`[ALIEN] ${evtType.name} detected! Colonist morale -${moraleDmg}`)
    }
  }

  // Apply building damage
  if (evtType.damage && damageScale > 0) {
    const totalDamage = Math.round(evtType.damage * damageScale)
    // Distribute damage to random buildings
    const damageable = (state.placedBuildings || []).filter(
      (pb) => pb.type !== 'MDV_LANDING_SITE' && pb.hp > 0,
    )
    if (damageable.length > 0) {
      const rng = mulberry32(state.terrainSeed * 67 + event.id * 31)
      const targetIdx = Math.floor(rng() * damageable.length)
      const target = damageable[targetIdx]
      target.hp = Math.max(0, target.hp - totalDamage)
      messages.push(
        `[ALIEN] ${evtType.name} dealt ${totalDamage} damage to ${target.type.replace(/_/g, ' ')} at (${target.x},${target.y})`,
      )
    }
  }

  if (defenseRatio > 0 && defenseRatio < 1.0) {
    messages.push(
      `[DEFENSE] Defenses mitigated ${Math.round(defenseRatio * 100)}% of the attack`,
    )
  }

  return { messages }
}
