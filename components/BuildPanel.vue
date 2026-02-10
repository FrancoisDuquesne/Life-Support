<script setup>
import { drawBuilding } from '~/utils/drawing'
import { clampPercent, formatCompact, worstDeficit } from '~/utils/formatting'

const props = defineProps({
  buildings: Array,
  state: Object,
  selectedBuilding: String,
  canAfford: Function,
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, 44, 44)
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, 44, 44)
    drawBuilding(ctx, b.id, 2, 2, 40, 1)
  }
}

onMounted(() => {
  nextTick(drawAllThumbnails)
})
watch(
  () => props.buildings,
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

function getMissingResource(cost) {
  const d = worstDeficit(cost, props.state && props.state.resources)
  if (!d) return ''
  return `${formatCompact(d.deficit)} ${d.key.slice(0, 3).toUpperCase()}`
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
</script>
<template>
  <div class="flex shrink-0 flex-col gap-2 p-2">
    <h3 class="uppercase">Buildings</h3>

    <div class="flex flex-col gap-1.5">
      <UButton
        v-for="b in buildings"
        :key="b.id"
        block
        color="neutral"
        variant="soft"
        :class="[
          'h-auto justify-start',
          canAfford(b.cost) ? '' : 'opacity-70',
          selectedBuilding === b.id
            ? 'border-primary border-2'
            : 'border-default border-2',
        ]"
        :ui="{ leadingIcon: 'hidden', trailingIcon: 'hidden' }"
        @click="selectBuilding(b.id)"
      >
        <div class="flex w-full flex-col gap-1.5 text-left">
          <div class="flex items-start gap-2">
            <canvas
              :ref="(el) => setThumbRef(b.id, el)"
              class="border-default/70 h-11 w-11 shrink-0 rounded-sm border max-md:h-8 max-md:w-8"
              width="44"
              height="44"
            ></canvas>
            <div class="min-w-0 flex-1">
              <div class="text-highlighted font-bold">{{ b.name }}</div>
              <div class="text-muted mt-px">{{ b.description }}</div>
            </div>
            <UBadge
              :color="canAfford(b.cost) ? 'success' : 'error'"
              variant="subtle"
              :label="canAfford(b.cost) ? 'Ready' : 'Need'"
            />
          </div>

          <div class="flex flex-col gap-1">
            <div
              v-for="(amount, res) in b.cost"
              :key="res"
              class="flex items-center gap-1"
            >
              <div
                class="bg-elevated border-default/70 flex min-w-12 items-center justify-center rounded border px-1.5 py-1"
              >
                <ResourceIcon :resource="res" size="sm" />
              </div>
              <UProgress
                class="flex-1"
                :model-value="costBarPct(res, amount)"
                color="primary"
                size="sm"
              />
              <span
                :class="[
                  'min-w-12 text-right font-bold tabular-nums',
                  getResourceVal(res) >= amount ? 'text-success' : 'text-error',
                ]"
              >
                {{ formatResourceVal(getResourceVal(res)) }}/{{
                  formatResourceVal(amount)
                }}
              </span>
            </div>
          </div>

          <div
            v-if="hasEntries(b.produces) || hasEntries(b.consumes)"
            class="flex flex-wrap gap-1"
          >
            <span
              v-for="(amount, res) in b.produces"
              :key="`prod-${b.id}-${res}`"
              class="text-success border-success/35 bg-success/8 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 tabular-nums"
            >
              <ResourceIcon :resource="res" size="xs" />
              +{{ amount }}/t
            </span>
            <span
              v-for="(amount, res) in b.consumes"
              :key="`cons-${b.id}-${res}`"
              class="text-error border-error/35 bg-error/8 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 tabular-nums"
            >
              <ResourceIcon :resource="res" size="xs" />
              -{{ amount }}/t
            </span>
          </div>

          <div class="flex items-center justify-between">
            <UBadge
              color="primary"
              variant="subtle"
              :label="`x${getCount(b.id)}`"
            />
            <UBadge
              :color="canAfford(b.cost) ? 'success' : 'error'"
              variant="subtle"
              :label="
                canAfford(b.cost)
                  ? 'READY'
                  : `NEED ${getMissingResource(b.cost)}`
              "
            />
          </div>

          <UBadge
            v-if="b.special"
            color="primary"
            variant="soft"
            :label="b.special"
          />
        </div>
      </UButton>
    </div>
  </div>
</template>
