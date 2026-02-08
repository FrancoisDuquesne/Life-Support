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
  <div class="event-log-section">
    <div class="build-panel-title">Event Log</div>
    <div class="event-log" ref="logEl">
      <div v-for="entry in log" :key="entry.id" :class="['log-entry', entry.severity]">
        <span v-if="entry.tick != null" class="log-tick">[T{{ entry.tick }}]</span>
        <span class="log-msg">{{ entry.msg }}</span>
      </div>
      <div v-if="!log.length" class="log-entry normal">
        <span class="log-msg">Awaiting colony data...</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.event-log-section {
  padding: 8px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.build-panel-title {
  font-size: .65rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}
.event-log {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
  flex: 1;
  overflow-y: auto;
  font-size: .65rem;
  min-height: 100px;
}
.event-log::-webkit-scrollbar { width: 4px }
.event-log::-webkit-scrollbar-track { background: transparent }
.event-log::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px }
.log-entry {
  padding: 1px 0;
  border-bottom: 1px solid rgba(0,0,0,.06);
}
.log-entry .log-tick { color: var(--text-dim); margin-right: 6px }
.log-entry.normal .log-msg { color: var(--success) }
.log-entry.warning .log-msg { color: var(--warning) }
.log-entry.collapse .log-msg { color: var(--danger); font-weight: bold }
</style>
