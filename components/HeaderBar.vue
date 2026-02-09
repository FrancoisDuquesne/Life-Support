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
  <header class="absolute top-0 left-0 right-0 z-20 flex items-center justify-between flex-wrap gap-3 px-4 py-2.5 border-b border-slate-700/30 glass-panel">
    <h1 class="text-base text-cyan-400/90 tracking-[3px] uppercase">{{ state ? state.name : 'Life Support' }}</h1>
    <div class="flex items-center gap-3 flex-wrap">
      <span class="text-slate-500 text-xs">T{{ state ? state.tickCount : 0 }}</span>
      <UButtonGroup size="xs">
        <UButton
          v-for="s in SPEEDS"
          :key="s.ms"
          :variant="isActive(s.ms) ? 'solid' : 'ghost'"
          :color="isActive(s.ms) ? 'primary' : 'neutral'"
          class="!text-[0.65rem]"
          @click="onSetSpeed(s.ms)"
        >{{ s.label }}</UButton>
        <UButton variant="ghost" color="neutral" class="!text-[0.65rem]" @click="onManualTick">Next</UButton>
      </UButtonGroup>
      <UBadge
        :color="state && state.alive ? 'success' : 'error'"
        variant="subtle"
        size="sm"
        class="uppercase tracking-wide font-bold"
      >
        {{ state && state.alive ? 'Online' : 'Collapsed' }}
      </UBadge>
      <UButton color="error" variant="soft" size="xs" @click="onReset">Reset</UButton>
    </div>
  </header>
</template>
