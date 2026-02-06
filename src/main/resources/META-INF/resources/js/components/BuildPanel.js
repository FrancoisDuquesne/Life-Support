// BuildPanel.js — building cards with thumbnails, cost bars, status badges
(function() {
  const BuildPanel = {
    props: ['buildings', 'state', 'selectedBuilding', 'canAfford'],
    emits: ['select'],
    setup(props, { emit }) {
      const { onMounted, watch, nextTick } = Vue;
      const thumbRefs = {};

      function setThumbRef(id, el) {
        if (el) thumbRefs[id] = el;
      }

      function drawAllThumbnails() {
        const drawBuilding = window.SpaceColony.drawBuilding;
        if (!drawBuilding || !props.buildings) return;
        for (const b of props.buildings) {
          const canvas = thumbRefs[b.id];
          if (!canvas) continue;
          const ctx = canvas.getContext('2d');
          const dpr = window.devicePixelRatio || 1;
          canvas.width = 44 * dpr;
          canvas.height = 44 * dpr;
          ctx.scale(dpr, dpr);
          ctx.fillStyle = '#c2a67d';
          ctx.fillRect(0, 0, 44, 44);
          drawBuilding(ctx, b.id, 2, 2, 40, 1);
        }
      }

      onMounted(() => { nextTick(drawAllThumbnails); });
      watch(() => props.buildings, () => { nextTick(drawAllThumbnails); }, { deep: true });

      function formatMap(map) {
        if (!map) return '';
        const parts = [];
        for (const k in map) {
          parts.push(map[k] + ' ' + k);
        }
        return parts.join(', ');
      }

      function hasEntries(map) {
        if (!map) return false;
        return Object.keys(map).length > 0;
      }

      function getCount(id) {
        if (!props.state || !props.state.buildings) return 0;
        return props.state.buildings[id.toLowerCase()] || 0;
      }

      function getResourceVal(res) {
        if (!props.state || !props.state.resources) return 0;
        return props.state.resources[res] || 0;
      }

      function getMissingResource(cost) {
        if (!cost || !props.state || !props.state.resources) return '';
        let worstKey = '';
        let worstDeficit = 0;
        for (const k in cost) {
          const have = props.state.resources[k] || 0;
          const deficit = cost[k] - have;
          if (deficit > worstDeficit) {
            worstDeficit = deficit;
            worstKey = k;
          }
        }
        return worstDeficit > 0 ? (worstDeficit + ' ' + worstKey) : '';
      }

      function costBarPct(res, amount) {
        const have = getResourceVal(res);
        return Math.min(100, (have / amount) * 100);
      }

      function selectBuilding(id) {
        emit('select', id);
      }

      return {
        setThumbRef, formatMap, hasEntries, getCount, getResourceVal,
        getMissingResource, costBarPct, selectBuilding
      };
    },
    template: `
      <div class="build-panel">
        <div class="build-panel-title">Buildings</div>
        <div class="build-cards">
          <div v-for="b in buildings" :key="b.id"
               :class="['building-card',
                         { selected: selectedBuilding === b.id },
                         canAfford(b.cost) ? 'affordable' : 'unaffordable']"
               @click="selectBuilding(b.id)">
            <div class="b-card-header">
              <canvas :ref="el => setThumbRef(b.id, el)"
                      class="b-thumb-canvas"
                      width="44" height="44"></canvas>
              <div class="b-card-title">
                <div class="b-name">{{ b.name }}</div>
                <div class="b-desc">{{ b.description }}</div>
              </div>
            </div>
            <div class="b-stats">
              <div class="b-stats-label">Cost</div>
              <div v-for="(amount, res) in b.cost" :key="res" class="b-cost-row">
                <span class="b-cost-label">{{ res }}</span>
                <div class="b-cost-bar-track">
                  <div :class="['b-cost-bar-fill', res]"
                       :style="{ width: costBarPct(res, amount) + '%' }"></div>
                </div>
                <span :class="['b-cost-amount', getResourceVal(res) >= amount ? 'b-cost-met' : 'b-cost-unmet']">
                  {{ getResourceVal(res) }}/{{ amount }}
                </span>
              </div>
              <template v-if="hasEntries(b.produces)">
                <div class="b-stats-label prod">Produces</div>
                <div class="b-stat-line prod-val">+{{ formatMap(b.produces) }}/tick</div>
              </template>
              <template v-if="hasEntries(b.consumes)">
                <div class="b-stats-label cons">Consumes</div>
                <div class="b-stat-line cons-val">-{{ formatMap(b.consumes) }}/tick</div>
              </template>
            </div>
            <div class="b-card-footer">
              <span class="b-owned">x{{ getCount(b.id) }}</span>
              <div :class="['b-afford-badge', canAfford(b.cost) ? 'ready' : 'blocked']">
                <template v-if="canAfford(b.cost)">READY</template>
                <template v-else>NEED: {{ getMissingResource(b.cost) }}</template>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
  };

  window.SpaceColony = window.SpaceColony || {};
  window.SpaceColony.BuildPanel = BuildPanel;
})();
