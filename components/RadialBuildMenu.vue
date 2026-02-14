<script setup>
import { drawBuilding } from '~/utils/drawing'
import { clampPercent, formatCompact } from '~/utils/formatting'

const props = defineProps({
  open: Boolean,
  x: Number,
  y: Number,
  buildings: Array,
  state: Object,
  deltas: Object,
  canAfford: Function,
})

const emit = defineEmits(['update:open', 'select'])

const RING_RADIUS = 120
const ITEM_SIZE = 48

const hoveredId = ref(null)
const menuRef = ref(null)
const thumbRefs = {}

const availableBuildings = computed(() =>
  (props.buildings || []).filter((b) => b.buildable !== false),
)

// Clamp menu center so the full circle stays on screen
const menuCenter = computed(() => {
  const pad = RING_RADIUS + ITEM_SIZE / 2 + 16
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600
  return {
    x: Math.max(pad, Math.min(vw - pad, props.x)),
    y: Math.max(pad, Math.min(vh - pad, props.y)),
  }
})

function itemPosition(index) {
  const N = availableBuildings.value.length
  if (N === 0) return { x: 0, y: 0 }
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / N
  return {
    x: Math.cos(angle) * RING_RADIUS,
    y: Math.sin(angle) * RING_RADIUS,
  }
}

function setThumbRef(id, el) {
  if (el) thumbRefs[id] = el
}

function drawAllThumbnails() {
  if (!availableBuildings.value) return
  for (const b of availableBuildings.value) {
    const canvas = thumbRefs[b.id]
    if (!canvas) continue
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = ITEM_SIZE * dpr
    canvas.height = ITEM_SIZE * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, ITEM_SIZE, ITEM_SIZE)
    // Circular clip
    ctx.save()
    ctx.beginPath()
    ctx.arc(ITEM_SIZE / 2, ITEM_SIZE / 2, ITEM_SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, ITEM_SIZE, ITEM_SIZE)
    drawBuilding(ctx, b.id, 4, 4, ITEM_SIZE - 8, 1)
    ctx.restore()
  }
}

function close() {
  emit('update:open', false)
  hoveredId.value = null
}

function selectItem(id) {
  emit('select', id)
  close()
}

