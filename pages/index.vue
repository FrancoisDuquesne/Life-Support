<script setup>
import { getTerrainAt, getTerrainBonusText } from '~/utils/terrain'
import {
  GRID_WIDTH,
  WASTE_OVERFLOW_PENALTY,
  MAX_UPGRADE_LEVEL,
} from '~/utils/gameEngine'
import { formatSignedFixed, roundTo } from '~/utils/formatting'
import { ROLES } from '~/utils/colonistEngine'
import {
  MILESTONES,
  loadUnlockedMilestones,
  saveUnlockedMilestones,
  checkMilestones,
} from '~/utils/milestones'

const colony = useColony()
const camera = useCamera(colony.gridWidth, colony.gridHeight)
const interaction = useGridInteraction(
  camera,
  colony.gridWidth,
  colony.gridHeight,
)

const wasteInfo = computed(() => {
  const s = colony.state.value
  if (!s) return { waste: 0, capacity: 50, pct: 0 }
  const waste = Math.round(s.waste || 0)
  const capacity = s.wasteCapacity || 50
  return { waste, capacity, pct: Math.min(100, (waste / capacity) * 100) }
})

const wasteDelta = computed(() => {
  const d = colony.resourceDeltas.value
  if (!d || d.waste === undefined) return 0
  return roundTo(d.waste, 1)
})

const wasteOverflowActive = computed(
  () => wasteInfo.value.waste > wasteInfo.value.capacity,
)
const wasteOverflowPenaltyPct = Math.round((1 - WASTE_OVERFLOW_PENALTY) * 100)

function formatSignedOneDecimal(value) {
  return formatSignedFixed(value, 1)
}

const showBuildSheet = ref(false)
const showResourceGraph = ref(false)
const showCollapseModal = ref(false)
const showEventLog = ref(false)
const showMissionPanel = ref(false)
const colonistsPanelRef = ref(null)

// Upgrade branch dialog state
const upgradeBranchDialog = ref({
  open: false,
  options: null,
  buildingX: 0,
  buildingY: 0,
})

// Tutorial state
const TUTORIAL_DONE_KEY = 'life-support-tutorial-done'
const tutorialStep = ref(-1)

const TUTORIAL_BUILDING_SEQUENCE = [
  null, // step 0: welcome
  'PIPELINE', // step 1
  'SOLAR_PANEL', // step 2
  'HYDROPONIC_FARM', // step 3
  'OXYGEN_GENERATOR', // step 4
  null, // step 5: complete
]

function dismissTutorial() {
  tutorialStep.value = -1
  try {
    localStorage.setItem(TUTORIAL_DONE_KEY, '1')
  } catch (_) {}
}

function onTutorialNext() {
  if (tutorialStep.value === 0) {
    tutorialStep.value = 1
    interaction.selectBuilding('PIPELINE')
  } else if (tutorialStep.value === 5) {
    dismissTutorial()
  }
}

// Auto-advance tutorial when buildings are placed
watch(
  () => colony.state.value?.buildings,
  (buildings) => {
    if (!buildings || tutorialStep.value < 1 || tutorialStep.value > 4) return
    const checks = [
      { step: 1, key: 'pipeline', nextBuilding: 'SOLAR_PANEL' },
      { step: 2, key: 'solar_panel', nextBuilding: 'HYDROPONIC_FARM' },
      { step: 3, key: 'hydroponic_farm', nextBuilding: 'OXYGEN_GENERATOR' },
      { step: 4, key: 'oxygen_generator', nextBuilding: null },
    ]
    for (const check of checks) {
      if (
        tutorialStep.value === check.step &&
        (buildings[check.key] || 0) > 0
      ) {
        tutorialStep.value = check.step + 1
        if (check.nextBuilding) {
          interaction.selectBuilding(check.nextBuilding)
        } else {
          interaction.clearSelection()
        }
        break
      }
    }
  },
  { deep: true },
)

// Milestones
const unlockedMilestoneIds = ref(loadUnlockedMilestones())
const showMilestones = ref(false)
// Single persistent warning (replaces toast stack)
const latestWarning = ref(null)

function setWarning(msg, severity = 'normal') {
  latestWarning.value = { msg, severity }
}

function dismissWarning() {
  latestWarning.value = null
}

watch(
  () => colony.state.value?.tickCount,
  () => {
    const s = colony.state.value
    if (!s || !s.alive) return
    const newlyUnlocked = checkMilestones(
      s,
      colony.resourceDeltas.value,
      unlockedMilestoneIds.value,
    )
    if (newlyUnlocked.length > 0) {
      for (const m of newlyUnlocked) {
        unlockedMilestoneIds.value.push(m.id)
      }
      saveUnlockedMilestones(unlockedMilestoneIds.value)
      for (const m of newlyUnlocked) {
        setWarning(`${m.icon} ${m.name}: ${m.description}`, 'normal')
      }
    }
  },
)

const contextMenu = ref({
  open: false,
  x: 0,
  y: 0,
  building: null,
})

const radialMenu = ref({ open: false, x: 0, y: 0 })

