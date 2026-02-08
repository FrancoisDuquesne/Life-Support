// localStorage save/load for colony state + revealed tiles

const SAVE_KEY = 'life-support-save'
const SAVE_VERSION = 1

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
      placedBuildings: state.placedBuildings,
      nextBuildingId: state.nextBuildingId,
      population: state.population,
      populationCapacity: state.populationCapacity,
      tickCount: state.tickCount,
      alive: state.alive
    },
    revealedTiles: Array.from(revealedTiles)
  }
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data))
  } catch (_) {
    // quota exceeded or unavailable — silently ignore
  }
}

/**
 * Load saved game from localStorage.
 * Returns { state, revealedTiles } or null if no save / incompatible version.
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (data.v !== SAVE_VERSION) return null

    const s = data.state
    // Rebuild occupiedCells Set from placedBuildings
    const occupiedCells = new Set()
    for (const pb of s.placedBuildings) {
      occupiedCells.add(pb.x + ',' + pb.y)
    }

    const state = {
      name: s.name,
      resources: s.resources,
      buildings: s.buildings,
      placedBuildings: s.placedBuildings,
      occupiedCells,
      nextBuildingId: s.nextBuildingId,
      population: s.population,
      populationCapacity: s.populationCapacity,
      tickCount: s.tickCount,
      alive: s.alive
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
