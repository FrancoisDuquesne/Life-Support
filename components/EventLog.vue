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
  <div class="p-2 flex-1 flex flex-col min-h-0">
    <div class="text-[0.65rem] text-stone-500 uppercase tracking-[2px] mb-1.5 pb-1 border-b border-stone-300">Event Log</div>
    <UCard class="flex-1 min-h-[100px] overflow-hidden" :ui="{ body: 'p-0 sm:p-0' }">
      <div ref="logEl" class="p-1.5 overflow-y-auto h-full text-[0.65rem] scrollbar-thin scrollbar-thumb-stone-300">
        <div v-for="entry in log" :key="entry.id"
             class="py-px border-b border-black/[0.06]">
          <span v-if="entry.tick != null" class="text-stone-500 mr-1.5">[T{{ entry.tick }}]</span>
          <span :class="[
            entry.severity === 'normal' ? 'text-green-600' : '',
            entry.severity === 'warning' ? 'text-yellow-600' : '',
            entry.severity === 'collapse' ? 'text-red-600 font-bold' : ''
          ]">{{ entry.msg }}</span>
        </div>
        <div v-if="!log.length" class="text-green-600">
          Awaiting colony data...
        </div>
      </div>
    </UCard>
  </div>
</template>
