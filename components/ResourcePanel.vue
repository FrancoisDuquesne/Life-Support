<script setup>
import { RESOURCE_KEYS, COLORS } from '~/utils/constants'

const props = defineProps({
  state: Object,
  deltas: Object,
  history: Array
})

const flashKeys = ref({})
let prevVals = {}
const sparkRefs = {}

function setSparkRef(key, el) {
  if (el) sparkRefs[key] = el
}

watch(() => props.state && props.state.resources, (newRes) => {
  if (!newRes) return
  for (const key of RESOURCE_KEYS) {
    const val = newRes[key] || 0
    if (prevVals[key] !== undefined && prevVals[key] !== val) {
      flashKeys.value = { ...flashKeys.value, [key]: true }
      setTimeout(() => {
        flashKeys.value = { ...flashKeys.value, [key]: false }
      }, 500)
    }
    prevVals[key] = val
  }
}, { deep: true })

function drawSparklines() {
  const data = props.history
  if (!data || data.length < 2) return
  for (const key of RESOURCE_KEYS) {
    const canvas = sparkRefs[key]
    if (!canvas) continue
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const slice = data.slice(-20)
    let min = Infinity, max = -Infinity
    for (const d of slice) {
      const v = d[key] || 0
      if (v < min) min = v
      if (v > max) max = v
    }
    if (max === min) { max = min + 1 }

    ctx.strokeStyle = COLORS[key]
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < slice.length; i++) {
      const x = (i / (slice.length - 1)) * w
      const y = h - ((slice[i][key] || 0) - min) / (max - min) * h
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

watch(() => props.history && props.history.length, () => {
  nextTick(drawSparklines)
})

const resources = computed(() => {
  return RESOURCE_KEYS.map(key => {
    const val = (props.state && props.state.resources && props.state.resources[key]) || 0
    const delta = (props.deltas && props.deltas[key]) || 0
    return { key, val, delta }
  })
})

function isFlashing(key) {
  return !!flashKeys.value[key]
}
</script>

<template>
  <div class="resources-strip">
    <div v-for="r in resources" :key="r.key"
         :class="['resource-card', r.key]">
      <div class="label">{{ r.key }}</div>
      <div class="resource-val-row">
        <span :class="['value', { flashing: isFlashing(r.key) }]">{{ r.val }}</span>
        <span :class="['delta-pill', r.delta > 0 ? 'positive' : r.delta < 0 ? 'negative' : 'neutral']">
          {{ r.delta > 0 ? '+' : '' }}{{ r.delta }}/t
        </span>
      </div>
      <canvas :ref="el => setSparkRef(r.key, el)" class="sparkline-canvas"></canvas>
    </div>
  </div>
</template>

<style scoped>
.resources-strip { display: flex; gap: 8px; flex: 1; min-width: 0 }
.resource-card {
  background: rgba(247,244,239,0.45);
  border: 1px solid rgba(214,207,196,0.5);
  border-radius: 4px;
  padding: 6px 10px;
  min-width: 110px;
  flex: 1;
  border-left: 3px solid transparent;
}
.resource-card .label {
  font-size: .6rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 2px;
}
.resource-val-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 2px;
}
.resource-card .value {
  font-size: 1.1rem;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
}
.delta-pill {
  font-size: .75rem;
  font-weight: bold;
  white-space: nowrap;
  padding: 1px 6px;
  border-radius: 3px;
}
.delta-pill.positive { color: var(--success); background: rgba(22,163,74,.1) }
.delta-pill.negative { color: var(--danger); background: rgba(220,38,38,.1) }
.delta-pill.neutral { color: var(--text-dim); background: rgba(0,0,0,.04) }
.resource-card.energy .label, .resource-card.energy .value { color: var(--energy) }
.resource-card.food .label, .resource-card.food .value { color: var(--food) }
.resource-card.water .label, .resource-card.water .value { color: var(--water) }
.resource-card.minerals .label, .resource-card.minerals .value { color: var(--minerals) }
.resource-card.energy { border-left-color: var(--energy) }
.resource-card.food { border-left-color: var(--food) }
.resource-card.water { border-left-color: var(--water) }
.resource-card.minerals { border-left-color: var(--minerals) }
.sparkline-canvas { width: 60px; height: 16px; display: block; opacity: 0.85 }

@keyframes resource-flash { 0% { filter: brightness(1.4) } 100% { filter: brightness(1) } }
.resource-card .value.flashing { animation: resource-flash .5s ease }

@media (max-width: 768px) {
  .resource-card { min-width: 80px; padding: 4px 6px }
  .resource-card .value { font-size: .9rem }
  .sparkline-canvas { width: 50px; height: 14px }
}
</style>
