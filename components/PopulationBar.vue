<script setup>
const props = defineProps({
  state: Object,
  compact: { type: Boolean, default: false }
})

const pop = computed(() => props.state ? props.state.population : 0)
const cap = computed(() => props.state ? props.state.populationCapacity : 0)
const pct = computed(() => cap.value > 0 ? (pop.value / cap.value) * 100 : 0)
</script>

<template>
  <!-- Compact mode: inline text for mobile -->
  <div v-if="compact" class="text-[0.6rem] whitespace-nowrap flex items-center gap-1">
    <span class="text-cyan-400 uppercase font-bold">Pop</span>
    <span class="text-slate-100 tabular-nums">{{ pop }}/{{ cap }}</span>
  </div>

  <!-- Full mode: card with progress bar -->
  <div v-else class="bg-slate-800/50 rounded-md border-l-3 border-l-cyan-500 p-2">
    <div class="flex items-center gap-2">
      <span class="text-[0.6rem] uppercase tracking-[1.5px] text-cyan-400">Colonists</span>
      <span class="text-sm font-bold text-slate-100 whitespace-nowrap">
        {{ pop }} / {{ cap }}
      </span>
    </div>
    <div class="mt-1.5 h-1 bg-slate-700/50 rounded-full overflow-hidden">
      <div class="h-full bg-cyan-500 rounded-full transition-[width] duration-500" :style="{ width: pct + '%' }"></div>
    </div>
  </div>
</template>
