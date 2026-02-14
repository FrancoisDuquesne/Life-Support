import { hexesInRadius, hexDistance, offsetToCube } from '~/utils/hex'
import {
  createColonyState,
  processTick as engineTick,
  buildAt as engineBuild,
  demolishAt as engineDemolish,
  upgradeBuildingAt as engineUpgradeBuilding,
  getBuildableCells as engineBuildableCells,
  toSnapshot,
  getBuildingsInfo as engineBuildingsInfo,
  computeResourceDeltas as engineDeltas,
  getUpgradeOptions as engineGetUpgradeOptions,
  setColonistTarget,
  GRID_WIDTH,
  GRID_HEIGHT,
} from '~/utils/gameEngine'
import {
  createMission as engineCreateMission,
  getAvailableMissions as engineAvailableMissions,
} from '~/utils/missionEngine'
import { saveGame, loadGame, clearSave } from '~/utils/saveManager'
import {
  generateTerrainMap,
  clearTerrainCache,
  getTerrainAt,
} from '~/utils/terrain'
import { clearDrawingCaches } from '~/utils/drawing'

export function useColony() {
  const DEV_MODE_ALLOWED = import.meta.dev
  const DEV_PRESET_ID = 'developer-balanced'
  const DEV_PRESET_STORAGE_KEY = 'life-support-dev-preset-enabled'
  const EMPTY_DELTAS = {
    energy: 0,
    food: 0,
    water: 0,
    minerals: 0,
    oxygen: 0,
    research: 0,
    waste: 0,
  }

  const state = ref(null)
  const buildingsInfo = ref([])
  const eventLog = ref([])
  const resourceHistory = ref([])
  const isNewGame = ref(false)
  const MAX_HISTORY = 60

  // Internal mutable colony (not the reactive snapshot)
  let colony = null
  let tickTimer = null

  // Revealed tiles state
  const revealedTiles = ref(new Set())

  // Terrain map (generated from seed, shared with GameMap)
  const terrainMap = ref(null)
  const devModeEnabled = ref(DEV_MODE_ALLOWED)

  function readDevModePreference() {
    if (!DEV_MODE_ALLOWED) return false
    try {
      const raw = localStorage.getItem(DEV_PRESET_STORAGE_KEY)
      if (raw === null) return true
      return raw === '1'
    } catch (_) {
      return true
    }
  }

  function persistDevModePreference(enabled) {
    if (!DEV_MODE_ALLOWED) return
    try {
      localStorage.setItem(DEV_PRESET_STORAGE_KEY, enabled ? '1' : '0')
    } catch (_) {
      // ignore storage write failures
    }
  }

  function cubeLerp(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    }
  }

  function cubeRound(cube) {
    let rx = Math.round(cube.x)
    let ry = Math.round(cube.y)
    let rz = Math.round(cube.z)

    const xDiff = Math.abs(rx - cube.x)
    const yDiff = Math.abs(ry - cube.y)
    const zDiff = Math.abs(rz - cube.z)

    if (xDiff > yDiff && xDiff > zDiff) {
      rx = -ry - rz
    } else if (yDiff > zDiff) {
      ry = -rx - rz
    } else {
      rz = -rx - ry
    }

    return { x: rx, y: ry, z: rz }
  }

  function cubeToOddQ(cube) {
    const col = cube.x
    const row = cube.z + (cube.x - (cube.x & 1)) / 2
    return { col, row }
  }

  function terrainElevation(tile) {
    const id = tile?.terrain?.id
    if (id === 'CRATER') return 0.4
    if (id === 'PLAINS' || id === 'ICE_FIELD') return 1
    if (id === 'VOLCANIC') return 1.6
    if (id === 'HIGHLANDS') return 2.5
    return 1
  }

  function hasLineOfSight(sx, sy, tx, ty) {
    if (!terrainMap.value) return true
    if (sx === tx && sy === ty) return true

    const distance = hexDistance(sx, sy, tx, ty)
    if (distance <= 1) return true

    const startCube = offsetToCube(sx, sy)
    const endCube = offsetToCube(tx, ty)
    const startTile = getTerrainAt(terrainMap.value, sx, sy, GRID_WIDTH)
    const targetTile = getTerrainAt(terrainMap.value, tx, ty, GRID_WIDTH)

    const startHeight = terrainElevation(startTile) + 0.45
    const endHeight = terrainElevation(targetTile)

    for (let i = 1; i < distance; i++) {
      const t = i / distance
      const cube = cubeRound(cubeLerp(startCube, endCube, t))
      const { col, row } = cubeToOddQ(cube)
      if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_HEIGHT)
        continue
      const tile = getTerrainAt(terrainMap.value, col, row, GRID_WIDTH)
      const blockerHeight = terrainElevation(tile)
      const rayHeight = startHeight + (endHeight - startHeight) * t
      if (blockerHeight > rayHeight + 0.25) {
        return false
      }
    }

    return true
  }

  function getLandingPosition() {
    const placed = colony?.placedBuildings || []
    const mdv = placed.find((b) => b.type === 'MDV_LANDING_SITE')
    if (mdv) return { x: mdv.x, y: mdv.y }
    return {
      x: Math.floor((gridWidth.value || GRID_WIDTH) / 2),
      y: Math.floor((gridHeight.value || GRID_HEIGHT) / 2),
    }
  }

  function initRevealedMap() {
    const gw = gridWidth.value
    const gh = gridHeight.value
    const revealed = new Set()
    const { x: centerCol, y: centerRow } = getLandingPosition()
    const maxSightRadius = 11

    const candidates = hexesInRadius(
      centerCol,
      centerRow,
      maxSightRadius,
      gw,
      gh,
    )
    for (const [col, row] of candidates) {
      const dist = hexDistance(centerCol, centerRow, col, row)
      if (dist > maxSightRadius) continue
      if (dist <= 2) {
        revealed.add(col + ',' + row)
        continue
      }
      const distFalloff = 1 - dist / (maxSightRadius + 1)
      const tile = getTerrainAt(terrainMap.value, col, row, GRID_WIDTH)
      const visibilityBoost = tile?.terrain?.id === 'CRATER' ? 0.12 : 0
      const visibilityPenalty = tile?.terrain?.id === 'HIGHLANDS' ? 0.1 : 0
      const threshold =
        0.1 + distFalloff * 0.9 + visibilityBoost - visibilityPenalty
      if (threshold > 0.18 && hasLineOfSight(centerCol, centerRow, col, row)) {
        revealed.add(col + ',' + row)
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
    devModeEnabled.value = readDevModePreference()

    // Try loading saved game
    const saved = devModeEnabled.value ? null : loadGame()
    if (saved) {
      isNewGame.value = false
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
      isNewGame.value = true
      const terrainSeed = Math.floor(Math.random() * 2147483647)
      const terrainOk = generateTerrain(terrainSeed)
      colony = createColonyState({
        terrainSeed,
        terrainMap: terrainMap.value,
        preset: devModeEnabled.value ? DEV_PRESET_ID : undefined,
      })
      state.value = toSnapshot(colony)
      pushHistory(state.value)
      addLog(
        0,
        devModeEnabled.value
          ? 'Developer preset loaded: balanced starter colony.'
          : 'Colony connection established.',
      )
      if (!terrainOk) {
        addLog(0, 'WARNING: Terrain generation failed, using fallback tiles.')
      }
      initRevealedMap()
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

  function trySave() {
    const ok = saveGame(colony, revealedTiles.value)
    if (!ok) {
      addLog(
        colony?.tickCount ?? null,
        'WARNING: Failed to save — storage may be full.',
      )
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

    trySave()
  }

  function buildAt(type, x, y) {
    if (!colony) return { success: false, message: 'Colony not initialized' }
    const result = engineBuild(colony, type, x, y, terrainMap.value)
    state.value = result.colonyState
    addLog(state.value ? state.value.tickCount : null, result.message)
    if (result.success) {
      trySave()
    }
    return result
  }

  function upgradeBuildingAt(x, y, branchChoice) {
    if (!colony) return { success: false, message: 'Colony not initialized' }
    const result = engineUpgradeBuilding(colony, x, y, branchChoice)
    state.value = result.colonyState
    addLog(state.value ? state.value.tickCount : null, result.message)
    if (result.success) {
      trySave()
    }
    return result
  }

  function getUpgradeOptions(x, y) {
    if (!colony) return null
    return engineGetUpgradeOptions(colony, x, y)
  }

  function launchMission(typeId, colonistIds, targetX, targetY) {
    if (!colony) return { success: false, message: 'Colony not initialized' }
    const result = engineCreateMission(
      colony,
      typeId,
      colonistIds,
      targetX,
      targetY,
    )
    if (result.success) {
      state.value = toSnapshot(colony)
      addLog(state.value.tickCount, result.message)
      trySave()
    }
    return result
  }

  const availableMissions = computed(() => {
    if (!colony) return []
    return engineAvailableMissions(colony)
  })

  function moveColonistTo(colonistId, x, y) {
    if (!colony) return { success: false, message: 'Colony not initialized' }
    const result = setColonistTarget(colony, colonistId, x, y)
    if (result.success) {
      state.value = toSnapshot(colony)
      trySave()
    }
    return result
  }

  function demolishAt(x, y) {
    if (!colony) return { success: false, message: 'Colony not initialized' }
    const result = engineDemolish(colony, x, y)
    state.value = result.colonyState
    addLog(state.value ? state.value.tickCount : null, result.message)
    if (result.success) {
      trySave()
    }
    return result
  }

  function resetColony() {
    isNewGame.value = true
    clearSave()
    clearTerrainCache()
    clearDrawingCaches()
    const terrainSeed = Math.floor(Math.random() * 2147483647)
    const terrainOk = generateTerrain(terrainSeed)
    colony = createColonyState({
      terrainSeed,
      terrainMap: terrainMap.value,
      preset: devModeEnabled.value ? DEV_PRESET_ID : undefined,
    })
    state.value = toSnapshot(colony)
    eventLog.value = []
    resourceHistory.value = []
    pushHistory(state.value)
    addLog(
      0,
      devModeEnabled.value
        ? 'Developer preset loaded: balanced starter colony.'
        : 'Colony has been reset.',
    )
    if (!terrainOk) {
      addLog(0, 'WARNING: Terrain generation failed, using fallback tiles.')
    }
    initRevealedMap()
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
      research: cs.resources.research || 0,
    })
    if (resourceHistory.value.length > MAX_HISTORY) {
      resourceHistory.value = resourceHistory.value.slice(-MAX_HISTORY)
    }
  }

  function addLog(tick, msg) {
    let severity = 'normal'
    if (/COLLAPSED|DEAD|has died/i.test(msg)) severity = 'collapse'
    else if (/METEOR|disrepair|\[ALIEN\]/i.test(msg)) severity = 'danger'
    else if (
      /WARNING|shortage|STORM|FLARE|FAILURE|Waste|\[DEFENSE\]/i.test(msg)
    )
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

  const buildableCells = computed(() => {
    if (!state.value) return new Set()
    return engineBuildableCells(state.value)
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

  function setDevModeEnabled(enabled) {
    if (!DEV_MODE_ALLOWED) return
    devModeEnabled.value = !!enabled
    persistDevModePreference(devModeEnabled.value)
  }

  function pauseGame() {
    stopTickTimer()
  }

  function resumeGame() {
    startTickTimer()
  }

  onUnmounted(stopTickTimer)

  return {
    state,
    buildingsInfo,
    eventLog,
    isNewGame,
    gridWidth,
    gridHeight,
    resourceDeltas,
    resourceHistory,
    revealedTiles,
    terrainMap,
    buildableCells,
    activeEvents,
    availableMissions,
    tickSpeed,
    devModeAllowed: DEV_MODE_ALLOWED,
    devModeEnabled,
    init,
    buildAt,
    upgradeBuildingAt,
    getUpgradeOptions,
    launchMission,
    demolishAt,
    moveColonistTo,
    resetColony,
    canAfford,
    revealAround,
    manualTick,
    setSpeed,
    setDevModeEnabled,
    pauseGame,
    resumeGame,
  }
}
