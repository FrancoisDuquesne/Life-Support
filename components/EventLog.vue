<script setup>
const props = defineProps({
  log: Array
})

const logEl = ref(null)

watch(() => props.log.length, () => {
  nextTick(() => {
    if (logEl.value) {
      logEl.value.scrollTop = logEl.value.scrollHeight
    }
  })
})
</script>

<template>
  <div class="p-2 h-full flex flex-col min-h-0">
    <div class="text-[0.65rem] text-slate-400 uppercase tracking-[2px] mb-1 pb-1 border-b border-slate-700/30 shrink-0">Event Log</div>
    <div class="flex-1 overflow-hidden bg-slate-900/50 rounded-md min-h-0">
      <div ref="logEl" class="p-1.5 overflow-y-auto h-full text-[0.65rem] scrollbar-dark">
        <div v-for="entry in log" :key="entry.id"
             class="py-px border-b border-slate-700/30">
          <span v-if="entry.tick != null" class="text-slate-500 mr-1.5">[T{{ entry.tick }}]</span>
          <span :class="[
            entry.severity === 'normal' ? 'text-green-400' : '',
            entry.severity === 'warning' ? 'text-yellow-400' : '',
            entry.severity === 'collapse' ? 'text-red-400 font-bold' : ''
          ]">{{ entry.msg }}</span>
        </div>
        <div v-if="!log.length" class="text-green-400">
          Awaiting colony data...
        </div>
      </div>
    </div>
  </div>
</template>
