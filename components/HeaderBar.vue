<script setup>
const props = defineProps({
  state: Object,
  onReset: Function,
  tickSpeed: Number,
  onSetSpeed: Function,
  onManualTick: Function,
})

const showSettings = ref(false)
const colorMode = useColorMode()

const SPEEDS = [
  { label: '1x', ms: 5000 },
  { label: '2x', ms: 2500 },
  { label: '5x', ms: 1000 },
  { label: '10x', ms: 500 },
]

function isActive(ms) {
  return props.tickSpeed === ms
}

function toggleDarkMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div>
    <header
      class="border-default/70 glass-panel z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5"
    >
      <div class="flex items-center gap-2">
        <UButton
          color="neutral"
          icon="i-mdi-menu"
          variant="soft"
          @click="showSettings = true"
        />
        <h1 class="text-primary uppercase">
          {{ state ? state.name : 'Life Support' }}
        </h1>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span class="text-muted">T{{ state ? state.tickCount : 0 }}</span>
        <UFieldGroup>
          <UButton
            v-for="s in SPEEDS"
            :key="s.ms"
            :variant="isActive(s.ms) ? 'solid' : 'soft'"
            :color="isActive(s.ms) ? 'primary' : 'neutral'"
            :label="s.label"
            @click="onSetSpeed(s.ms)"
          />
          <UButton
            variant="soft"
            color="neutral"
            label="Next"
            icon="i-mdi-chevron-right"
            @click="onManualTick"
          />
        </UFieldGroup>
        <UBadge
          :color="state && state.alive ? 'success' : 'error'"
          variant="subtle"
          size="lg"
          :label="state && state.alive ? 'Online' : 'Collapsed'"
        />

        <UButton color="error" variant="soft" label="Reset" @click="onReset" />
      </div>
    </header>

    <UModal v-model:open="showSettings" title="Settings">
      <template #body>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm">Dark mode</span>
          <UButton
            color="neutral"
            variant="soft"
            size="sm"
            :label="colorMode.value === 'dark' ? 'Disable' : 'Enable'"
            @click="toggleDarkMode"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