// Pause game while settings menu is open
function onSettingsOpen() {
  colony.pauseGame()
}
function onSettingsClose() {
  colony.resumeGame()
}

const collapseSummary = computed(() => {
  const reason = colony.state.value && colony.state.value.collapseReason
  if (reason && reason.cause) return reason.cause
  const log = colony.eventLog.value || []
  for (let i = log.length - 1; i >= 0; i--) {
    const msg = log[i] && log[i].msg ? log[i].msg : ''
    if (/COLLAPSED/i.test(msg)) return msg
  }
  return 'Life support has failed. The colony is no longer operational.'
})

const collapseHint = computed(() => {
  const reason = colony.state.value && colony.state.value.collapseReason
  if (reason && reason.hint) return reason.hint
  return 'Tip: Keep all critical resources above zero and respond to warnings immediately.'
})

watch(
  () => colony.eventLog.value.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      const latest = colony.eventLog.value[colony.eventLog.value.length - 1]
      if (
        latest &&
        (latest.severity === 'warning' || latest.severity === 'danger')
      ) {
        setWarning(latest.msg, latest.severity)
      }
    }
  },
)

watch(
  () => (colony.state.value ? colony.state.value.alive : null),
  (alive, prevAlive) => {
    if (prevAlive === true && alive === false) {
      showCollapseModal.value = true
    }
  },
)

const hoverTerrainInfo = computed(() => {
  const hover = interaction.hoverTile.value
  if (!hover || !colony.terrainMap.value) return null
  if (!colony.revealedTiles.value.has(hover.gx + ',' + hover.gy)) return null
  const tile = getTerrainAt(
    colony.terrainMap.value,
    hover.gx,
    hover.gy,
    GRID_WIDTH,
  )
  if (!tile) return null
  return tile
})

const hoverBonusText = computed(() => {
  const sel = interaction.selectedBuilding.value
  const hover = interaction.hoverTile.value
  if (!sel || !hover || !colony.terrainMap.value) return []
  const tile = getTerrainAt(
    colony.terrainMap.value,
    hover.gx,
    hover.gy,
    GRID_WIDTH,
  )
  const bInfo = colony.buildingsInfo.value.find((b) => b.id === sel)
  if (!bInfo) return []
  return getTerrainBonusText(bInfo, tile)
})

const hoverBuildingInfo = computed(() => {
  const hover = interaction.hoverTile.value
  if (!hover) return null
  if (!colony.revealedTiles.value.has(hover.gx + ',' + hover.gy)) return null

  const placed =
    (colony.state.value && colony.state.value.placedBuildings) || []
  const building = placed.find((b) =>
    b.cells && b.cells.length > 0
      ? b.cells.some((cell) => cell.x === hover.gx && cell.y === hover.gy)
      : b.x === hover.gx && b.y === hover.gy,
  )
  if (!building) return null

  const info = colony.buildingsInfo.value.find((b) => b.id === building.type)
  if (!info) return null

  const produces = Object.entries(info.produces || {})
  const consumes = Object.entries(info.consumes || {})

  const buildingClassMap = {
    SOLAR_PANEL: 'text-resource-energy',
    HYDROPONIC_FARM: 'text-resource-food',
    WATER_EXTRACTOR: 'text-resource-water',
    MINE: 'text-resource-minerals',
    OXYGEN_GENERATOR: 'text-resource-oxygen',
    RTG: 'text-primary',
    HABITAT: 'text-muted',
    RECYCLING_CENTER: 'text-success',
  }

  const level = building.level || 1
  const canUpgrade =
    building.type !== 'MDV_LANDING_SITE' && level < MAX_UPGRADE_LEVEL
  const nextLevel = level + 1
  const upgradeCost = canUpgrade
    ? { minerals: 12 * nextLevel, energy: 5 * nextLevel }
    : null

  return {
    info,
    produces,
    consumes,
    nameClass: buildingClassMap[building.type] || 'text-primary',
    level,
    canUpgrade,
    upgradeCost,
  }
})

