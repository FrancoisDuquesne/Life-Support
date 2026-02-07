<script setup>
import { drawBuilding } from '~/utils/drawing'

const props = defineProps({
  buildings: Array,
  state: Object,
  selectedBuilding: String,
  canAfford: Function
})

const emit = defineEmits(['select'])

const thumbRefs = {}

function setThumbRef(id, el) {
  if (el) thumbRefs[id] = el
}

function drawAllThumbnails() {
  if (!props.buildings) return
  for (const b of props.buildings) {
    const canvas = thumbRefs[b.id]
    if (!canvas) continue
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = 44 * dpr
    canvas.height = 44 * dpr
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#c2a67d'
    ctx.fillRect(0, 0, 44, 44)
    drawBuilding(ctx, b.id, 2, 2, 40, 1)
  }
}

onMounted(() => { nextTick(drawAllThumbnails) })
watch(() => props.buildings, () => { nextTick(drawAllThumbnails) }, { deep: true })

function formatMap(map) {
  if (!map) return ''
  const parts = []
  for (const k in map) {
    parts.push(map[k] + ' ' + k)
  }
  return parts.join(', ')
}

function hasEntries(map) {
  if (!map) return false
  return Object.keys(map).length > 0
}

function getCount(id) {
  if (!props.state || !props.state.buildings) return 0
  return props.state.buildings[id.toLowerCase()] || 0
}

function getResourceVal(res) {
  if (!props.state || !props.state.resources) return 0
  return props.state.resources[res] || 0
}

function getMissingResource(cost) {
  if (!cost || !props.state || !props.state.resources) return ''
  let worstKey = ''
  let worstDeficit = 0
  for (const k in cost) {
    const have = props.state.resources[k] || 0
    const deficit = cost[k] - have
    if (deficit > worstDeficit) {
      worstDeficit = deficit
      worstKey = k
    }
  }
  return worstDeficit > 0 ? (worstDeficit + ' ' + worstKey) : ''
}

function costBarPct(res, amount) {
  const have = getResourceVal(res)
  return Math.min(100, (have / amount) * 100)
}

function selectBuilding(id) {
  emit('select', id)
}
</script>

<template>
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
</template>

<style scoped>
.build-panel { padding: 8px; flex-shrink: 0 }
.build-panel-title {
  font-size: .65rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.build-cards { display: flex; flex-direction: column; gap: 6px }
.building-card {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  transition: all .15s;
}
.building-card:hover { border-color: #b8ad9e; background: #f0ebe3 }
.building-card.selected { border-color: var(--water); background: rgba(37,99,235,.08) }
.building-card .b-name { font-size: .8rem; color: var(--text-bright); font-weight: bold }
.building-card .b-desc { font-size: .6rem; color: var(--text-dim); margin-top: 1px }
.building-card.affordable { border-left: 3px solid var(--success) }
.building-card.unaffordable { border-left: 3px solid var(--danger); opacity: .55 }
.building-card.unaffordable:hover { opacity: .75 }
.b-card-header { display: flex; align-items: flex-start; gap: 8px }
.b-thumb-canvas {
  width: 44px;
  height: 44px;
  border-radius: 3px;
  flex-shrink: 0;
  border: 1px solid var(--border);
}
.b-card-title { flex: 1; min-width: 0 }
.building-card .b-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 5px;
  padding: 5px 6px;
  background: rgba(0,0,0,.04);
  border-radius: 3px;
}
.b-stats-label {
  font-size: .55rem;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-dim);
  margin-top: 2px;
}
.b-stats-label:first-child { margin-top: 0 }
.b-stats-label.prod { color: var(--success) }
.b-stats-label.cons { color: var(--danger) }
.b-stat-line { font-size: .7rem; font-weight: bold }
.b-stat-line.prod-val { color: var(--success) }
.b-stat-line.cons-val { color: var(--danger) }
.b-cost-row { display: flex; align-items: center; gap: 4px; font-size: .7rem }
.b-cost-label {
  min-width: 48px;
  color: var(--text-dim);
  font-size: .55rem;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.b-cost-bar-track {
  flex: 1;
  height: 5px;
  background: rgba(0,0,0,.08);
  border-radius: 2px;
  overflow: hidden;
}
.b-cost-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width .5s ease;
}
.b-cost-bar-fill.energy { background: var(--energy) }
.b-cost-bar-fill.food { background: var(--food) }
.b-cost-bar-fill.water { background: var(--water) }
.b-cost-bar-fill.minerals { background: var(--minerals) }
.b-cost-amount {
  font-size: .65rem;
  font-weight: bold;
  min-width: 38px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.b-cost-met { color: var(--success) }
.b-cost-unmet { color: var(--danger) }
.b-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}
.building-card .b-owned { font-size: .7rem; color: var(--water); font-weight: bold }
.b-afford-badge {
  font-size: .6rem;
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.b-afford-badge.ready { background: rgba(22,163,74,.12); color: var(--success) }
.b-afford-badge.blocked { background: rgba(220,38,38,.1); color: var(--danger) }

@media (max-width: 768px) {
  .b-thumb-canvas { width: 32px; height: 32px }
}
</style>
