// Milestone definitions and checking logic

export const MILESTONES = [
  {
    id: 'first_building',
    name: 'First Steps',
    description: 'Build your first structure',
    icon: '🔨',
    check: (s) => totalBuildings(s) >= 2,
  },
  {
    id: 'power_up',
    name: 'Power Up',
    description: 'Build 3 Solar Panels',
    icon: '⚡',
    check: (s) => (s.buildings?.solar_panel || 0) >= 3,
  },
  {
    id: 'self_sufficient',
    name: 'Self-Sufficient',
    description: 'Have positive deltas on all resources',
    icon: '♻️',
    check: (s, d) =>
      d &&
      d.energy > 0 &&
      d.food > 0 &&
      d.water > 0 &&
      d.minerals > 0 &&
      d.oxygen > 0,
  },
  {
    id: 'growing_colony',
    name: 'Growing Colony',
    description: 'Reach 5 colonists',
    icon: '👥',
    check: (s) => (s.population || 0) >= 5,
  },
  {
    id: 'survivor',
    name: 'Survivor',
    description: 'Survive 50 ticks',
    icon: '⏱️',
    check: (s) => (s.tickCount || 0) >= 50,
  },
  {
    id: 'big_colony',
    name: 'Thriving',
    description: 'Reach 10 colonists',
    icon: '🏘️',
    check: (s) => (s.population || 0) >= 10,
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Survive 200 ticks',
    icon: '🎖️',
    check: (s) => (s.tickCount || 0) >= 200,
  },
  {
    id: 'industrialist',
    name: 'Industrialist',
    description: 'Build 3 Mining Facilities',
    icon: '⛏️',
    check: (s) => (s.buildings?.mine || 0) >= 3,
  },
  {
    id: 'endurance',
    name: 'Endurance',
    description: 'Survive 500 ticks',
    icon: '🏆',
    check: (s) => (s.tickCount || 0) >= 500,
  },
  {
    id: 'explorer',
    name: 'Explorer',
    description: 'Complete your first mission',
    icon: '🔭',
    check: (s) => (s.completedMissions || []).length >= 1,
  },
  {
    id: 'defender',
    name: 'Defender',
    description: 'Repel an alien attack',
    icon: '🛡️',
    check: (s) => (s.alienEvents || []).some((e) => e.mitigated),
  },
  {
    id: 'researcher',
    name: 'Researcher',
    description: 'Accumulate 50 research',
    icon: '🔬',
    check: (s) => (s.resources?.research || 0) >= 50,
  },
  {
    id: 'deep_upgraded',
    name: 'Deep Upgraded',
    description: 'Reach level 5 on any building',
    icon: '⚙️',
    check: (s) => (s.placedBuildings || []).some((b) => (b.level || 1) >= 5),
  },
]

function totalBuildings(s) {
  if (!s.buildings) return 0
  return Object.values(s.buildings).reduce((sum, v) => sum + v, 0)
}

const STORAGE_KEY = 'life-support-milestones'

export function loadUnlockedMilestones() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (_) {
    return []
  }
}

export function saveUnlockedMilestones(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch (_) {}
}

export function checkMilestones(state, deltas, alreadyUnlocked) {
  const unlockedSet = new Set(alreadyUnlocked)
  const newlyUnlocked = []
  for (const m of MILESTONES) {
    if (unlockedSet.has(m.id)) continue
    if (m.check(state, deltas)) {
      newlyUnlocked.push(m)
    }
  }
  return newlyUnlocked
}
