<script setup>
const props = defineProps({
  state: Object
})
</script>

<template>
  <UCard class="min-w-[140px] max-md:min-w-0" :ui="{ body: 'p-1.5 sm:p-1.5' }">
    <div class="flex items-center gap-2">
      <span class="text-[0.6rem] uppercase tracking-[1.5px] text-stone-500">Colonists</span>
      <span class="text-sm font-bold text-stone-900 whitespace-nowrap">
        {{ state ? state.population : 0 }} / {{ state ? state.populationCapacity : 0 }}
      </span>
    </div>
  </UCard>
</template>
