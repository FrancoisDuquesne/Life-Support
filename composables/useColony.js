import {
  hexNeighbors,
  hexDistance,
  hexesInRadius,
  mulberry32,
} from '~/utils/hex'
import {
  createColonyState,
  processTick as engineTick,
  buildAt as engineBuild,
  toSnapshot,
  getBuildingsInfo as engineBuildingsInfo,
  computeResourceDeltas as engineDeltas,
  GRID_WIDTH,
  GRID_HEIGHT,
} from '~/utils/gameEngine'
import { saveGame, loadGame, clearSave } from '~/utils/saveManager'
import { generateTerrainMap, clearTerrainCache } from '~/utils/terrain'
import { clearDrawingCaches } from '~/utils/drawing'

export function useColony() {
  const EMPTY_DELTAS = {
    energy: 0,
    food: 0,
    water: 0,
    minerals: 0,
    oxygen: 0,
    waste: 0,
  }

  const state = ref(null)
  const buildingsInfo = ref([])
  const eventLog = ref([])
  const resourceHistory = ref([])
  const MAX_HISTORY = 60

  // Internal mutable colony (not the reactive snapshot)
  let colony = null
  let tickTimer = null

  // Revealed tiles state
  const revealedTiles = ref(new Set())

  // Terrain map (generated from seed, shared with GameMap)
  const terrainMap = ref(null)

  function initRevealedMap(gw, gh, seed) {
    const centerCol = Math.floor(gw / 2)
    const centerRow = Math.floor(gh / 2)
    const rng = mulberry32(seed || Date.now())
    const revealed = new Set()
    const TARGET = 180

    const queue = [[centerCol, centerRow]]
    const visited = new Set()
    visited.add(centerCol + ',' + centerRow)
    revealed.add(centerCol + ',' + centerRow)

    while (queue.length > 0 && revealed.size < TARGET) {
      const [col, row] = queue.shift()
      const neighbors = hexNeighbors(col, row)
      for (const [nc, nr] of neighbors) {
        const key = nc + ',' + nr
        if (nc < 0 || nc >= gw || nr < 0 || nr >= gh) continue
        if (visited.has(key)) continue
        visited.add(key)

        const dist = hexDistance(centerCol, centerRow, nc, nr)
        const prob = Math.max(0.25, 0.95 - dist * 0.065)
        if (rng() < prob) {
          revealed.add(key)
          queue.push([nc, nr])
        }
      }
    }

    revealedTiles.value = revealed
  }

  function revealAround(x, y, radius) {
    const gw = gridWidth.value
    const gh = gridHeight.value
    const hexes = hexesInRadius(x, y, radius, gw, gh)
    const newSet = new Set(revealedTiles.value)
    for (const [c, r] of hexes) {
      newSet.add(c + ',' + r)
    }
    revealedTiles.value = newSet
  }

  function generateTerrain(seed) {
    try {
      terrainMap.value = generateTerrainMap(GRID_WIDTH, GRID_HEIGHT, seed)
      return true
    } catch (error) {
      console.error('Terrain generation failed:', error)
      terrainMap.value = null
      return false
    }
  }

  function init() {
    buildingsInfo.value = engineBuildingsInfo()

    // Try loading saved game
    const saved = loadGame()
    if (saved) {
      colony = saved.state
      revealedTiles.value = saved.revealedTiles
      const terrainOk = generateTerrain(colony.terrainSeed)
      state.value = toSnapshot(colony)
      pushHistory(state.value)
      addLog(colony.tickCount, 'Colony restored from save.')
      if (!terrainOk) {
        addLog(
          colony.tickCount,
          'WARNING: Terrain data unavailable, using fallback tiles.',
        )
      }
    } else {
      colony = createColonyState()
      const terrainOk = generateTerrain(colony.terrainSeed)
      state.value = toSnapshot(colony)
      pushHistory(state.value)
      addLog(0, 'Colony connection established.')
      if (!terrainOk) {
        addLog(0, 'WARNING: Terrain generation failed, using fallback tiles.')
      }
      initRevealedMap(GRID_WIDTH, GRID_HEIGHT, colony.terrainSeed)
    }

    startTickTimer()
  }

  function startTickTimer() {
    stopTickTimer()
    tickTimer = setInterval(() => {
      doTick()
    }, tickSpeed.value)
  }

  function stopTickTimer() {
    if (tickTimer !== null) {
      clearInterval(tickTimer)
      tickTimer = null
    }
  }

  function doTick() {
    if (!colony) return
    const result = engineTick(colony, terrainMap.value, revealedTiles.value)
    state.value = result.colonyState
    pushHistory(result.colonyState)
    if (result.events) addLog(result.tick, result.events)

    // Apply discovered tiles from events
    if (result.newRevealedTiles && result.newRevealedTiles.length > 0) {
      const newSet = new Set(revealedTiles.value)
      for (const key of result.newRevealedTiles) {
        newSet.add(key)
      }
      revealedTiles.value = newSet
    }

    saveGame(colony, revealedTiles.value)
  }

  function buildAt(type, x, y) {
    if (!colony) return { success: false, message: 'Colony not initialized' }
    const result = engineBuild(colony, type, x, y, terrainMap.value)
    state.value = result.colonyState
    addLog(state.value ? state.value.tickCount : null, result.message)
    if (result.success) {
      saveGame(colony, revealedTiles.value)
    }
    return result
  }

  function resetColony() {
    clearSave()
    clearTerrainCache()
    clearDrawingCaches()
    colony = createColonyState()
    const terrainOk = generateTerrain(colony.terrainSeed)
    state.value = toSnapshot(colony)
    eventLog.value = []
    resourceHistory.value = []
    pushHistory(state.value)
    addLog(0, 'Colony has been reset.')
    if (!terrainOk) {
      addLog(0, 'WARNING: Terrain generation failed, using fallback tiles.')
    }
    initRevealedMap(GRID_WIDTH, GRID_HEIGHT, colony.terrainSeed)
    startTickTimer()
  }

  function pushHistory(cs) {
    if (!cs || !cs.resources) return
    resourceHistory.value.push({
      tick: cs.tickCount || 0,
      energy: cs.resources.energy || 0,
      food: cs.resources.food || 0,
      water: cs.resources.water || 0,
      minerals: cs.resources.minerals || 0,
      oxygen: cs.resources.oxygen || 0,
    })
    if (resourceHistory.value.length > MAX_HISTORY) {
      resourceHistory.value = resourceHistory.value.slice(-MAX_HISTORY)
    }
  }

  function addLog(tick, msg) {
    let severity = 'normal'
    if (/COLLAPSED|DEAD|has died/i.test(msg)) severity = 'collapse'
    else if (/METEOR|disrepair/i.test(msg)) severity = 'danger'
    else if (/WARNING|shortage|STORM|FLARE|FAILURE|Waste/i.test(msg))
      severity = 'warning'
    eventLog.value.push({ tick, msg, severity, id: Date.now() + Math.random() })
    if (eventLog.value.length > 200) {
      eventLog.value = eventLog.value.slice(-200)
    }
  }

  function canAfford(cost) {
    if (!cost || !state.value || !state.value.resources) return false
    for (const k in cost) {
      if ((state.value.resources[k] || 0) < cost[k]) return false
    }
    return true
  }

  const resourceDeltas = computed(() => {
    if (!state.value || !terrainMap.value) return EMPTY_DELTAS
    return engineDeltas(state.value, terrainMap.value)
  })

  const activeEvents = computed(() => {
    if (!state.value || !state.value.activeEvents) return []
    return state.value.activeEvents.filter(
      (e) => e.endTick >= (state.value.tickCount || 0),
    )
  })

  const gridWidth = computed(() => GRID_WIDTH)
  const gridHeight = computed(() => GRID_HEIGHT)

  const tickSpeed = ref(5000)

  function manualTick() {
    doTick()
  }

  function setSpeed(intervalMs) {
    if (intervalMs < 200) intervalMs = 200
    if (intervalMs > 30000) intervalMs = 30000
    tickSpeed.value = intervalMs
    startTickTimer()
  }

  return {
    state,
    buildingsInfo,
    eventLog,
    gridWidth,
    gridHeight,
    resourceDeltas,
    resourceHistory,
    revealedTiles,
    terrainMap,
    activeEvents,
    tickSpeed,
    init,
    buildAt,
    resetColony,
    canAfford,
    revealAround,
    manualTick,
    setSpeed,
  }
}
