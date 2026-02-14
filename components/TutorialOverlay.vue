<script setup>
const props = defineProps({
  step: { type: Number, required: true },
})

const emit = defineEmits(['skip', 'next'])

const steps = [
  {
    title: 'Welcome to Life Support',
    body: "Your colony has just landed on Mars. Let's walk through the basics of keeping your colonists alive.",
    action: 'Get Started',
  },
  {
    title: 'Step 1: Build a Pipeline',
    body: 'Pipelines carry resources between buildings. Place a **Pipeline** next to the landing site to start your network.',
    action: null,
  },
  {
    title: 'Step 2: Build a Solar Panel',
    body: 'Your colony needs power. Place a **Solar Panel** adjacent to a pipeline to start generating energy.',
    action: null,
  },
  {
    title: 'Step 3: Build a Farm',
    body: 'Colonists need food to survive. Place a **Hydroponic Farm** next to a pipeline.',
    action: null,
  },
  {
    title: 'Step 4: Build an O2 Generator',
    body: 'Without oxygen, your colonists will suffocate. Place an **Oxygen Generator** next to a pipeline.',
    action: null,
  },
  {
    title: 'Tutorial Complete!',
    body: "Great job! You've built the essentials. Keep an eye on your resources and expand when ready.",
    action: 'Start Playing',
  },
]

const current = computed(() => steps[props.step] || steps[0])
const totalSteps = steps.length - 1
const showCounter = computed(() => props.step >= 1 && props.step <= 4)
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center px-4"
  >
    <UCard
      class="pointer-events-auto w-full max-w-sm shadow-xl"
      :ui="{ body: 'p-3 sm:p-4' }"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <h3 class="text-highlighted text-sm leading-tight font-bold">
              {{ current.title }}
            </h3>
            <UBadge
              v-if="showCounter"
              color="primary"
              variant="subtle"
              size="xs"
              :label="`${step}/${totalSteps}`"
            />
          </div>
          <p
            class="text-muted mt-1 text-xs leading-relaxed"
            v-html="formatBody(current.body)"
          />
        </div>
        <UButton
          v-if="step < 5"
          color="neutral"
          variant="ghost"
          size="xs"
          label="Skip"
          @click="emit('skip')"
        />
      </div>
      <div v-if="current.action" class="mt-2 flex justify-end">
        <UButton
          color="primary"
          size="sm"
          :label="current.action"
          @click="emit('next')"
        />
      </div>
    </UCard>
  </div>
</template>

<script>
function formatBody(text) {
  return text.replace(
    /\*\*(.*?)\*\*/g,
    '<strong class="text-highlighted">$1</strong>',
  )
}
</script>
