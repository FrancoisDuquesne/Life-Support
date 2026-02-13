<script setup>
import { ROLES } from '~/utils/colonistEngine'

const props = defineProps({
  availableMissions: { type: Array, default: () => [] },
  activeMissions: { type: Array, default: () => [] },
  tickCount: { type: Number, default: 0 },
})

const emit = defineEmits(['launch'])

const selectedMission = ref(null)
const selectedColonists = ref([])

function selectMission(mission) {
  selectedMission.value = mission
  selectedColonists.value = []
}

function toggleColonist(id) {
  const idx = selectedColonists.value.indexOf(id)
  if (idx >= 0) {
    selectedColonists.value = selectedColonists.value.filter((c) => c !== id)
  } else if (
    selectedColonists.value.length <
    (selectedMission.value?.requiredColonists || 1)
  ) {
    selectedColonists.value = [...selectedColonists.value, id]
  }
}

function launchMission() {
  if (!selectedMission.value) return
  if (selectedColonists.value.length < selectedMission.value.requiredColonists)
    return
  emit('launch', {
    typeId: selectedMission.value.id,
    colonistIds: [...selectedColonists.value],
  })
  selectedMission.value = null
  selectedColonists.value = []
}

function cancelSelection() {
  selectedMission.value = null
  selectedColonists.value = []
}

function missionProgress(mission) {
  const total = mission.endTick - mission.startTick
  const elapsed = props.tickCount - mission.startTick
  return Math.min(100, Math.round((elapsed / total) * 100))
}

function missionTimeLeft(mission) {
  return Math.max(0, mission.endTick - props.tickCount)
}
</script>
<template>
  <div class="flex flex-col gap-2 p-2">
    <!-- Active Missions -->
    <div v-if="activeMissions.length > 0">
      <h4 class="text-muted mb-1 text-xs font-semibold uppercase">
        Active Missions
      </h4>
      <div class="flex flex-col gap-1">
        <div
          v-for="m in activeMissions"
          :key="m.id"
          class="bg-default/50 border-default/50 rounded-md border p-2"
        >
          <div class="flex items-center justify-between">
            <span class="text-highlighted text-xs font-semibold">{{
              m.type.replace(/_/g, ' ')
            }}</span>
            <span class="text-muted text-[10px] tabular-nums"
              >{{ missionTimeLeft(m) }}t left</span
            >
          </div>
          <UProgress
            :model-value="missionProgress(m)"
            color="primary"
            size="xs"
            class="mt-1"
          />
        </div>
      </div>
    </div>

    <!-- Mission Selection -->
    <div v-if="!selectedMission">
      <h4 class="text-muted mb-1 text-xs font-semibold uppercase">
        Available Missions
      </h4>
      <div v-if="availableMissions.length === 0" class="text-muted text-xs">
        No missions available (need more free colonists)
      </div>
      <div class="flex flex-col gap-1">
        <UCard
          v-for="m in availableMissions"
          :key="m.id"
          class="cursor-pointer transition-shadow hover:shadow-sm"
          :ui="{ body: 'p-2 sm:p-2' }"
          @click="selectMission(m)"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
              <div class="text-highlighted text-xs font-semibold">
                {{ m.name }}
              </div>
              <div class="text-muted text-[10px] leading-snug">
                {{ m.description }}
              </div>
            </div>
            <div class="flex flex-col items-end gap-0.5">
              <UBadge
                color="neutral"
                variant="subtle"
                size="xs"
                :label="`${m.duration}t`"
              />
              <UBadge
                :color="
                  m.risk > 0.15 ? 'error' : m.risk > 0.1 ? 'warning' : 'success'
                "
                variant="subtle"
                size="xs"
                :label="`${Math.round(m.risk * 100)}% risk`"
              />
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <!-- Colonist Assignment -->
    <div v-else>
      <div class="mb-1 flex items-center justify-between">
        <h4 class="text-muted text-xs font-semibold uppercase">
          {{ selectedMission.name }}
        </h4>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          label="Back"
          @click="cancelSelection"
        />
      </div>
      <p class="text-muted mb-2 text-[10px]">
        Select {{ selectedMission.requiredColonists }} colonist{{
          selectedMission.requiredColonists > 1 ? 's' : ''
        }}
        <span v-if="selectedMission.preferredRole" class="text-primary">
          ({{ selectedMission.preferredRole }} preferred — halves injury risk)
        </span>
      </p>
      <div class="flex flex-col gap-1">
        <div
          v-for="c in selectedMission.availableColonists"
          :key="c.id"
          :class="[
            'flex cursor-pointer items-center gap-2 rounded-md border p-1.5 transition-colors',
            selectedColonists.includes(c.id)
              ? 'border-primary/60 bg-primary/10'
              : 'border-default/50 hover:bg-default/50',
          ]"
          @click="toggleColonist(c.id)"
        >
          <span
            class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
            :style="{ backgroundColor: ROLES[c.role]?.color || '#888' }"
          >
            {{ ROLES[c.role]?.abbr || '?' }}
          </span>
          <span class="text-highlighted min-w-0 flex-1 truncate text-xs">{{
            c.name
          }}</span>
          <UBadge
            v-if="c.isPreferred"
            color="success"
            variant="subtle"
            size="xs"
            label="Preferred"
          />
        </div>
      </div>
      <UButton
        color="primary"
        variant="solid"
        size="sm"
        block
        class="mt-2"
        :disabled="selectedColonists.length < selectedMission.requiredColonists"
        label="Launch Mission"
        @click="launchMission"
      />
    </div>
  </div>
</template>
