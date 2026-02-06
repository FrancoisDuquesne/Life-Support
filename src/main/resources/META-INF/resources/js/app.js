// app.js — Vue.createApp, colony state, mount
(function() {
  const { createApp, ref, onMounted } = Vue;
  const {
    useColony,
    useCamera,
    useGridInteraction,
    HeaderBar,
    ResourcePanel,
    ResourceGraph,
    PopulationBar,
    GameMap,
    BuildPanel,
    EventLog
  } = window.SpaceColony;

  const App = {
    components: {
      HeaderBar,
      ResourcePanel,
      ResourceGraph,
      PopulationBar,
      GameMap,
      BuildPanel,
      EventLog
    },
    setup() {
      const colony = useColony();
      const camera = useCamera(colony.gridWidth, colony.gridHeight, 18);
      const interaction = useGridInteraction(camera, colony.gridWidth, colony.gridHeight);
      const showBuildSheet = ref(false);
      const showResourceGraph = ref(false);

      async function onTileClick(gx, gy) {
        const sel = interaction.selectedBuilding.value;
        if (!sel) return;
        if (!colony.state.value || !colony.state.value.alive) return;

        // Only allow building on revealed tiles
        if (!colony.revealedTiles.value.has(gx + ',' + gy)) return;

        // Find building info
        const info = colony.buildingsInfo.value.find(b => b.id === sel);
        if (!info || !colony.canAfford(info.cost)) return;

        const result = await colony.buildAt(sel, gx, gy);
        if (result && result.success !== false) {
          colony.revealAround(gx, gy, 3);
        }
      }

      function onSelectBuilding(id) {
        if (interaction.selectedBuilding.value === id) {
          interaction.clearSelection();
        } else {
          interaction.selectBuilding(id);
        }
      }

      function toggleBuildSheet() {
        showBuildSheet.value = !showBuildSheet.value;
      }

      function toggleResourceGraph() {
        showResourceGraph.value = !showResourceGraph.value;
      }

      onMounted(() => {
        colony.init();
      });

      return {
        colony,
        camera,
        interaction,
        showBuildSheet,
        showResourceGraph,
        onTileClick,
        onSelectBuilding,
        toggleBuildSheet,
        toggleResourceGraph
      };
    },
    template: `
      <div class="app-layout">
        <HeaderBar :state="colony.state.value" :on-reset="colony.resetColony" />

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
            @select="(id) => { onSelectBuilding(id); showBuildSheet = false; }"
          />
          <EventLog :log="colony.eventLog.value" />
        </div>
      </div>
    `
  };

  createApp(App).mount('#app');
})();
