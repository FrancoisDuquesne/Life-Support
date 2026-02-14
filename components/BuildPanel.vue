<script setup>
import { drawBuilding } from '~/utils/drawing'
import { clampPercent, formatCompact } from '~/utils/formatting'

const props = defineProps({
  buildings: Array,
  state: Object,
  deltas: Object,
  selectedBuilding: String,
  canAfford: Function,
})

const emit = defineEmits(['select'])

const availableBuildings = computed(() =>
  (props.buildings || []).filter((b) => b.buildable !== false),
)

const thumbRefs = {}

function setThumbRef(id, el) {
  if (el) thumbRefs[id] = el
}

const THUMB_SIZE = 56

function drawAllThumbnails() {
  if (!availableBuildings.value) return
  for (const b of availableBuildings.value) {
    const canvas = thumbRefs[b.id]
    if (!canvas) continue
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = THUMB_SIZE * dpr
    canvas.height = THUMB_SIZE * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE)
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE)
    drawBuilding(ctx, b.id, 4, 4, 48, 1)
  }
}

onMounted(() => {
  nextTick(drawAllThumbnails)
})
watch(
  () => availableBuildings.value,
  () => {
    nextTick(drawAllThumbnails)
  },
  { deep: true },
)

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

function getResourceDelta(res) {
  if (!props.deltas) return 0
  return props.deltas[res] || 0
}

function turnsUntilAffordable(cost) {
  if (!cost || props.canAfford(cost)) return 0

  let maxTurns = 0
  for (const [res, amount] of Object.entries(cost)) {
    const missing = Math.max(0, amount - getResourceVal(res))
    if (missing <= 0) continue

    const delta = getResourceDelta(res)
    if (delta <= 0) return null

    maxTurns = Math.max(maxTurns, Math.ceil(missing / delta))
  }

  return maxTurns
}

function availabilityLabel(cost) {
  const turns = turnsUntilAffordable(cost)
  if (turns === null) return '--t'
  return `${turns}t`
}

function costBarPct(res, amount) {
  const have = getResourceVal(res)
  return clampPercent((have / amount) * 100)
}

function formatResourceVal(value) {
  return formatCompact(value)
}

function selectBuilding(id) {
  emit('select', id)
}

// Hover detail state
const hoveredId = ref(null)
const hoverRect = ref(null)

const hoveredBuilding = computed(() => {
  if (!hoveredId.value) return null
  return availableBuildings.value.find((b) => b.id === hoveredId.value) || null
})

const hoverDetailStyle = computed(() => {
  if (!hoverRect.value) return { display: 'none' }
  const detailW = 224
  return {
    top: `${Math.max(8, hoverRect.value.top)}px`,
    left: `${hoverRect.value.left - detailW - 8}px`,
  }
})

function onCardEnter(id, event) {
  hoveredId.value = id
  const el = event.currentTarget
  if (el) {
    hoverRect.value = el.getBoundingClientRect()
  }
}

