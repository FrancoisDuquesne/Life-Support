<script setup>
const props = defineProps({
  state: Object,
  onReset: Function,
  tickSpeed: Number,
  onSetSpeed: Function,
  onManualTick: Function,
  devModeAllowed: Boolean,
  devModeEnabled: Boolean,
  colorblindMode: Boolean,
})
const emit = defineEmits(['update:devModeEnabled', 'update:colorblindMode'])

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

const darkModeEnabled = computed({
  get: () => colorMode.value === 'dark',
  set: (enabled) => {
    colorMode.preference = enabled ? 'dark' : 'light'
  },
})

const devModeModel = computed({
  get: () => !!props.devModeEnabled,
  set: (enabled) => emit('update:devModeEnabled', !!enabled),
})

const colorblindModel = computed({
  get: () => !!props.colorblindMode,
  set: (enabled) => emit('update:colorblindMode', !!enabled),
})
</script>

<template>
  <div>
    <header
      class="border-default/70 glass-panel z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5"
    >
      <img
        src="/life-support-logo.svg"
        alt="Life Support"
        class="h-7 w-auto shrink-0 sm:h-8 md:h-9 dark:hidden"
      />
      <img
        src="/life-support-logo-light.svg"
        alt=""
        aria-hidden="true"
        class="hidden h-7 w-auto shrink-0 sm:h-8 md:h-9 dark:block"
      />
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
        <USeparator orientation="vertical" class="mx-2 h-5 opacity-50" />
        <UButton
          color="neutral"
          icon="i-mdi-menu"
          variant="soft"
          @click="showSettings = true"
        />
      </div>
    </header>

    <UModal v-model:open="showSettings" title="Settings">
      <template #body>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm">Dark mode</span>
          <USwitch v-model="darkModeEnabled" />
        </div>
        <div class="mt-3 flex items-center justify-between gap-3">
          <span class="text-sm">Colorblind mode</span>
          <USwitch v-model="colorblindModel" />
        </div>
        <div
          v-if="devModeAllowed"
          class="mt-3 flex items-center justify-between gap-3"
        >
          <span class="text-sm">Developer preset</span>
          <USwitch v-model="devModeModel" />
        </div>
      </template>
    </UModal>
  </div>
</template>