function colonistInitials(name) {
  if (!name) return '??'
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const hoverColonistInfo = computed(() => {
  const hover = interaction.hoverTile.value
  const state = colony.state.value
  if (!hover || !state) return []
  if (!colony.revealedTiles.value.has(hover.gx + ',' + hover.gy)) return []

  const units = (state.colonistUnits || []).filter(
    (u) => u.x === hover.gx && u.y === hover.gy,
  )
  if (units.length === 0) return []

  const byId = new Map((state.colonists || []).map((c) => [c.id, c]))
  return units
    .map((u) => byId.get(u.colonistId))
    .filter(Boolean)
    .map((c) => {
      const role = ROLES[c.role]
      return {
        id: c.id,
        name: c.name,
        role: role?.name || c.role,
        roleColor: role?.color || '#f59e0b',
        initials: colonistInitials(c.name),
        health: Math.round(c.health ?? 0),
        morale: Math.round(c.morale ?? 0),
      }
    })
})

const selectedColonistInfo = computed(() => {
  const id = interaction.selectedColonist.value
  if (!id || !colony.state.value) return null
  const colonist = (colony.state.value.colonists || []).find((c) => c.id === id)
  const unit = (colony.state.value.colonistUnits || []).find(
    (u) => u.colonistId === id,
  )
  if (!colonist || !unit) return null
  return {
    ...colonist,
    x: unit.x,
    y: unit.y,
    targetX: unit.targetX,
    targetY: unit.targetY,
  }
})

const contextMenuItems = computed(() => {
  const building = contextMenu.value.building
  if (!building) return []

  const bInfo = colony.buildingsInfo.value.find((b) => b.id === building.type)
  const isMDV = building.type === 'MDV_LANDING_SITE'

  return [
    {
      label: `Upgrade ${bInfo?.name || building.type}`,
      icon: 'i-heroicons-arrow-trending-up',
      color: 'primary',
      disabled: isMDV || (building.level || 1) >= MAX_UPGRADE_LEVEL,
      onSelect: () => {
        if (isMDV) {
          contextMenu.value.open = false
          return
        }
        // Check if this level requires a branch choice
        const branchOptions = colony.getUpgradeOptions(building.x, building.y)
        if (branchOptions) {
          upgradeBranchDialog.value = {
            open: true,
            options: branchOptions,
            buildingX: building.x,
            buildingY: building.y,
          }
        } else {
          colony.upgradeBuildingAt(building.x, building.y)
        }
        contextMenu.value.open = false
      },
    },
    {
      label: `Demolish ${bInfo?.name || building.type}`,
      icon: 'i-heroicons-trash',
      color: 'error',
      disabled: isMDV,
      onSelect: () => {
        if (!isMDV) {
          colony.demolishAt(building.x, building.y)
          interaction.clearSelection()
        }
        contextMenu.value.open = false
      },
    },
  ]
})

const mapAreaRef = ref(null)
const hoverCursor = ref(null)

function onMapPointerMove(e) {
  const el = mapAreaRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  hoverCursor.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  }
}

function onMapPointerLeave() {
  hoverCursor.value = null
}

const hoverTooltipStyle = computed(() => {
  if (!hoverCursor.value || !mapAreaRef.value) return {}
  const pad = 12
  const tooltipW = 220
  const tooltipH = 120
  const maxX = Math.max(pad, mapAreaRef.value.clientWidth - tooltipW - pad)
  const maxY = Math.max(pad, mapAreaRef.value.clientHeight - tooltipH - pad)
  const x = Math.min(maxX, hoverCursor.value.x + 14)
  const y = Math.min(maxY, hoverCursor.value.y + 14)
  return {
    left: `${Math.max(pad, x)}px`,
    top: `${Math.max(pad, y)}px`,
  }
})

async function onTileClick(gx, gy, canvasX, canvasY) {
  if (!colony.state.value || !colony.state.value.alive) return
  if (!colony.revealedTiles.value.has(gx + ',' + gy)) return

  // 1. Building placement has highest priority
  const sel = interaction.selectedBuilding.value
  if (sel) {
    const info = colony.buildingsInfo.value.find((b) => b.id === sel)
    if (!info || !colony.canAfford(info.cost)) return

    const result = await colony.buildAt(sel, gx, gy)
    if (result && result.success !== false) {
      colony.revealAround(gx, gy, 3)
      interaction.clearSelection()
    }
    return
  }

  // 2. If a colonist is selected, left-click deselects (move is right-click)
  if (interaction.selectedColonist.value) {
    // Click on another colonist → re-select that one
    const unitsAtTile = (colony.state.value.colonistUnits || []).filter(
      (u) => u.x === gx && u.y === gy,
    )
    if (unitsAtTile.length > 0) {
      const clickedId = unitsAtTile[0].colonistId
      if (clickedId === interaction.selectedColonist.value) {
        interaction.clearColonistSelection()
      } else {
        interaction.selectColonist(clickedId)
      }
      return
    }
    // Click elsewhere → deselect
    interaction.clearColonistSelection()
    return
  }

  // 3. No selection — check if tile has colonist(s) → select first
  const unitsAtTile = (colony.state.value.colonistUnits || []).filter(
    (u) => u.x === gx && u.y === gy,
  )
  if (unitsAtTile.length > 0) {
    interaction.selectColonist(unitsAtTile[0].colonistId)
    return
  }

  // 4. Check if there's a building → context menu
  const placed = colony.state.value.placedBuildings || []
  const building = placed.find((b) =>
    b.cells && b.cells.length > 0
      ? b.cells.some((cell) => cell.x === gx && cell.y === gy)
      : b.x === gx && b.y === gy,
  )

  // Convert canvas coords to viewport coords for menu positioning
  const el = mapAreaRef.value
  let screenX = canvasX || 0
  let screenY = canvasY || 0
  if (el) {
    const rect = el.getBoundingClientRect()
    screenX = rect.left + (canvasX || 0)
    screenY = rect.top + (canvasY || 0)
  }

  if (building) {
    contextMenu.value = {
      open: true,
      x: screenX,
      y: screenY,
      building: building,
    }
  } else {
    radialMenu.value = { open: true, x: screenX, y: screenY }
  }
}

