<script setup>
import { getTerrainAt, getTerrainBonusText } from '~/utils/terrain'
import { GRID_WIDTH } from '~/utils/gameEngine'
import { formatSignedFixed, roundTo } from '~/utils/formatting'

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

function formatSignedOneDecimal(value) {
  return formatSignedFixed(value, 1)
}

const showBuildSheet = ref(false)
const showResourceGraph = ref(false)
const colonistsPanelRef = ref(null)

const eventToast = ref(null)
let toastTimer = null

watch(
  () => colony.eventLog.value.length,
  (newLen, oldLen) => {
    if (newLen > oldLen) {
      const latest = colony.eventLog.value[colony.eventLog.value.length - 1]
      if (
        latest &&
        (latest.severity === 'warning' || latest.severity === 'danger')
      ) {
        eventToast.value = latest
        if (toastTimer) clearTimeout(toastTimer)
        toastTimer = setTimeout(() => {
          eventToast.value = null
        }, 4000)
      }
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
  const building = placed.find((b) => b.x === hover.gx && b.y === hover.gy)
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
    REPAIR_STATION: 'text-error',
  }

  return {
    info,
    produces,
    consumes,
    nameClass: buildingClassMap[building.type] || 'text-primary',
  }
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

async function onTileClick(gx, gy) {
  const sel = interaction.selectedBuilding.value
  if (!sel) return
  if (!colony.state.value || !colony.state.value.alive) return
  if (!colony.revealedTiles.value.has(gx + ',' + gy)) return

  const info = colony.buildingsInfo.value.find((b) => b.id === sel)
  if (!info || !colony.canAfford(info.cost)) return

  const result = await colony.buildAt(sel, gx, gy)
  if (result && result.success !== false) {
    colony.revealAround(gx, gy, 3)
  }
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

onMounted(() => {
  colony.init()
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
            <h3 class="uppercase">Resources</h3>
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
            <h3 class="uppercase">Colonists</h3>
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
          <h3 class="uppercase">Waste</h3>
          <div class="px-0.5">
            <div class="mb-1 flex items-center justify-between gap-1.5">
              <UBadge
                color="warning"
                variant="solid"
                size="sm"
                class="font-bold tabular-nums"
                :label="`${wasteInfo.waste}/${wasteInfo.capacity}`"
              />
              <UBadge
                :color="
                  wasteDelta > 0
                    ? 'error'
                    : wasteDelta < 0
                      ? 'success'
                      : 'neutral'
                "
                variant="subtle"
                size="sm"
                class="shrink-0 font-bold whitespace-nowrap tabular-nums"
                :label="`${formatSignedOneDecimal(wasteDelta)}/t`"
              />
            </div>
            <UProgress
              :model-value="wasteInfo.pct"
              :color="
                wasteInfo.pct > 80
                  ? 'error'
                  : wasteInfo.pct > 50
                    ? 'warning'
                    : 'success'
              "
              size="xs"
            />
          </div>
        </div>
      </div>
      <!-- Mobile compact resource bar -->
      <div
        class="glass-panel border-default/70 absolute top-0 right-0 left-0 z-10 hidden items-center gap-2 overflow-x-auto border-b px-2 py-1.5 max-md:flex"
      >
        <div class="flex shrink-0 items-center gap-2">
          <ResourcePanel
            :state="colony.state.value"
            :deltas="colony.resourceDeltas.value"
            :history="colony.resourceHistory.value"
            compact
          />
        </div>
        <div class="border-default/60 h-5 border-l"></div>
        <PopulationBar :state="colony.state.value" compact />
        <div class="border-default/60 h-5 border-l"></div>
        <div class="flex items-center gap-1 whitespace-nowrap">
          <UBadge color="warning" variant="subtle" size="xs" label="WST" />
          <span class="text-highlighted tabular-nums">{{
            wasteInfo.waste
          }}</span>
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
          :revealed-tiles="colony.revealedTiles.value"
          :terrain-map="colony.terrainMap.value"
          :active-events="colony.activeEvents.value"
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
        <!-- Terrain tooltip near cursor (desktop) -->
        <div
          v-if="
            (hoverTerrainInfo || hoverBuildingInfo) &&
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
            <span v-if="hoverTerrainInfo.deposit" class="text-warning">{{
              hoverTerrainInfo.deposit.name
            }}</span>
            <span v-if="hoverTerrainInfo.hazard" class="text-error ml-1.5">{{
              hoverTerrainInfo.hazard.name
            }}</span>
          </div>
          <div
            v-if="hoverBuildingInfo"
            class="border-default/60 mt-1 border-t pt-1 text-xs leading-tight"
          >
            <div :class="['font-semibold', hoverBuildingInfo.nameClass]">
              {{ hoverBuildingInfo.info.name }}
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
          </div>
        </div>
      </div>
      <!-- Event toast notification -->
      <Transition name="toast">
        <UAlert
          v-if="eventToast"
          class="fixed top-14 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 shadow-lg"
          :color="eventToast.severity === 'danger' ? 'error' : 'warning'"
          variant="solid"
          :title="eventToast.msg"
        >
        </UAlert>
      </Transition>
      <!-- Desktop right sidebar: build panel + event log -->
      <div
        class="glass-panel border-default/70 absolute top-0 right-0 bottom-0 z-10 flex w-sm flex-col overflow-hidden border-l max-md:hidden"
      >
        <div class="scrollbar-dark min-h-0 flex-1 overflow-y-auto">
          <BuildPanel
            :buildings="colony.buildingsInfo.value"
            :state="colony.state.value"
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
    <div class="fixed right-4 bottom-4 z-20 hidden gap-2 max-md:flex">
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
  </div>
</template>
<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}
.toast-leave-active {
  transition: all 0.3s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, -10px);
}
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}
</style>
