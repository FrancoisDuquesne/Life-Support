<script setup>
const props = defineProps({
  state: Object,
  onReset: Function,
  tickSpeed: Number,
  onSetSpeed: Function,
  onManualTick: Function
})

const SPEEDS = [
  { label: '1x', ms: 5000 },
  { label: '2x', ms: 2500 },
  { label: '5x', ms: 1000 },
  { label: '10x', ms: 500 }
]

function isActive(ms) {
  return props.tickSpeed === ms
}
</script>

<template>
  <header class="header">
    <h1>{{ state ? state.name : 'Life Support' }}</h1>
    <div class="header-info">
      <span class="tick-counter">T{{ state ? state.tickCount : 0 }}</span>
      <div class="speed-controls">
        <button v-for="s in SPEEDS" :key="s.ms"
                :class="['btn', 'btn-speed', { active: isActive(s.ms) }]"
                @click="onSetSpeed(s.ms)">{{ s.label }}</button>
        <button class="btn btn-next" @click="onManualTick" title="Advance one tick">Next</button>
      </div>
      <span :class="['status-badge', state && state.alive ? 'alive' : 'dead']">
        {{ state && state.alive ? 'Online' : 'Collapsed' }}
      </span>
      <button class="btn btn-danger" @click="onReset">Reset</button>
    </div>
  </header>
</template>

<style scoped>
.header {
  position: absolute;
  top: 0;
  left: 0;
  right: 280px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(214,207,196,0.5);
  background: rgba(0,0,0,0.50);
  backdrop-filter: blur(12px);
}
.header h1 {
  font-size: 1rem;
  color: rgba(255,255,255,0.9);
  letter-spacing: 2px;
  text-transform: uppercase;
}
.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.tick-counter {
  color: rgba(255,255,255,0.55);
  font-size: .8rem;
}
.speed-controls {
  display: flex;
  gap: 3px;
  align-items: center;
}
.btn-speed {
  padding: 3px 8px;
  font-size: .65rem;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.6);
}
.btn-speed:hover {
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.85);
  border-color: rgba(255,255,255,0.25);
}
.btn-speed.active {
  background: rgba(37,99,235,0.3);
  border-color: rgba(37,99,235,0.5);
  color: rgba(255,255,255,0.9);
}
.btn-next {
  padding: 3px 8px;
  font-size: .65rem;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.6);
  margin-left: 2px;
}
.btn-next:hover {
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.85);
  border-color: rgba(255,255,255,0.25);
}
.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: .7rem;
  font-weight: bold;
  text-transform: uppercase;
}
.status-badge.alive {
  background: rgba(34,197,94,.15);
  color: var(--success);
  border: 1px solid rgba(34,197,94,.3);
}
.status-badge.dead {
  background: rgba(239,68,68,.15);
  color: var(--danger);
  border: 1px solid rgba(239,68,68,.3);
}

@media (max-width: 768px) {
  .header h1 { font-size: .85rem }
  .header { right: 0 }
}
</style>
