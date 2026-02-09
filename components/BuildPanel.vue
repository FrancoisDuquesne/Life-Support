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
    ctx.fillStyle = '#1e293b'
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

const barColorMap = {
  energy: 'bg-amber-600',
  food: 'bg-green-600',
  water: 'bg-blue-600',
  minerals: 'bg-orange-600'
}
</script>

<template>
  <div class="p-2 shrink-0">
    <div class="text-[0.65rem] text-slate-400 uppercase tracking-[2px] mb-1.5 pb-1 border-b border-slate-700/30">Buildings</div>
    <div class="flex flex-col gap-1.5">
      <div
        v-for="b in buildings"
        :key="b.id"
        :class="[
          'cursor-pointer transition-all duration-150 bg-slate-800/50 rounded-md p-2',
          selectedBuilding === b.id ? 'ring-2 ring-cyan-500 bg-cyan-500/10' : '',
          canAfford(b.cost) ? 'border-l-3 border-l-green-400' : 'border-l-3 border-l-red-400 opacity-55 hover:opacity-75'
        ]"
        @click="selectBuilding(b.id)"
      >
        <div class="flex items-start gap-2">
          <canvas :ref="el => setThumbRef(b.id, el)"
                  class="w-[44px] h-[44px] rounded-sm shrink-0 border border-slate-700/30 max-md:w-8 max-md:h-8"
                  width="44" height="44"></canvas>
          <div class="flex-1 min-w-0">
            <div class="text-[0.8rem] text-slate-100 font-bold">{{ b.name }}</div>
            <div class="text-[0.6rem] text-slate-400 mt-px">{{ b.description }}</div>
          </div>
        </div>

        <div class="flex flex-col gap-0.5 mt-1.5 p-1.5 bg-slate-900/50 rounded-sm">
          <div class="text-[0.55rem] uppercase tracking-[1px] text-slate-400">Cost</div>
          <div v-for="(amount, res) in b.cost" :key="res" class="flex items-center gap-1 text-[0.7rem]">
            <span class="min-w-[48px] text-slate-400 text-[0.55rem] uppercase tracking-[0.5px]">{{ res }}</span>
            <div class="flex-1 h-[5px] bg-slate-700/50 rounded-sm overflow-hidden">
              <div :class="['h-full rounded-sm transition-[width] duration-500', barColorMap[res]]"
                   :style="{ width: costBarPct(res, amount) + '%' }"></div>
            </div>
            <span :class="['text-[0.65rem] font-bold min-w-[38px] text-right tabular-nums', getResourceVal(res) >= amount ? 'text-green-400' : 'text-red-400']">
              {{ getResourceVal(res) }}/{{ amount }}
            </span>
          </div>
          <template v-if="hasEntries(b.produces)">
            <div class="text-[0.55rem] uppercase tracking-[1px] text-green-400 mt-0.5">Produces</div>
            <div class="text-[0.7rem] font-bold text-green-400">+{{ formatMap(b.produces) }}/tick</div>
          </template>
          <template v-if="hasEntries(b.consumes)">
            <div class="text-[0.55rem] uppercase tracking-[1px] text-red-400 mt-0.5">Consumes</div>
            <div class="text-[0.7rem] font-bold text-red-400">-{{ formatMap(b.consumes) }}/tick</div>
          </template>
        </div>

        <div class="flex items-center justify-between mt-1">
          <span class="text-[0.7rem] text-cyan-400 font-bold">x{{ getCount(b.id) }}</span>
          <UBadge
            :color="canAfford(b.cost) ? 'success' : 'error'"
            variant="subtle"
            size="sm"
            class="uppercase tracking-[0.5px] text-[0.6rem] font-bold"
          >
            <template v-if="canAfford(b.cost)">READY</template>
            <template v-else>NEED: {{ getMissingResource(b.cost) }}</template>
          </UBadge>
        </div>
      </div>
    </div>
  </div>
</template>