async function onTileDelete(gx, gy) {
  if (!colony.state.value || !colony.state.value.alive) return
  if (!colony.revealedTiles.value.has(gx + ',' + gy)) return
  const result = await colony.demolishAt(gx, gy)
  if (result && result.success) {
    interaction.clearSelection()
  }
}

function onContextMenu(gx, gy, screenX, screenY) {
  if (!colony.state.value || !colony.state.value.alive) return

  // If a colonist is selected, right-click issues a move command (even into fog)
  const selectedColId = interaction.selectedColonist.value
  if (selectedColId) {
    colony.moveColonistTo(selectedColId, gx, gy)
    interaction.clearColonistSelection()
    return
  }

  if (!colony.revealedTiles.value.has(gx + ',' + gy)) return

  // Find building at clicked coordinates
  const placed = colony.state.value.placedBuildings || []
  const building = placed.find((b) =>
    b.cells && b.cells.length > 0
      ? b.cells.some((cell) => cell.x === gx && cell.y === gy)
      : b.x === gx && b.y === gy,
  )

  if (building) {
    // Open upgrade/demolish context menu for existing buildings
    contextMenu.value = {
      open: true,
      x: screenX,
      y: screenY,
      building: building,
    }
  } else {
    // Open radial build menu for empty tiles
    radialMenu.value = { open: true, x: screenX, y: screenY }
  }
}

function onRadialSelect(buildingId) {
  interaction.selectBuilding(buildingId)
  radialMenu.value.open = false
}

function onSelectBuilding(id) {
  if (interaction.selectedBuilding.value === id) interaction.clearSelection()
  else interaction.selectBuilding(id)
}

function toggleBuildSheet() {
  showBuildSheet.value = !showBuildSheet.value
}

function toggleResourceGraph() {
  showResourceGraph.value = !showResourceGraph.value
}

function openCrewDetails() {
  if (colonistsPanelRef.value && colonistsPanelRef.value.openDetail) {
    colonistsPanelRef.value.openDetail()
  }
}

function onUpgradeBranchChoose(branchId) {
  const { buildingX, buildingY } = upgradeBranchDialog.value
  colony.upgradeBuildingAt(buildingX, buildingY, branchId)
  upgradeBranchDialog.value = {
    open: false,
    options: null,
    buildingX: 0,
    buildingY: 0,
  }
}

function onUpgradeBranchClose() {
  upgradeBranchDialog.value = {
    open: false,
    options: null,
    buildingX: 0,
    buildingY: 0,
  }
}

function onLaunchMission({ typeId, colonistIds }) {
  colony.launchMission(typeId, colonistIds, 0, 0)
}

function resetFromCollapseModal() {
  showCollapseModal.value = false
  colony.resetColony()
}

const COLORBLIND_STORAGE_KEY = 'life-support-colorblind'
const colorblindMode = ref(false)

try {
  colorblindMode.value = localStorage.getItem(COLORBLIND_STORAGE_KEY) === '1'
} catch (_) {}

// Sidebar auto-retract state
const SIDEBAR_PIN_KEY = 'life-support-sidebar-pinned'
const sidebarPinned = ref(true)
const sidebarHovered = ref(false)

try {
  const stored = localStorage.getItem(SIDEBAR_PIN_KEY)
  if (stored !== null) sidebarPinned.value = stored === '1'
} catch (_) {}

const sidebarVisible = computed(
  () => sidebarPinned.value || sidebarHovered.value,
)

function toggleSidebarPin() {
  sidebarPinned.value = !sidebarPinned.value
  try {
    localStorage.setItem(SIDEBAR_PIN_KEY, sidebarPinned.value ? '1' : '0')
  } catch (_) {}
}

watch(
  colorblindMode,
  (enabled) => {
    document.documentElement.classList.toggle('colorblind', enabled)
    try {
      localStorage.setItem(COLORBLIND_STORAGE_KEY, enabled ? '1' : '0')
    } catch (_) {}
  },
  { immediate: true },
)

const devModeModel = computed({
  get: () => colony.devModeEnabled.value,
  set: (enabled) => {
    colony.setDevModeEnabled(enabled)
    colony.resetColony()
  },
})

const SPEED_KEYS = { 1: 3000, 2: 2000, 3: 1000, 4: 500 }

function handleKeyDown(e) {
  // Ignore when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

  if (e.key === 'Escape') {
    if (radialMenu.value.open) {
      radialMenu.value.open = false
    } else {
      interaction.clearSelection()
    }
  } else if (e.key === ' ' || e.key === 'Space') {
    e.preventDefault()
    colony.manualTick()
  } else if (SPEED_KEYS[e.key]) {
    colony.setSpeed(SPEED_KEYS[e.key])
  }
}

