<script setup>
import { RESOURCE_KEYS, COLORS } from '~/utils/constants'

const props = defineProps({
  state: Object,
  deltas: Object,
  history: Array,
  compact: { type: Boolean, default: false }
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

const borderColorMap = {
  energy: 'border-l-amber-600',
  food: 'border-l-green-600',
  water: 'border-l-blue-600',
  minerals: 'border-l-orange-600'
}

const textColorMap = {
  energy: 'text-amber-600',
  food: 'text-green-600',
  water: 'text-blue-600',
  minerals: 'text-orange-600'
}

const abbrev = {
  energy: 'NRG',
  food: 'FOD',
  water: 'H2O',
  minerals: 'MIN'
}

function isFlashing(key) {
  return !!flashKeys.value[key]
}
</script>

<template>
  <!-- Compact mode: mobile horizontal -->
  <template v-if="compact">
    <div class="flex gap-2 flex-1 min-w-0 items-center">
      <div v-for="r in resources" :key="r.key" class="flex items-center gap-1 text-[0.6rem] whitespace-nowrap">
        <span :class="[textColorMap[r.key], 'uppercase font-bold']">{{ abbrev[r.key] }}</span>
        <span :class="['tabular-nums text-slate-100', { 'animate-pulse': isFlashing(r.key) }]">{{ r.val }}</span>
        <span :class="[r.delta > 0 ? 'text-green-400' : r.delta < 0 ? 'text-red-400' : 'text-slate-500', 'text-[0.55rem]']">
          {{ r.delta > 0 ? '+' : '' }}{{ r.delta }}
        </span>
      </div>
    </div>
  </template>

  <!-- Full mode: vertical sidebar -->
  <template v-else>
    <div class="flex flex-col gap-1.5">
      <div
        v-for="r in resources"
        :key="r.key"
        :class="['bg-slate-800/50 rounded-md border-l-3 p-2', borderColorMap[r.key]]"
      >
        <div :class="['text-[0.6rem] uppercase tracking-[1.5px] mb-0.5', textColorMap[r.key]]">{{ r.key }}</div>
        <div class="flex items-baseline gap-1.5 mb-0.5">
          <span :class="['text-lg font-bold tabular-nums text-slate-100', { 'animate-pulse': isFlashing(r.key) }]">{{ r.val }}</span>
          <UBadge
            :color="r.delta > 0 ? 'success' : r.delta < 0 ? 'error' : 'neutral'"
            variant="subtle"
            size="sm"
            class="text-xs font-bold whitespace-nowrap"
          >
            {{ r.delta > 0 ? '+' : '' }}{{ r.delta }}/t
          </UBadge>
        </div>
        <canvas :ref="el => setSparkRef(r.key, el)" class="w-full h-4 block opacity-85"></canvas>
      </div>
    </div>
  </template>
</template>