function onCardLeave() {
  hoveredId.value = null
  hoverRect.value = null
}
</script>
<template>
  <div class="build-panel-root relative flex shrink-0 flex-col gap-2 p-2">
    <h4 class="uppercase">Buildings</h4>

    <div class="grid grid-cols-2 gap-1.5">
      <button
        v-for="b in availableBuildings"
        :key="b.id"
        :class="[
          'bg-muted border-default relative flex flex-col items-center gap-1 rounded-md border p-1.5 transition-colors',
          canAfford(b.cost) ? 'hover:bg-elevated cursor-pointer' : 'opacity-55',
          selectedBuilding === b.id
            ? 'border-primary ring-primary/30 ring-2'
            : 'hover:border-muted-foreground/40',
        ]"
        @click="selectBuilding(b.id)"
        @mouseenter="onCardEnter(b.id, $event)"
        @mouseleave="onCardLeave"
      >
        <!-- Count badge (top-right) -->
        <span
          v-if="getCount(b.id) > 0"
          class="bg-primary text-primary-foreground absolute -top-1 -right-1 z-10 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-bold"
        >
          {{ getCount(b.id) }}
        </span>
        <!-- Turns until affordable badge -->
        <span
          v-if="!canAfford(b.cost)"
          class="bg-warning/90 absolute -top-1 -left-1 z-10 flex h-4.5 items-center rounded-full px-1.5 text-[10px] font-bold text-black"
        >
          {{ availabilityLabel(b.cost) }}
        </span>
        <!-- Canvas thumbnail -->
        <canvas
          :ref="(el) => setThumbRef(b.id, el)"
          class="border-default/70 rounded-sm border"
          :style="{ width: THUMB_SIZE + 'px', height: THUMB_SIZE + 'px' }"
          :width="THUMB_SIZE"
          :height="THUMB_SIZE"
        ></canvas>
        <!-- Building name -->
        <span
          class="text-highlighted w-full truncate text-center text-xs leading-tight font-semibold"
        >
          {{ b.name }}
        </span>
        <!-- Inline cost summary -->
        <div class="flex flex-wrap items-center justify-center gap-1">
          <span
            v-for="(amount, res) in b.cost"
            :key="`cost-${b.id}-${res}`"
            class="text-muted inline-flex items-center gap-0.5 text-[10px] tabular-nums"
          >
            <ResourceIcon :resource="res" size="xs" />{{ amount }}
          </span>
        </div>
      </button>
    </div>

    <!-- Hover detail panel (positioned to the left of hovered card) -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="hoveredBuilding"
          class="bg-muted/95 border-default pointer-events-none fixed z-50 w-56 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm max-md:hidden"
          :style="hoverDetailStyle"
        >
          <div class="text-highlighted text-sm font-bold">
            {{ hoveredBuilding.name }}
          </div>
          <div class="text-muted mt-0.5 text-xs leading-snug">
            {{ hoveredBuilding.description }}
          </div>

          <!-- Cost progress bars -->
          <div
            v-if="hasEntries(hoveredBuilding.cost)"
            class="mt-2 flex flex-col gap-1"
          >
            <div
              v-for="(amount, res) in hoveredBuilding.cost"
              :key="`detail-cost-${res}`"
              class="flex items-center gap-1"
            >
              <ResourceIcon :resource="res" size="sm" />
              <UProgress
                class="flex-1"
                :model-value="costBarPct(res, amount)"
                color="primary"
                size="xs"
              />
              <span
                :class="[
                  'min-w-10 text-right text-[10px] font-bold tabular-nums',
                  getResourceVal(res) >= amount ? 'text-success' : 'text-error',
                ]"
              >
                {{ formatResourceVal(getResourceVal(res)) }}/{{
                  formatResourceVal(amount)
                }}
              </span>
            </div>
          </div>

          <!-- Production / Consumption -->
          <div
            v-if="
              hasEntries(hoveredBuilding.produces) ||
              hasEntries(hoveredBuilding.consumes)
            "
            class="mt-2 flex flex-wrap gap-1"
          >
            <span
              v-for="(amount, res) in hoveredBuilding.produces"
              :key="`detail-prod-${res}`"
              class="text-success border-success/35 bg-success/8 inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] tabular-nums"
            >
              <ResourceIcon :resource="res" size="xs" />
              +{{ amount }}/t
            </span>
            <span
              v-for="(amount, res) in hoveredBuilding.consumes"
              :key="`detail-cons-${res}`"
              class="text-error border-error/35 bg-error/8 inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] tabular-nums"
            >
              <ResourceIcon :resource="res" size="xs" />
              -{{ amount }}/t
            </span>
          </div>

          <!-- Special text -->
          <div
            v-if="hoveredBuilding.special"
            class="text-primary mt-1.5 text-[10px] font-medium"
          >
            {{ hoveredBuilding.special }}
          </div>

          <!-- Build time -->
          <div class="text-muted mt-1 text-[10px]">
            Build time: {{ hoveredBuilding.buildTime || 2 }} ticks
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