onMounted(() => {
  colony.init()
  window.addEventListener('keydown', handleKeyDown)
  // Start tutorial for new games that haven't completed it
  if (colony.isNewGame.value) {
    try {
      if (!localStorage.getItem(TUTORIAL_DONE_KEY)) {
        tutorialStep.value = 0
      }
    } catch (_) {}
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>
<template>
  <div class="app-layout">
    <HeaderBar
      :state="colony.state.value"
      :on-reset="colony.resetColony"
      :tick-speed="colony.tickSpeed.value"
      :on-set-speed="colony.setSpeed"
      :on-manual-tick="colony.manualTick"
      :dev-mode-allowed="colony.devModeAllowed"
      v-model:dev-mode-enabled="devModeModel"
      :colorblind-mode="colorblindMode"
      @update:colorblind-mode="colorblindMode = $event"
      @settings-open="onSettingsOpen"
      @settings-close="onSettingsClose"
    />
    <div class="relative min-h-0 flex-1">
      <!-- Desktop left sidebar: resources + population + analytics -->
      <div
        class="scrollbar-dark absolute top-0 bottom-0 left-0 z-10 flex w-56 flex-col gap-1 overflow-y-auto p-2 max-md:hidden"
      >
        <div
          class="bg-default border-default rounded-md border p-1.5 shadow-xs"
        >
          <div class="mb-1 flex items-center justify-between">
            <h4 class="uppercase">Resources</h4>
            <UButton
              color="primary"
              size="xs"
              class="tracking-wide uppercase"
              @click="toggleResourceGraph"
              label="View"
            />
          </div>
          <ResourcePanel
            :state="colony.state.value"
            :deltas="colony.resourceDeltas.value"
            :history="colony.resourceHistory.value"
          />
        </div>
        <div
          class="bg-default border-default rounded-md border p-1.5 shadow-xs"
        >
          <div class="mb-1 flex items-center justify-between">
            <h4 class="uppercase">Colonists</h4>
            <UButton
              color="primary"
              size="xs"
              class="tracking-wide uppercase"
              label="View"
              @click="openCrewDetails"
            />
          </div>
          <PopulationBar
            ref="colonistsPanelRef"
            :state="colony.state.value"
            :show-action="false"
            embedded
          />
        </div>
        <div
          class="bg-default border-default rounded-md border p-1.5 shadow-xs"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <h4 class="uppercase">Waste</h4>
            <div class="flex items-center gap-2 whitespace-nowrap tabular-nums">
              <span class="text-highlighted text-sm font-bold">
                {{ wasteInfo.waste }}/{{ wasteInfo.capacity }}
              </span>
              <span
                :class="[
                  'text-xs font-bold',
                  wasteDelta > 0
                    ? 'text-error'
                    : wasteDelta < 0
                      ? 'text-success'
                      : 'text-muted',
                ]"
              >
                {{ formatSignedOneDecimal(wasteDelta) }}/t
              </span>
            </div>
          </div>
          <div class="px-0.5">
            <UProgress
              :model-value="wasteInfo.pct"
              :color="
                wasteInfo.pct > 80
                  ? 'error'
                  : wasteInfo.pct > 50
                    ? 'warning'
                    : 'success'
              "
              size="sm"
            />
            <p
              v-if="wasteOverflowActive"
              class="text-error mt-1 text-xs leading-tight font-medium"
            >
              Overflow active: -{{ wasteOverflowPenaltyPct }}% production
            </p>
          </div>
        </div>
        <!-- Defense Rating -->
        <div
          v-if="
            colony.state.value && colony.state.value.defenseRating !== undefined
          "
          class="bg-default border-default rounded-md border p-1.5 shadow-xs"
        >
          <div class="mb-1 flex items-center justify-between gap-2">
            <h4 class="uppercase">Defense</h4>
            <span class="text-highlighted text-sm font-bold tabular-nums">
              {{ colony.state.value.defenseRating || 0 }}
            </span>
          </div>
          <div
            v-if="
              colony.state.value.alienEvents &&
              colony.state.value.alienEvents.length > 0
            "
            class="text-error text-xs font-medium"
          >
            {{ colony.state.value.alienEvents.length }} active threat{{
              colony.state.value.alienEvents.length > 1 ? 's' : ''
            }}
          </div>
          <div v-else class="text-muted text-xs">No active threats</div>
        </div>
        <!-- Missions -->
        <div class="bg-default border-default rounded-md border shadow-xs">
          <div class="flex items-center justify-between p-1.5">
            <h4 class="uppercase">Missions</h4>
            <UBadge
              v-if="colony.state.value?.missions?.length"
              color="primary"
              variant="subtle"
              size="xs"
              :label="`${colony.state.value.missions.length} active`"
            />
          </div>
          <MissionPanel
            :available-missions="colony.availableMissions.value"
            :active-missions="colony.state.value?.missions || []"
            :tick-count="colony.state.value?.tickCount || 0"
            @launch="onLaunchMission"
          />
        </div>
        <UButton
          color="neutral"
          variant="soft"
          size="xs"
          block
          :label="`Milestones (${unlockedMilestoneIds.length}/${MILESTONES.length})`"
          @click="showMilestones = true"
        />
      </div>
      <!-- Mobile compact resource bar -->
      <div
        class="glass-panel border-default/70 absolute top-0 right-0 left-0 z-10 hidden flex-col border-b px-1 py-1 max-md:flex"
      >
        <ResourcePanel
          :state="colony.state.value"
          :deltas="colony.resourceDeltas.value"
          :history="colony.resourceHistory.value"
          compact
        />
        <div class="mt-0.5 flex items-center justify-between gap-1 px-0.5">
          <PopulationBar :state="colony.state.value" compact />
          <div class="flex items-center gap-1 whitespace-nowrap">
            <span class="text-muted text-[9px]">WST</span>
            <span class="text-highlighted text-xs tabular-nums">{{
              wasteInfo.waste
            }}</span>
            <span v-if="wasteOverflowActive" class="text-error text-[9px]"
              >-{{ wasteOverflowPenaltyPct }}%</span
            >
          </div>
        </div>
      </div>
      <div
        ref="mapAreaRef"
        class="map-fullscreen"
        @pointermove="onMapPointerMove"
        @pointerleave="onMapPointerLeave"
      >
        <GameMap
          :camera="camera"
          :interaction="interaction"
          :state="colony.state.value"
          :grid-width="colony.gridWidth.value"
          :grid-height="colony.gridHeight.value"
          :on-tile-click="onTileClick"
          :on-context-menu="onContextMenu"
          :on-long-press="onContextMenu"
          :revealed-tiles="colony.revealedTiles.value"
          :terrain-map="colony.terrainMap.value"
          :active-events="colony.activeEvents.value"
          :buildable-cells="colony.buildableCells.value"
          :selected-colonist="interaction.selectedColonist.value"
        />
        <!-- Build placement status bar -->
        <UAlert
          v-if="interaction.selectedBuilding.value"
          class="bg-muted absolute top-3 left-1/2 z-20 w-fit -translate-x-1/2 shadow-lg"
          color="neutral"
          variant="subtle"
          :description="
            hoverBonusText.length > 0 ? hoverBonusText.join(' | ') : undefined
          "
        >
          <template #title>
            Click on the map to place
            {{ interaction.selectedBuilding.value.replace(/_/g, ' ') }}
          </template>
          <template #actions>
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              @click="interaction.clearSelection()"
              label="Cancel"
            />
          </template>
        </UAlert>
        <!-- Colonist selection status bar -->
        <UAlert
          v-if="selectedColonistInfo"
          class="bg-muted absolute top-3 left-1/2 z-20 w-fit -translate-x-1/2 shadow-lg"
          color="neutral"
          variant="subtle"
        >
          <template #title>
            {{ selectedColonistInfo.name }} selected — right-click to move
          </template>
          <template #actions>
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              @click="interaction.clearColonistSelection()"
              label="Cancel"
            />
          </template>
        </UAlert>
        <!-- Terrain tooltip near cursor (desktop) -->
        <div
          v-if="
            (hoverTerrainInfo ||
              hoverBuildingInfo ||
              hoverColonistInfo.length) &&
            !interaction.selectedBuilding.value
          "
          :style="hoverTooltipStyle"
          class="bg-muted/90 border-default/70 text-default pointer-events-none absolute z-20 max-w-56 rounded-md border px-2 py-1.5 shadow-sm backdrop-blur-sm max-md:hidden"
        >
          <div
            v-if="hoverTerrainInfo"
            class="text-highlighted text-xs leading-tight font-semibold"
          >
            {{ hoverTerrainInfo.terrain.name }}
          </div>
          <div
            v-if="
              hoverTerrainInfo &&
              (hoverTerrainInfo.deposit || hoverTerrainInfo.hazard)
            "
            class="mt-0.5 text-xs leading-tight"
          >
            <div v-if="hoverTerrainInfo.deposit" class="text-warning">
              {{ hoverTerrainInfo.deposit.name }}
              <span class="text-muted">
                — +{{
                  Math.round((hoverTerrainInfo.deposit.multiplier - 1) * 100)
                }}% {{ hoverTerrainInfo.deposit.resource }} production</span
              >
            </div>
            <div v-if="hoverTerrainInfo.hazard" class="text-error">
              {{ hoverTerrainInfo.hazard.name }}
              <span class="text-muted">
                —
                <template
                  v-if="hoverTerrainInfo.hazard.effect === 'cost_increase'"
                  >+{{
                    Math.round(
                      (hoverTerrainInfo.hazard.costMultiplier - 1) * 100,
                    )
                  }}% mineral cost</template
                >
                <template
                  v-else-if="
                    hoverTerrainInfo.hazard.effect === 'production_penalty'
                  "
                  >-{{
                    Math.round(
                      (1 - hoverTerrainInfo.hazard.productionMultiplier) * 100,
                    )
                  }}% production</template
                >
                <template
                  v-else-if="hoverTerrainInfo.hazard.effect === 'block_growth'"
                  >blocks pop growth</template
                >
              </span>
            </div>
          </div>
          <div
            v-if="hoverBuildingInfo"
            class="border-default/60 mt-1 border-t pt-1 text-xs leading-tight"
          >
            <div class="flex items-center gap-1.5">
              <span :class="['font-semibold', hoverBuildingInfo.nameClass]">
                {{ hoverBuildingInfo.info.name }}
              </span>
              <span
                v-if="hoverBuildingInfo.level > 1"
                class="text-primary text-[10px] font-bold"
                >L{{ hoverBuildingInfo.level }}</span
              >
            </div>
            <div
              v-if="
                hoverBuildingInfo.produces.length ||
                hoverBuildingInfo.consumes.length
              "
              class="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0.5"
            >
              <span
                v-for="[res, amount] in hoverBuildingInfo.produces"
                :key="`hover-prod-${res}`"
                class="text-success"
              >
                +{{ amount }} {{ res }}/t
              </span>
              <span
                v-for="[res, amount] in hoverBuildingInfo.consumes"
                :key="`hover-cons-${res}`"
                class="text-error"
              >
                -{{ amount }} {{ res }}/t
              </span>
            </div>
            <div v-if="hoverBuildingInfo.canUpgrade" class="text-muted mt-0.5">
              Upgrade → L{{ hoverBuildingInfo.level + 1 }}:
              {{ hoverBuildingInfo.upgradeCost.minerals }}m +
              {{ hoverBuildingInfo.upgradeCost.energy }}e
              <span class="text-primary">(right-click)</span>
            </div>
          </div>
          <div
            v-if="hoverColonistInfo.length"
            class="border-default/60 mt-1 border-t pt-1 text-xs leading-tight"
          >
            <div class="text-highlighted mb-0.5 font-semibold">Colonists</div>
            <div
              v-for="colonist in hoverColonistInfo"
              :key="`hover-colonist-${colonist.id}`"
              class="mt-0.5 flex items-center gap-1.5"
            >
              <span
                class="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                :style="{ backgroundColor: colonist.roleColor }"
              >
                {{ colonist.initials }}
              </span>
              <span class="text-default">
                {{ colonist.name }}
                <span class="text-muted">({{ colonist.role }})</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <!-- Notification Stack -->
      <NotificationStack
        :notification="latestWarning"
        @dismiss="dismissWarning"
        @open-log="showEventLog = true"
      />
      <!-- Hover trigger strip (visible only when sidebar is hidden) -->
      <div
        v-if="!sidebarVisible"
        class="absolute top-0 right-0 bottom-0 z-10 w-2 max-md:hidden"
        @mouseenter="sidebarHovered = true"
      />

      <!-- Desktop right sidebar: build panel + event log -->
      <div
        class="glass-panel border-default/70 absolute top-0 right-0 bottom-0 z-10 flex w-sm flex-col overflow-hidden border-l transition-transform duration-300 ease-out max-md:hidden"
        :class="sidebarVisible ? 'translate-x-0' : 'translate-x-full'"
        @mouseenter="sidebarHovered = true"
        @mouseleave="sidebarHovered = false"
      >
        <div class="flex items-center justify-end px-2 pt-1">
          <UButton
            :icon="
              sidebarPinned
                ? 'i-heroicons-lock-closed'
                : 'i-heroicons-lock-open'
            "
            :color="sidebarPinned ? 'primary' : 'neutral'"
            variant="ghost"
            size="xs"
            @click="toggleSidebarPin"
          />
        </div>
        <div class="scrollbar-dark min-h-0 flex-1 overflow-y-auto">
          <BuildPanel
            :buildings="colony.buildingsInfo.value"
            :state="colony.state.value"
            :deltas="colony.resourceDeltas.value"
            :selected-building="interaction.selectedBuilding.value"
            :can-afford="colony.canAfford"
            @select="onSelectBuilding"
          />
        </div>
        <div class="border-default/70 h-36 border-t">
          <EventLog :log="colony.eventLog.value" minimal />
        </div>
      </div>
      <ResourceGraph
        :history="colony.resourceHistory.value"
        :expanded="showResourceGraph"
        @toggle="toggleResourceGraph"
      />
    </div>
    <!-- Mobile bottom controls -->
    <div
      class="fixed right-4 z-20 hidden gap-2 max-md:flex"
      style="bottom: calc(1rem + env(safe-area-inset-bottom, 0px))"
    >
      <UButton
        color="neutral"
        variant="soft"
        size="lg"
        class="font-bold shadow-md"
        label="Missions"
        @click="showMissionPanel = true"
      />
      <UButton
        color="neutral"
        variant="soft"
        size="lg"
        class="font-bold shadow-md"
        label="Stats"
        @click="toggleResourceGraph"
      />
      <UButton
        color="primary"
        variant="soft"
        size="lg"
        class="font-bold shadow-md"
        :label="showBuildSheet ? 'Close' : 'Build'"
        @click="toggleBuildSheet"
      />
    </div>
    <UDrawer
      v-model:open="showBuildSheet"
      direction="bottom"
      title="Build"
      description="Select structures and review latest events"
    >
      <template #body>
        <div class="scrollbar-dark max-h-[60vh] overflow-y-auto">
          <BuildPanel
            :buildings="colony.buildingsInfo.value"
            :state="colony.state.value"
            :deltas="colony.resourceDeltas.value"
            :selected-building="interaction.selectedBuilding.value"
            :can-afford="colony.canAfford"
            @select="
              (id) => {
                onSelectBuilding(id)
                showBuildSheet = false
              }
            "
          />
          <EventLog :log="colony.eventLog.value" />
        </div>
      </template>
    </UDrawer>
    <UModal
      v-model:open="showCollapseModal"
      title="Colony Collapsed"
      :dismissible="false"
    >
      <template #body>
        <div class="flex flex-col items-center gap-3 text-center">
          <UIcon
            name="i-mdi-skull-outline"
            class="text-error h-20 w-20"
            aria-hidden="true"
          />
          <p class="text-muted text-sm">{{ collapseSummary }}</p>
          <p class="text-primary/90 text-xs font-medium">
            Hint: {{ collapseHint }}
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            color="neutral"
            variant="soft"
            label="Close"
            @click="showCollapseModal = false"
          />
          <UButton
            color="error"
            variant="solid"
            label="Reset Colony"
            @click="resetFromCollapseModal"
          />
        </div>
      </template>
    </UModal>

    <!-- Milestones Modal -->
    <UModal v-model:open="showMilestones" title="Milestones">
      <template #body>
        <div class="flex flex-col gap-2">
          <div
            v-for="m in MILESTONES"
            :key="m.id"
            :class="[
              'flex items-center gap-3 rounded-md border p-2',
              unlockedMilestoneIds.includes(m.id)
                ? 'border-success/50 bg-success/10'
                : 'border-default/50 opacity-50',
            ]"
          >
            <span class="text-xl">{{ m.icon }}</span>
            <div class="min-w-0 flex-1">
              <div class="text-highlighted text-sm font-bold">{{ m.name }}</div>
              <div class="text-muted text-xs">{{ m.description }}</div>
            </div>
            <UBadge
              v-if="unlockedMilestoneIds.includes(m.id)"
              color="success"
              variant="subtle"
              size="xs"
              label="Unlocked"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Mobile Mission Drawer -->
    <UDrawer
      v-model:open="showMissionPanel"
      direction="bottom"
      title="Missions"
      description="Send colonists on expeditions"
    >
      <template #body>
        <div class="scrollbar-dark max-h-[60vh] overflow-y-auto">
          <MissionPanel
            :available-missions="colony.availableMissions.value"
            :active-missions="colony.state.value?.missions || []"
            :tick-count="colony.state.value?.tickCount || 0"
            @launch="
              (data) => {
                onLaunchMission(data)
                showMissionPanel = false
              }
            "
          />
        </div>
      </template>
    </UDrawer>

    <!-- Upgrade Branch Dialog -->
    <UpgradeBranchDialog
      :open="upgradeBranchDialog.open"
      :options="upgradeBranchDialog.options"
      @close="onUpgradeBranchClose"
      @choose="onUpgradeBranchChoose"
    />

    <!-- Event Log Drawer (opened from notification bell) -->
    <UDrawer
      v-model:open="showEventLog"
      direction="bottom"
      title="Event Log"
      description="Colony events and alerts"
    >
      <template #body>
        <div class="scrollbar-dark max-h-[60vh] overflow-y-auto">
          <EventLog :log="colony.eventLog.value" />
        </div>
      </template>
    </UDrawer>

    <!-- Tutorial Overlay -->
    <TutorialOverlay
      v-if="tutorialStep >= 0"
      :step="tutorialStep"
      @skip="dismissTutorial"
      @next="onTutorialNext"
    />

    <!-- Radial Build Menu -->
    <RadialBuildMenu
      :open="radialMenu.open"
      :x="radialMenu.x"
      :y="radialMenu.y"
      :buildings="colony.buildingsInfo.value"
      :state="colony.state.value"
      :deltas="colony.resourceDeltas.value"
      :can-afford="colony.canAfford"
      @update:open="radialMenu.open = $event"
      @select="onRadialSelect"
    />

    <!-- Building Context Menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu.open"
        @click="contextMenu.open = false"
        @contextmenu.prevent
        style="position: fixed; inset: 0; z-index: 9998"
      >
        <UCard
          :style="{
            position: 'fixed',
            left: contextMenu.x + 'px',
            top: contextMenu.y + 'px',
            zIndex: 9999,
            minWidth: '200px',
          }"
          @click.stop
          :ui="{ body: 'p-1' }"
        >
          <div class="flex flex-col gap-0.5">
            <UButton
              v-for="(item, idx) in contextMenuItems"
              :key="idx"
              :label="item.label"
              :icon="item.icon"
              :color="item.color"
              :disabled="item.disabled"
              variant="ghost"
              block
              class="justify-start"
              @click="item.onSelect"
            />
          </div>
        </UCard>
      </div>
    </Teleport>
  </div>
</template>
