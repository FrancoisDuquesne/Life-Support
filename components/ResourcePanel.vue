<script setup>
import { RESOURCE_KEYS } from '~/utils/constants'
import { formatCompact, formatSignedFixed } from '~/utils/formatting'

const props = defineProps({
  state: Object,
  deltas: Object,
  history: Array,
  compact: { type: Boolean, default: false },
})

const flashKeys = ref({})
let prevVals = {}
const sparkRefs = {}
const RESOURCE_CSS_VAR_MAP = {
  energy: '--ui-resource-energy',
  food: '--ui-resource-food',
  water: '--ui-resource-water',
  minerals: '--ui-resource-minerals',
  oxygen: '--ui-resource-oxygen',
  research: '--ui-resource-research',
}

function setSparkRef(key, el) {
  if (el) sparkRefs[key] = el
}

watch(
  () => props.state && props.state.resources,
  (newRes) => {
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
  },
  { deep: true },
)

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
    let min = Infinity
    let max = -Infinity
    for (const d of slice) {
      const v = d[key] || 0
      if (v < min) min = v
      if (v > max) max = v
    }
    if (max === min) max = min + 1

    const cssVar = RESOURCE_CSS_VAR_MAP[key]
    const color = cssVar
      ? getComputedStyle(document.documentElement)
          .getPropertyValue(cssVar)
          .trim()
      : ''
    ctx.strokeStyle = color || '#64748b'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < slice.length; i++) {
      const x = (i / (slice.length - 1)) * w
      const y = h - (((slice[i][key] || 0) - min) / (max - min)) * h
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}

watch(
  () => props.history,
  () => {
    nextTick(drawSparklines)
  },
  { deep: true },
)

const DEPLETION_WARN_TICKS = 5

const resources = computed(() => {
  return RESOURCE_KEYS.map((key) => {
    const val =
      (props.state && props.state.resources && props.state.resources[key]) || 0
    const delta = (props.deltas && props.deltas[key]) || 0
    const ticksLeft = delta < 0 ? Math.ceil(val / Math.abs(delta)) : null
    return { key, val, delta, ticksLeft }
  })
})

const nuxtColorMap = {
  energy: 'resource-energy',
  food: 'resource-food',
  water: 'resource-water',
  minerals: 'resource-minerals',
  oxygen: 'resource-oxygen',
  research: 'resource-research',
}

const abbrev = {
  energy: 'NRG',
  food: 'FOD',
  water: 'H2O',
  minerals: 'MIN',
  oxygen: 'O2',
  research: 'RES',
}

function isFlashing(key) {
  return !!flashKeys.value[key]
}

function formatSignedDelta(value) {
  return formatSignedFixed(value, 1)
}
</script>
<template>
  <!-- Compact mode: mobile 5-column grid -->
  <template v-if="compact">
    <div class="grid grid-cols-6 gap-1">
      <div
        v-for="r in resources"
        :key="r.key"
        :class="[
          'flex flex-col items-center rounded px-0.5 py-0.5',
          r.delta < 0 ? 'ring-error/70 bg-error/10 animate-pulse ring-1' : '',
        ]"
      >
        <span class="text-muted text-[9px] font-medium leading-none">{{
          abbrev[r.key]
        }}</span>
        <span
          :class="[
            'text-highlighted text-xs font-bold tabular-nums leading-tight',
            { 'animate-pulse': isFlashing(r.key) },
          ]"
          >{{ formatCompact(r.val) }}</span
        >
        <span
          :class="[
            'text-[9px] font-bold tabular-nums leading-tight',
            r.delta > 0
              ? 'text-success'
              : r.delta < 0
                ? 'text-error'
                : 'text-muted',
          ]"
        >
          {{ formatSignedDelta(r.delta) }}
        </span>
        <span
          v-if="r.ticksLeft !== null && r.ticksLeft <= DEPLETION_WARN_TICKS"
          class="text-error text-[9px] font-bold tabular-nums leading-none"
        >
          {{ r.ticksLeft <= 0 ? '!' : `${r.ticksLeft}t` }}
        </span>
      </div>
    </div>
  </template>
  <!-- Full mode: vertical sidebar -->
  <template v-else>
    <div class="flex flex-col gap-1">
      <UBadge
        v-for="r in resources"
        :key="r.key"
        color="neutral"
        variant="subtle"
        size="lg"
        :class="[
          'w-full px-2 py-1.5',
          r.delta < 0 ? 'ring-error/70 bg-error/10 animate-pulse ring-1' : '',
        ]"
      >
        <div class="flex w-full min-w-0 flex-col gap-0.5">
          <div class="flex items-center justify-between gap-1">
            <div class="flex items-center gap-1">
              <ResourceIcon :resource="r.key" />
              <span class="text-muted/90 text-xs tracking-wide uppercase">
                {{ r.key }}
              </span>
            </div>
            <span
              :class="[
                'text-highlighted text-sm font-bold whitespace-nowrap tabular-nums',
                { 'animate-pulse': isFlashing(r.key) },
              ]"
            >
              {{ formatCompact(r.val) }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span
                :class="[
                  'text-xs font-bold whitespace-nowrap tabular-nums',
                  r.delta > 0
                    ? 'text-success'
                    : r.delta < 0
                      ? 'text-error'
                      : 'text-muted',
                ]"
              >
                {{ formatSignedDelta(r.delta) }}/t
              </span>
              <span
                v-if="r.ticksLeft !== null && r.ticksLeft <= DEPLETION_WARN_TICKS"
                class="text-error bg-error/15 rounded px-1 text-[10px] font-bold tabular-nums"
              >
                {{ r.ticksLeft <= 0 ? 'EMPTY' : `${r.ticksLeft}t left` }}
              </span>
            </div>
            <canvas
              :ref="(el) => setSparkRef(r.key, el)"
              class="block h-4 w-20 shrink-0 opacity-90"
            ></canvas>
          </div>
        </div>
      </UBadge>
    </div>
  </template>
</template>
