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

    <div class="absolute top-12 left-0 right-[280px] z-10 flex gap-2 px-3 py-2 bg-white/78 backdrop-blur-md overflow-x-auto items-center border-b border-stone-300/50 max-md:right-0 max-md:px-2 max-md:gap-1">
      <ResourcePanel :state="colony.state.value" :deltas="colony.resourceDeltas.value" :history="colony.resourceHistory.value" />
      <PopulationBar :state="colony.state.value" />
      <UButton variant="soft" color="neutral" size="xs" class="whitespace-nowrap uppercase tracking-[1px] text-[0.65rem] shrink-0 max-md:hidden" @click="toggleResourceGraph">Analytics</UButton>
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
      <div v-if="interaction.selectedBuilding.value" class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/92 backdrop-blur-lg border border-stone-300 rounded-md px-3.5 py-1.5 text-xs text-stone-700 whitespace-nowrap z-5 uppercase tracking-[1px] shadow-md">
        Click on the map to place {{ interaction.selectedBuilding.value.replace(/_/g, ' ') }}
        <UButton color="error" variant="ghost" size="xs" class="ml-2" @click="interaction.clearSelection()">Cancel</UButton>
      </div>
    </div>

    <div class="absolute top-0 right-0 bottom-0 w-[280px] z-10 flex flex-col bg-white/88 backdrop-blur-md border-l border-stone-300/50 overflow-y-auto max-md:hidden">
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

    <!-- Mobile bottom controls -->
    <div class="hidden max-md:block">
      <UButton
        color="primary"
        variant="soft"
        size="lg"
        class="fixed bottom-4 right-4 z-20 font-bold shadow-md"
        @click="toggleBuildSheet"
      >
        {{ showBuildSheet ? 'Close' : 'Build' }}
      </UButton>
    </div>

    <UDrawer v-model:open="showBuildSheet" direction="bottom">
      <div class="max-h-[60vh] overflow-y-auto">
        <BuildPanel
          :buildings="colony.buildingsInfo.value"
          :state="colony.state.value"
          :selected-building="interaction.selectedBuilding.value"
          :can-afford="colony.canAfford"
          @select="(id) => { onSelectBuilding(id); showBuildSheet = false }"
        />
        <EventLog :log="colony.eventLog.value" />
      </div>
    </UDrawer>
  </div>
</template>
