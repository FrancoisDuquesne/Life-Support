// Mission dispatch and resolution system — pure JS, no Vue dependencies
import { mulberry32, hexesInRadius } from '~/utils/hex'
import { GRID_WIDTH, GRID_HEIGHT } from '~/utils/gameEngine'

export const MISSION_TYPES = {
  EXPLORE_SECTOR: {
    id: 'EXPLORE_SECTOR',
    name: 'Explore Sector',
    description: 'Send a scout to map nearby terrain',
    duration: 8,
    requiredColonists: 1,
    risk: 0.2,
    preferredRole: 'GEOLOGIST',
    rewards: { revealRadius: 6, depositChance: 0.3 },
  },
  GATHER_MINERALS: {
    id: 'GATHER_MINERALS',
    name: 'Gather Rare Minerals',
    description: 'Expedition to collect mineral deposits',
    duration: 12,
    requiredColonists: 2,
    risk: 0.3,
    preferredRole: 'GEOLOGIST',
    rewards: { minerals: [30, 60], research: [2, 8] },
  },
  INVESTIGATE_ANOMALY: {
    id: 'INVESTIGATE_ANOMALY',
    name: 'Investigate Anomaly',
    description: 'Study an anomalous signal or site',
    duration: 15,
    requiredColonists: 2,
    risk: 0.35,
    preferredRole: 'ENGINEER',
    rewards: { research: [10, 25], techUnlockChance: 0.4 },
  },
  SALVAGE_RUN: {
    id: 'SALVAGE_RUN',
    name: 'Salvage Run',
    description: 'Recover useful materials from a crash site',
    duration: 10,
    requiredColonists: 1,
    risk: 0.25,
    preferredRole: 'ENGINEER',
    rewards: { minerals: [15, 40] },
  },
  DEEP_SCAN: {
    id: 'DEEP_SCAN',
    name: 'Deep Scan',
    description: 'Comprehensive geological survey of a wide area',
    duration: 20,
    requiredColonists: 3,
    risk: 0.15,
    preferredRole: 'GEOLOGIST',
    rewards: { revealRadius: 12, guaranteedDeposits: 2 },
  },
}

/**
 * Create and dispatch a mission. Locks colonists.
 */
export function createMission(state, typeId, colonistIds, targetX, targetY) {
  const mType = MISSION_TYPES[typeId]
  if (!mType) return { success: false, message: 'Unknown mission type' }

  if (colonistIds.length < mType.requiredColonists) {
    return {
      success: false,
      message: `Need ${mType.requiredColonists} colonists`,
    }
  }

  // Check colonists are available
  for (const cid of colonistIds) {
    const c = state.colonists.find((col) => col.id === cid)
    if (!c) return { success: false, message: `Colonist ${cid} not found` }
    if (c.onMission)
      return { success: false, message: `${c.name} is already on a mission` }
  }

  const mission = {
    id: state.nextMissionId++,
    type: typeId,
    colonistIds: [...colonistIds],
    targetX,
    targetY,
    startTick: state.tickCount,
    endTick: state.tickCount + mType.duration,
    resolved: false,
  }

  if (!state.missions) state.missions = []
  state.missions.push(mission)

  // Lock colonists
  for (const cid of colonistIds) {
    const c = state.colonists.find((col) => col.id === cid)
    if (c) c.onMission = mission.id
  }

  return {
    success: true,
    message: `Mission "${mType.name}" dispatched`,
    mission,
  }
}

/**
 * Process mission ticks — resolve completed missions.
 */
export function processMissionTick(state, terrainMap, revealedTiles) {
  const messages = []
  const newRevealedTiles = []

  if (!state.missions) return { messages, newRevealedTiles }

  for (const mission of state.missions) {
    if (mission.resolved) continue
    if (state.tickCount < mission.endTick) continue

    mission.resolved = true
    const mType = MISSION_TYPES[mission.type]
    if (!mType) continue

    const rng = mulberry32(state.terrainSeed * 41 + mission.id * 73)

    // Check for injuries (risk)
    let riskMult = 1.0
    for (const cid of mission.colonistIds) {
      const c = state.colonists.find((col) => col.id === cid)
      if (c && c.role === mType.preferredRole) {
        riskMult = 0.5 // preferred role halves injury risk
        break
      }
    }

    const injured = rng() < mType.risk * riskMult
    if (injured) {
      const victimIdx = Math.floor(rng() * mission.colonistIds.length)
      const victimId = mission.colonistIds[victimIdx]
      const victim = state.colonists.find((c) => c.id === victimId)
      if (victim) {
        const damage = 15 + Math.floor(rng() * 20)
        victim.health = Math.max(0, victim.health - damage)
        messages.push(`${victim.name} was injured on mission (−${damage} HP)!`)
      }
    }

    // Apply rewards
    const rewards = mType.rewards
    if (rewards.minerals) {
      const [min, max] = rewards.minerals
      const amount = min + Math.floor(rng() * (max - min + 1))
      state.resources.minerals = (state.resources.minerals || 0) + amount
      messages.push(`Mission recovered ${amount} minerals`)
    }
    if (rewards.research) {
      const [min, max] = rewards.research
      const amount = min + Math.floor(rng() * (max - min + 1))
      state.resources.research = (state.resources.research || 0) + amount
      messages.push(`Mission yielded ${amount} research`)
    }
    if (rewards.revealRadius && mission.targetX !== undefined) {
      const revealed = hexesInRadius(
        mission.targetX,
        mission.targetY,
        rewards.revealRadius,
        GRID_WIDTH,
        GRID_HEIGHT,
      )
      for (const [rx, ry] of revealed) {
        const key = `${rx},${ry}`
        if (!revealedTiles.has(key)) {
          newRevealedTiles.push(key)
        }
      }
      messages.push(`Mission revealed ${newRevealedTiles.length} tiles`)
    }

    messages.push(`Mission "${mType.name}" completed!`)

    // Unlock colonists
    for (const cid of mission.colonistIds) {
      const c = state.colonists.find((col) => col.id === cid)
      if (c) c.onMission = null
    }

    // Track completion
    if (!state.completedMissions) state.completedMissions = []
    state.completedMissions.push(mission.id)
  }

  // Remove resolved missions
  state.missions = state.missions.filter((m) => !m.resolved)

  return { messages, newRevealedTiles }
}

/**
 * Get missions available to launch based on current state.
 */
export function getAvailableMissions(state) {
  const available = []
  const freeColonists = (state.colonists || []).filter(
    (c) => !c.onMission && c.health > 20,
  )

  for (const mType of Object.values(MISSION_TYPES)) {
    if (freeColonists.length < mType.requiredColonists) continue
    available.push({
      ...mType,
      availableColonists: freeColonists.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        isPreferred: c.role === mType.preferredRole,
      })),
    })
  }

  return available
}
