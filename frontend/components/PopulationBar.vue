<script setup>
const props = defineProps({
  state: Object
})
</script>

<template>
  <div class="pop-row">
    <span class="pop-label">Colonists</span>
    <span class="pop-value">
      {{ state ? state.population : 0 }} / {{ state ? state.populationCapacity : 0 }}
    </span>
  </div>
</template>

<style scoped>
.pop-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(247,244,239,0.45);
  border: 1px solid rgba(214,207,196,0.5);
  border-radius: 4px;
  padding: 6px 10px;
  min-width: 140px;
}
.pop-label {
  font-size: .6rem;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  color: var(--text-dim);
}
.pop-value {
  font-size: .9rem;
  font-weight: bold;
  color: var(--text-bright);
  white-space: nowrap;
}

@media (max-width: 768px) {
  .pop-row { padding: 4px 6px }
}
</style>
