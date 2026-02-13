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
const emit = defineEmits([
  'update:devModeEnabled',
  'update:colorblindMode',
  'settingsOpen',
  'settingsClose',
])

const showSettings = ref(false)

watch(showSettings, (open) => {
  emit(open ? 'settingsOpen' : 'settingsClose')
})
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

const currentSpeedLabel = computed(() => {
  const match = SPEEDS.find((s) => s.ms === props.tickSpeed)
  return match ? match.label : '1x'
})

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

const confirmReset = ref(false)
function handleReset() {
  confirmReset.value = false
  showSettings.value = false
  if (props.onReset) props.onReset()
}
</script>

<template>
  <div>
    <header
      class="border-default/70 glass-panel z-20 flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5"
    >
      <img
        src="/life-support-logo.svg"
        alt="Life Support"
        class="h-6 w-auto shrink-0 sm:h-7 dark:hidden"
      />
      <img
        src="/life-support-logo-light.svg"
        alt=""
        aria-hidden="true"
        class="hidden h-6 w-auto shrink-0 sm:h-7 dark:block"
      />
      <div class="flex items-center gap-2">
        <span class="text-muted text-sm tabular-nums"
          >T{{ state ? state.tickCount : 0 }}</span
        >
        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
          :label="currentSpeedLabel"
          class="max-md:hidden"
        />
        <UBadge
          :color="state && state.alive ? 'success' : 'error'"
          variant="subtle"
          size="sm"
          :label="state && state.alive ? 'Online' : 'Collapsed'"
        />
        <UButton
          color="neutral"
          icon="i-mdi-menu"
          variant="soft"
          size="xs"
          @click="showSettings = true"
        />
      </div>
    </header>

    <UModal v-model:open="showSettings" title="Settings">
      <template #body>
        <!-- Game Speed -->
        <div class="mb-4">
          <h4 class="text-muted mb-2 text-xs font-medium tracking-wider">
            GAME SPEED
          </h4>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-for="s in SPEEDS"
              :key="s.ms"
              :variant="isActive(s.ms) ? 'solid' : 'soft'"
              :color="isActive(s.ms) ? 'primary' : 'neutral'"
              :label="s.label"
              size="sm"
              @click="onSetSpeed(s.ms)"
            />
            <UButton
              variant="soft"
              color="neutral"
              label="Next"
              icon="i-mdi-chevron-right"
              size="sm"
              @click="onManualTick"
            />
          </div>
        </div>

        <USeparator class="my-3" />

        <!-- Display Settings -->
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm">Dark mode</span>
            <USwitch v-model="darkModeEnabled" />
          </div>
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm">Colorblind mode</span>
            <USwitch v-model="colorblindModel" />
          </div>
          <div
            v-if="devModeAllowed"
            class="flex items-center justify-between gap-3"
          >
            <span class="text-sm">Developer preset</span>
            <USwitch v-model="devModeModel" />
          </div>
        </div>

        <USeparator class="my-3" />

        <!-- Reset -->
        <div>
          <template v-if="!confirmReset">
            <UButton
              color="error"
              variant="soft"
              label="Reset Colony"
              block
              @click="confirmReset = true"
            />
          </template>
          <template v-else>
            <p class="text-error mb-2 text-center text-xs font-medium">
              Are you sure? This will delete your save.
            </p>
            <div class="flex gap-2">
              <UButton
                color="neutral"
                variant="soft"
                label="Cancel"
                class="flex-1"
                @click="confirmReset = false"
              />
              <UButton
                color="error"
                variant="solid"
                label="Confirm Reset"
                class="flex-1"
                @click="handleReset"
              />
            </div>
          </template>
        </div>
      </template>
    </UModal>
  </div>
</template>
