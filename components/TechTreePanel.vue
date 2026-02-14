<script setup>
import { TECHS, TECH_BRANCHES } from '~/utils/techTree'

const props = defineProps({
  open: { type: Boolean, default: false },
  unlockedTechs: { type: Array, default: () => [] },
  techStatuses: { type: Object, default: () => ({}) },
  researchPoints: { type: Number, default: 0 },
})

const emit = defineEmits(['close', 'research'])

const branchTechs = computed(() => {
  const branches = {}
  for (const branch of TECH_BRANCHES) {
    branches[branch.id] = TECHS.filter((t) => t.branch === branch.id).sort(
      (a, b) => a.tier - b.tier,
    )
  }
  return branches
})

const capstoneTechs = computed(() =>
  TECHS.filter((t) => t.branch === 'capstone'),
)

function statusClass(techId) {
  const status = props.techStatuses[techId]
  if (status === 'unlocked') return 'border-success/60 bg-success/10'
  if (status === 'available' && props.researchPoints >= techCost(techId))
    return 'border-primary ring-primary/30 ring-2 cursor-pointer'
  if (status === 'available') return 'border-default opacity-70'
  return 'border-default/50 opacity-40'
}

function techCost(techId) {
  const tech = TECHS.find((t) => t.id === techId)
  return tech?.cost || 0
}

function canClick(techId) {
  return (
    props.techStatuses[techId] === 'available' &&
    props.researchPoints >= techCost(techId)
  )
}

function onTechClick(techId) {
  if (canClick(techId)) emit('research', techId)
}

function prereqLabel(tech) {
  const status = props.techStatuses[tech.id]
  if (status === 'unlocked') return null
  if (status === 'locked') {
    if (tech.requiresAnyT3Count) {
      const unlockedT3 = TECHS.filter(
        (t) => t.tier === 3 && props.unlockedTechs.includes(t.id),
      ).length
      return `Requires ${tech.requiresAnyT3Count} tier-3 techs (${unlockedT3}/${tech.requiresAnyT3Count})`
    }
    const missing = tech.requires.filter(
      (r) => !props.unlockedTechs.includes(r),
    )
    const names = missing.map((r) => TECHS.find((t) => t.id === r)?.name || r)
    return `Requires: ${names.join(', ')}`
  }
  return null
}
</script>

<template>
  <UModal :open="open" @close="emit('close')" title="Research">
    <template #body>
      <div class="flex flex-col gap-4">
        <!-- Current research points -->
        <div class="flex items-center gap-2 text-sm">
          <span class="text-muted">Available research:</span>
          <span class="text-primary font-bold tabular-nums">
            {{ Math.floor(researchPoints) }}
          </span>
        </div>

        <!-- Branch columns -->
        <div class="grid grid-cols-3 gap-3">
          <div
            v-for="branch in TECH_BRANCHES"
            :key="branch.id"
            class="flex flex-col gap-2"
          >
            <!-- Branch header -->
            <div class="text-center text-xs font-bold tracking-wider uppercase">
              <span :style="{ color: branch.color }">{{ branch.name }}</span>
            </div>

            <!-- Tier techs -->
            <div
              v-for="tech in branchTechs[branch.id]"
              :key="tech.id"
              :class="[
                'relative rounded-md border p-2 transition-all',
                statusClass(tech.id),
              ]"
              @click="onTechClick(tech.id)"
            >
              <!-- Connector line -->
              <div
                v-if="tech.tier > 1"
                class="bg-default/60 absolute -top-2 left-1/2 h-2 w-px"
              />

              <div class="flex items-start justify-between gap-1">
                <div class="text-highlighted text-xs leading-tight font-bold">
                  {{ tech.name }}
                </div>
                <UBadge
                  v-if="techStatuses[tech.id] === 'unlocked'"
                  color="success"
                  variant="subtle"
                  size="xs"
                  label="Done"
                />
              </div>
              <div class="text-muted mt-0.5 text-xs leading-tight">
                {{ tech.description }}
              </div>
              <div
                v-if="techStatuses[tech.id] !== 'unlocked'"
                class="mt-1 flex items-center gap-1"
              >
                <ResourceIcon resource="research" size="xs" />
                <span
                  class="text-xs font-medium tabular-nums"
                  :class="
                    researchPoints >= tech.cost ? 'text-primary' : 'text-muted'
                  "
                >
                  {{ tech.cost }}
                </span>
              </div>
              <div
                v-if="prereqLabel(tech)"
                class="text-warning mt-0.5 text-xs leading-tight"
              >
                {{ prereqLabel(tech) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Capstones -->
        <div v-if="capstoneTechs.length > 0">
          <div
            class="text-muted mb-2 text-center text-xs font-bold tracking-wider uppercase"
          >
            Capstones
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div
              v-for="tech in capstoneTechs"
              :key="tech.id"
              :class="[
                'rounded-md border p-2 transition-all',
                statusClass(tech.id),
              ]"
              @click="onTechClick(tech.id)"
            >
              <div class="flex items-start justify-between gap-1">
                <div class="text-highlighted text-xs leading-tight font-bold">
                  {{ tech.name }}
                </div>
                <UBadge
                  v-if="techStatuses[tech.id] === 'unlocked'"
                  color="success"
                  variant="subtle"
                  size="xs"
                  label="Done"
                />
              </div>
              <div class="text-muted mt-0.5 text-xs leading-tight">
                {{ tech.description }}
              </div>
              <div
                v-if="techStatuses[tech.id] !== 'unlocked'"
                class="mt-1 flex items-center gap-1"
              >
                <ResourceIcon resource="research" size="xs" />
                <span
                  class="text-xs font-medium tabular-nums"
                  :class="
                    researchPoints >= tech.cost ? 'text-primary' : 'text-muted'
                  "
                >
                  {{ tech.cost }}
                </span>
              </div>
              <div
                v-if="prereqLabel(tech)"
                class="text-warning mt-0.5 text-xs leading-tight"
              >
                {{ prereqLabel(tech) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton
          color="neutral"
          variant="soft"
          label="Close"
          @click="emit('close')"
        />
      </div>
    </template>
  </UModal>
</template>
