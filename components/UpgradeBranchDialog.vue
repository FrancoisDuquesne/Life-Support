<script setup>
const props = defineProps({
  open: { type: Boolean, default: false },
  options: { type: Object, default: null },
})

const emit = defineEmits(['close', 'choose'])

const buildingName = computed(() => {
  if (!props.options?.building) return ''
  return (props.options.building.type || '').replace(/_/g, ' ')
})
</script>
<template>
  <UModal :open="open" @close="emit('close')" title="Choose Upgrade Path">
    <template #body>
      <div v-if="options" class="flex flex-col gap-3">
        <p class="text-muted text-sm">
          Upgrading
          <span class="text-highlighted font-semibold">{{ buildingName }}</span>
          to Level {{ options.level }}
        </p>
        <div class="grid grid-cols-2 gap-3">
          <UCard
            v-for="branch in options.branches"
            :key="branch.id"
            class="cursor-pointer transition-shadow hover:shadow-md"
            :ui="{ body: 'p-3 sm:p-3' }"
            @click="emit('choose', branch.id)"
          >
            <div class="flex flex-col gap-1.5">
              <h4 class="text-highlighted text-sm font-bold">
                {{ branch.name }}
              </h4>
              <p class="text-muted text-xs leading-snug">{{ branch.desc }}</p>
              <div class="mt-1 flex flex-wrap gap-1">
                <UBadge
                  v-if="branch.prodMult > 1"
                  color="success"
                  variant="subtle"
                  size="xs"
                  :label="`+${Math.round((branch.prodMult - 1) * 100)}% prod`"
                />
                <UBadge
                  v-if="branch.consMult < 1"
                  color="primary"
                  variant="subtle"
                  size="xs"
                  :label="`-${Math.round((1 - branch.consMult) * 100)}% consumption`"
                />
                <UBadge
                  v-if="branch.dustImmune"
                  color="warning"
                  variant="subtle"
                  size="xs"
                  label="Dust immune"
                />
                <UBadge
                  v-if="branch.bonusProduction"
                  color="success"
                  variant="subtle"
                  size="xs"
                  :label="
                    Object.entries(branch.bonusProduction)
                      .map(([r, a]) => `+${a} ${r}/t`)
                      .join(', ')
                  "
                />
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          color="neutral"
          variant="soft"
          label="Cancel"
          @click="emit('close')"
        />
      </div>
    </template>
  </UModal>
</template>