function onKeyDown(e) {
  if (e.key === 'Escape') close()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      nextTick(() => {
        drawAllThumbnails()
        window.addEventListener('keydown', onKeyDown)
      })
    } else {
      window.removeEventListener('keydown', onKeyDown)
      hoveredId.value = null
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

// Info panel helpers
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

function costBarPct(res, amount) {
  return clampPercent((getResourceVal(res) / amount) * 100)
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

function hasEntries(map) {
  if (!map) return false
  return Object.keys(map).length > 0
}

// Info panel position: push outward from menu center
const infoPanelStyle = computed(() => {
  if (!hoveredId.value) return { display: 'none' }
  const idx = availableBuildings.value.findIndex(
    (b) => b.id === hoveredId.value,
  )
  if (idx === -1) return { display: 'none' }
  const pos = itemPosition(idx)
  const N = availableBuildings.value.length
  const angle = -Math.PI / 2 + (2 * Math.PI * idx) / N
  // Push info card further outward
  const infoDistance = RING_RADIUS + 64
  const ix = Math.cos(angle) * infoDistance
  const iy = Math.sin(angle) * infoDistance
  // Anchor the card relative to the direction
  const translateX =
    Math.cos(angle) > 0.3 ? '0%' : Math.cos(angle) < -0.3 ? '-100%' : '-50%'
  const translateY =
    Math.sin(angle) > 0.3 ? '0%' : Math.sin(angle) < -0.3 ? '-100%' : '-50%'
  return {
    position: 'absolute',
    left: `${ix}px`,
    top: `${iy}px`,
    transform: `translate(${translateX}, ${translateY})`,
    zIndex: 10,
  }
})

const hoveredBuilding = computed(() => {
  if (!hoveredId.value) return null
  return availableBuildings.value.find((b) => b.id === hoveredId.value)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="radial">
      <div
        v-if="open"
        class="radial-backdrop"
        @click="close"
        @contextmenu.prevent="close"
      >
        <div
          ref="menuRef"
          class="radial-container"
          :style="{
            left: menuCenter.x + 'px',
            top: menuCenter.y + 'px',
          }"
          @click.stop
        >
          <!-- Radial items -->
          <div
            v-for="(b, idx) in availableBuildings"
            :key="b.id"
            class="radial-item"
            :class="{
              'radial-item--dimmed': !canAfford(b.cost),
              'radial-item--hovered': hoveredId === b.id,
            }"
            :style="{
              transform: `translate(${itemPosition(idx).x - ITEM_SIZE / 2}px, ${itemPosition(idx).y - ITEM_SIZE / 2}px)`,
            }"
            @mouseenter="hoveredId = b.id"
            @mouseleave="hoveredId = null"
            @click="selectItem(b.id)"
          >
            <canvas
              :ref="(el) => setThumbRef(b.id, el)"
              class="radial-thumb"
              :width="ITEM_SIZE"
              :height="ITEM_SIZE"
            />
            <span class="radial-label">{{ b.name }}</span>
            <UBadge
              v-if="getCount(b.id) > 0"
              color="primary"
              variant="subtle"
              size="xs"
              :label="`x${getCount(b.id)}`"
              class="radial-count"
            />
          </div>

          <!-- Info panel -->
          <div
            v-if="hoveredBuilding"
            :style="infoPanelStyle"
            class="pointer-events-none"
          >
            <UCard
              :ui="{ body: 'p-2 sm:p-2' }"
              class="radial-info w-52 shadow-lg"
            >
              <div class="flex flex-col gap-1.5">
                <div class="text-highlighted text-sm font-bold">
                  {{ hoveredBuilding.name }}
                </div>
                <div class="text-muted text-xs leading-tight">
                  {{ hoveredBuilding.description }}
                </div>

                <!-- Cost bars -->
                <div class="flex flex-col gap-1">
                  <div
                    v-for="(amount, res) in hoveredBuilding.cost"
                    :key="res"
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
                        'min-w-10 text-right text-xs font-bold tabular-nums',
                        getResourceVal(res) >= amount
                          ? 'text-success'
                          : 'text-error',
                      ]"
                    >
                      {{ formatCompact(getResourceVal(res)) }}/{{
                        formatCompact(amount)
                      }}
                    </span>
                  </div>
                </div>

                <!-- Produces / Consumes -->
                <div
                  v-if="
                    hasEntries(hoveredBuilding.produces) ||
                    hasEntries(hoveredBuilding.consumes)
                  "
                  class="flex flex-wrap gap-1"
                >
                  <span
                    v-for="(amount, res) in hoveredBuilding.produces"
                    :key="`prod-${res}`"
                    class="text-success inline-flex items-center gap-0.5 text-xs tabular-nums"
                  >
                    <ResourceIcon :resource="res" size="xs" />
                    +{{ amount }}/t
                  </span>
                  <span
                    v-for="(amount, res) in hoveredBuilding.consumes"
                    :key="`cons-${res}`"
                    class="text-error inline-flex items-center gap-0.5 text-xs tabular-nums"
                  >
                    <ResourceIcon :resource="res" size="xs" />
                    -{{ amount }}/t
                  </span>
                </div>

                <!-- Affordability badge -->
                <div class="flex items-center justify-between">
                  <UBadge
                    v-if="!canAfford(hoveredBuilding.cost)"
                    color="warning"
                    variant="subtle"
                    size="xs"
                    :label="availabilityLabel(hoveredBuilding.cost)"
                  />
                  <UBadge
                    v-if="hoveredBuilding.special"
                    color="primary"
                    variant="soft"
                    size="xs"
                    :label="hoveredBuilding.special"
                  />
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.radial-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.3);
}

.radial-container {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
}

.radial-item {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: auto;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    opacity 0.15s ease;
}

.radial-item--dimmed {
  opacity: 0.5;
}

.radial-item--hovered {
  z-index: 2;
}

.radial-item--hovered .radial-thumb {
  transform: scale(1.15);
  box-shadow: 0 0 12px rgba(96, 165, 250, 0.5);
}

.radial-thumb {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid rgba(148, 163, 184, 0.5);
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
  background: #1e293b;
}

.radial-label {
  font-size: 10px;
  font-weight: 600;
  color: #e2e8f0;
  text-align: center;
  white-space: nowrap;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.radial-count {
  position: absolute;
  top: -4px;
  right: -4px;
}

.radial-info {
  pointer-events: none;
}

/* Transition */
.radial-enter-active {
  transition: opacity 0.15s ease-out;
}
.radial-enter-active .radial-item {
  transition:
    transform 0.15s ease-out,
    opacity 0.15s ease-out;
}
.radial-leave-active {
  transition: opacity 0.1s ease-in;
}
.radial-enter-from {
  opacity: 0;
}
.radial-leave-to {
  opacity: 0;
}
</style>
