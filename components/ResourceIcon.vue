<script setup>
const props = defineProps({
  resource: { type: String, required: true },
  size: { type: String, default: 'sm' },
})

const key = computed(() => String(props.resource || '').toLowerCase())

const labelMap = {
  energy: 'Energy',
  food: 'Food',
  water: 'Water',
  minerals: 'Minerals',
  oxygen: 'Oxygen',
}

const colorClassMap = {
  energy: 'text-resource-energy',
  food: 'text-resource-food',
  water: 'text-resource-water',
  minerals: 'text-resource-minerals',
  oxygen: 'text-resource-oxygen',
}

const label = computed(() => labelMap[key.value] || props.resource)
const colorClass = computed(() => colorClassMap[key.value] || 'text-muted')

const sizeClassMap = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
}

const sizeClass = computed(() => sizeClassMap[props.size] || sizeClassMap.sm)
</script>

<template>
  <UTooltip :text="label">
    <span
      :class="[
        'inline-flex shrink-0 items-center justify-center',
        colorClass,
        sizeClass,
      ]"
      aria-hidden="true"
    >
      <svg
        v-if="key === 'energy'"
        viewBox="0 0 24 24"
        fill="none"
        class="h-full w-full"
      >
        <path
          d="M13 2L5 13h6l-1 9 9-13h-6l0-7z"
          fill="currentColor"
          stroke="currentColor"
          stroke-linejoin="round"
          stroke-width="1"
        />
      </svg>

      <svg
        v-else-if="key === 'food'"
        viewBox="0 0 24 24"
        fill="none"
        class="h-full w-full"
      >
        <path
          d="M20 4c-6 0-9 4-9 9 0 4 3 7 7 7 5 0 9-3 9-9V4h-7z"
          transform="translate(-3)"
          fill="currentColor"
          fill-opacity="0.18"
          stroke="currentColor"
          stroke-width="1.7"
        />
        <path
          d="M5 19c5-1 9-5 11-11"
          stroke="currentColor"
          stroke-width="1.7"
        />
      </svg>

      <svg
        v-else-if="key === 'water'"
        viewBox="0 0 24 24"
        fill="none"
        class="h-full w-full"
      >
        <path
          d="M12 3c3 4 6 7 6 10a6 6 0 1 1-12 0c0-3 3-6 6-10z"
          fill="currentColor"
          fill-opacity="0.18"
          stroke="currentColor"
          stroke-width="1.7"
        />
      </svg>

      <svg
        v-else-if="key === 'minerals'"
        viewBox="0 0 24 24"
        fill="none"
        class="h-full w-full"
      >
        <path
          d="M12 3l7 4v10l-7 4-7-4V7l7-4z"
          fill="currentColor"
          fill-opacity="0.14"
          stroke="currentColor"
          stroke-width="1.7"
        />
        <path
          d="M12 3v18M5 7l7 4 7-4"
          stroke="currentColor"
          stroke-width="1.2"
        />
      </svg>

      <svg v-else viewBox="0 0 24 24" fill="none" class="h-full w-full">
        <circle
          cx="12"
          cy="12"
          r="8"
          stroke="currentColor"
          stroke-width="1.7"
        />
        <circle
          cx="12"
          cy="12"
          r="3.2"
          fill="currentColor"
          fill-opacity="0.2"
        />
      </svg>
    </span>
  </UTooltip>
</template>
