<script setup>
const colony = useColony()
const camera = useCamera(colony.gridWidth, colony.gridHeight)
const interaction = useGridInteraction(camera, colony.gridWidth, colony.gridHeight)
const showBuildSheet = ref(false)
const showResourceGraph = ref(false)

async function onTileClick(gx, gy) {
  const sel = interaction.selectedBuilding.value
  if (!sel) return
  if (!colony.state.value || !colony.state.value.alive) return

  // Only allow building on revealed tiles
  if (!colony.revealedTiles.value.has(gx + ',' + gy)) return

  // Find building info
  const info = colony.buildingsInfo.value.find(b => b.id === sel)
  if (!info || !colony.canAfford(info.cost)) return

  const result = await colony.buildAt(sel, gx, gy)
  if (result && result.success !== false) {
    colony.revealAround(gx, gy, 3)
  }
}

function onSelectBuilding(id) {
  if (interaction.selectedBuilding.value === id) {
    interaction.clearSelection()
  } else {
    interaction.selectBuilding(id)
  }
}

function toggleBuildSheet() {
  showBuildSheet.value = !showBuildSheet.value
}

function toggleResourceGraph() {
  showResourceGraph.value = !showResourceGraph.value
}

onMounted(() => {
  colony.init()
})
</script>

<template>
  <div class="app-layout">
    <HeaderBar :state="colony.state.value" :on-reset="colony.resetColony"
      :tick-speed="colony.tickSpeed.value" :on-set-speed="colony.setSpeed" :on-manual-tick="colony.manualTick" />

    <div class="resource-strip-wrapper">
      <ResourcePanel :state="colony.state.value" :deltas="colony.resourceDeltas.value" :history="colony.resourceHistory.value" />
      <PopulationBar :state="colony.state.value" />
      <button class="btn graph-toggle-btn" @click="toggleResourceGraph">Analytics</button>
    </div>

    <div class="map-fullscreen">
      <GameMap
        :camera="camera"
        :interaction="interaction"
        :state="colony.state.value"
        :grid-width="colony.gridWidth.value"
        :grid-height="colony.gridHeight.value"
        :on-tile-click="onTileClick"
        :revealed-tiles="colony.revealedTiles.value"
      />
      <div v-if="interaction.selectedBuilding.value" class="build-hint">
        Click on the map to place {{ interaction.selectedBuilding.value.replace(/_/g, ' ') }}
        <button class="btn btn-cancel" @click="interaction.clearSelection()">Cancel</button>
      </div>
    </div>

    <div class="sidebar desktop-sidebar">
      <BuildPanel
        :buildings="colony.buildingsInfo.value"
        :state="colony.state.value"
        :selected-building="interaction.selectedBuilding.value"
        :can-afford="colony.canAfford"
        @select="onSelectBuilding"
      />
      <EventLog :log="colony.eventLog.value" />
    </div>

    <ResourceGraph
      :history="colony.resourceHistory.value"
      :expanded="showResourceGraph"
      @toggle="toggleResourceGraph"
    />

    <!-- Mobile bottom sheet -->
    <div class="mobile-controls">
      <button class="btn mobile-build-btn" @click="toggleBuildSheet">
        {{ showBuildSheet ? 'Close' : 'Build' }}
      </button>
    </div>
    <div :class="['mobile-sheet', { open: showBuildSheet }]">
      <div class="mobile-sheet-tabs">
        <button :class="['tab-btn', { active: true }]">Buildings</button>
      </div>
      <BuildPanel
        :buildings="colony.buildingsInfo.value"
        :state="colony.state.value"
        :selected-building="interaction.selectedBuilding.value"
        :can-afford="colony.canAfford"
        @select="(id) => { onSelectBuilding(id); showBuildSheet = false }"
      />
      <EventLog :log="colony.eventLog.value" />
    </div>
  </div>
</template>

<style scoped>
.resource-strip-wrapper {
  position: absolute;
  top: 48px;
  left: 0;
  right: 280px;
  z-index: 10;
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.78);
  backdrop-filter: blur(12px);
  overflow-x: auto;
  align-items: center;
  border-bottom: 1px solid rgba(214,207,196,0.5);
}

.graph-toggle-btn {
  white-space: nowrap;
  font-size: .65rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 4px 10px;
  flex-shrink: 0;
}

.build-hint {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 14px;
  font-size: .75rem;
  color: var(--text);
  white-space: nowrap;
  z-index: 5;
  text-transform: uppercase;
  letter-spacing: 1px;
  box-shadow: 0 2px 8px rgba(0,0,0,.1);
}

.desktop-sidebar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 280px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  background: rgba(255,255,255,0.88);
  backdrop-filter: blur(12px);
  border-left: 1px solid rgba(214,207,196,0.5);
  overflow-y: auto;
}

.mobile-controls { display: none }
.mobile-build-btn {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 20;
  padding: 10px 20px;
  font-size: .85rem;
  font-weight: bold;
  background: rgba(37,99,235,.15);
  border: 1px solid rgba(37,99,235,.3);
  color: var(--water);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,.1);
}
.mobile-sheet {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 15;
  background: rgba(255,255,255,.95);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--border);
  border-radius: 12px 12px 0 0;
  max-height: 60vh;
  overflow-y: auto;
  transform: translateY(100%);
  transition: transform .3s ease;
}
.mobile-sheet.open { transform: translateY(0) }
.mobile-sheet-tabs {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}
.tab-btn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-family: inherit;
  font-size: .7rem;
}
.tab-btn.active {
  background: var(--surface);
  color: var(--text-bright);
  border-color: var(--water);
}

@media (max-width: 768px) {
  .resource-strip-wrapper { right: 0; padding: 6px 8px; gap: 4px }
  .desktop-sidebar { display: none }
  .mobile-controls { display: block }
  .mobile-sheet { display: block }
  .graph-toggle-btn { display: none }
}
</style>
