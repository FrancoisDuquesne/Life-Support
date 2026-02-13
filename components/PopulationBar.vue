<script setup>
import { ROLES } from '~/utils/colonistEngine'

const props = defineProps({
  state: Object,
  compact: { type: Boolean, default: false },
  embedded: { type: Boolean, default: false },
  showAction: { type: Boolean, default: true },
})

const pop = computed(() => (props.state ? props.state.population || 0 : 0))
const cap = computed(() =>
  props.state ? props.state.populationCapacity || 0 : 0,
)
const pct = computed(() => (cap.value > 0 ? (pop.value / cap.value) * 100 : 0))
const colonists = computed(() =>
  props.state ? props.state.colonists || [] : [],
)
const avgHealth = computed(() => (props.state ? props.state.avgHealth || 0 : 0))
const avgMorale = computed(() => (props.state ? props.state.avgMorale || 0 : 0))

const efficiency = computed(() => {
  const cols = colonists.value
  if (cols.length === 0) return 100
  let hf = 0
  let mf = 0
  for (const c of cols) {
    hf += c.health < 30 ? 0.5 : 1.0
    mf += c.morale < 20 ? 0.7 : 1.0
  }
  return Math.round((hf / cols.length) * (mf / cols.length) * 100)
})

const showDetail = ref(false)

function getInitials(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
}

function healthStatus(hp) {
  if (hp > 50) return 'success'
  if (hp > 30) return 'warning'
  return 'error'
}

function moraleStatus(m) {
  if (m > 50) return 'info'
  if (m > 20) return 'warning'
  return 'error'
}

function healthTextClass(hp) {
  if (hp > 50) return 'text-success'
  if (hp > 30) return 'text-warning'
  return 'text-error'
}

function moraleTextClass(m) {
  if (m > 50) return 'text-info'
  if (m > 20) return 'text-warning'
  return 'text-error'
}

function healthBorderClass(hp) {
  if (hp > 50) return 'border-success'
  if (hp > 30) return 'border-warning'
  return 'border-error'
}

const ROLE_CLASS_MAP = {
  ENGINEER: {
    text: 'text-resource-energy',
    bg: 'bg-resource-energy/20',
    badge: 'resource-energy',
  },
  BOTANIST: {
    text: 'text-resource-food',
    bg: 'bg-resource-food/20',
    badge: 'resource-food',
  },
  GEOLOGIST: {
    text: 'text-resource-minerals',
    bg: 'bg-resource-minerals/20',
    badge: 'resource-minerals',
  },
  MEDIC: {
    text: 'text-resource-oxygen',
    bg: 'bg-resource-oxygen/20',
    badge: 'resource-oxygen',
  },
  GENERAL: {
    text: 'text-primary',
    bg: 'bg-primary/20',
    badge: 'primary',
  },
}

function roleClasses(role) {
  return ROLE_CLASS_MAP[role] || ROLE_CLASS_MAP.GENERAL
}

const visibleDots = computed(() => colonists.value.slice(0, 8))
const overflowCount = computed(() => Math.max(0, colonists.value.length - 8))

const ROLE_EFFECTS = {
  ENGINEER: '+10%/colonist to Solar Panel, RTG, Repair Station',
  BOTANIST: '+10%/colonist to Farm, O2 Generator',
  GEOLOGIST: '+10%/colonist to Mine, Water Extractor',
  MEDIC: '+0.5 HP/tick healing to all colonists',
  GENERAL: '+3%/colonist to all building production',
}

const roleSummary = computed(() => {
  const counts = {}
  for (const c of colonists.value) {
    counts[c.role] = (counts[c.role] || 0) + 1
  }
  return Object.entries(counts).map(([role, count]) => ({
    role,
    count,
    name: ROLES[role] ? ROLES[role].name : role,
    badge: roleClasses(role).badge,
    effect: ROLE_EFFECTS[role] || '',
  }))
})

const growthBlockers = computed(() => {
  const s = props.state
  if (!s || !s.alive) return []
  const blockers = []
  const res = s.resources || {}
  if ((s.population || 0) >= (s.populationCapacity || 10)) blockers.push('At capacity')
  if ((res.food || 0) <= 20) blockers.push('Food ≤ 20')
  if ((res.water || 0) <= 20) blockers.push('Water ≤ 20')
  if ((res.oxygen || 0) <= 10) blockers.push('Oxygen ≤ 10')
  if ((s.waste || 0) > (s.wasteCapacity || 50)) blockers.push('Waste overflow')
  if ((s.avgMorale || 100) <= 40) blockers.push('Low morale')
  return blockers
})

const statBadgeVariant = computed(() => (props.embedded ? 'solid' : 'subtle'))

function openDetail() {
  showDetail.value = true
}

defineExpose({ openDetail })
</script>
<template>
  <!-- Compact mode: inline text for mobile -->
  <div
    v-if="compact"
    class="flex cursor-pointer items-center gap-1 whitespace-nowrap"
    @click="showDetail = true"
  >
    <UBadge color="primary" variant="subtle" size="xs" label="Pop" />
    <UBadge
      color="neutral"
      variant="subtle"
      size="xs"
      class="tabular-nums"
      :label="`${pop}/${cap}`"
    />
    <UBadge
      color="neutral"
      variant="outline"
      size="xs"
      class="tabular-nums"
      :label="`E:${efficiency}%`"
    />
  </div>
  <!-- Full mode -->
  <div
    v-else
    :class="
      props.embedded
        ? ''
        : 'bg-muted/35 border-default/60 rounded-md border p-1.5'
    "
  >
    <div class="flex items-center justify-between">
      <UBadge
        v-if="!props.embedded"
        color="primary"
        variant="subtle"
        size="sm"
        label="Colonists"
      />
      <div class="flex items-center gap-1">
        <UBadge
          v-if="props.embedded"
          color="primary"
          variant="solid"
          size="sm"
          label="POP"
        />
        <UBadge
          color="neutral"
          :variant="props.embedded ? 'soft' : 'subtle'"
          size="sm"
          class="font-bold tabular-nums"
          :label="`${pop}/${cap}`"
        />
      </div>
    </div>
    <!-- Capacity bar -->
    <UProgress class="mt-1" :model-value="pct" color="primary" size="xs" />
    <!-- Efficiency + stats -->
    <div class="text-muted mt-1.5 flex flex-wrap items-center gap-1.5">
      <UBadge
        size="sm"
        color="neutral"
        :variant="statBadgeVariant"
        class="tabular-nums"
        :label="`EFF ${efficiency}%`"
      />
      <UBadge
        size="sm"
        :color="healthStatus(avgHealth)"
        :variant="statBadgeVariant"
        class="tabular-nums"
        :label="`HP ${avgHealth}`"
      />
      <UBadge
        size="sm"
        :color="moraleStatus(avgMorale)"
        :variant="statBadgeVariant"
        class="tabular-nums"
        :label="`MRL ${avgMorale}`"
      />
    </div>
    <!-- Growth blockers -->
    <div
      v-if="growthBlockers.length > 0"
      class="mt-1 text-[10px] leading-tight"
    >
      <span class="text-warning font-medium">Growth blocked:</span>
      <span class="text-muted"> {{ growthBlockers.join(', ') }}</span>
    </div>
    <!-- Colonist dots -->
    <div
      v-if="colonists.length > 0"
      class="mt-1.5 flex flex-wrap items-center gap-1"
    >
      <div
        v-for="c in visibleDots"
        :key="c.id"
        :class="[
          'flex h-6 w-8 cursor-default items-center justify-center rounded-full border-2 font-bold',
          roleClasses(c.role).bg,
          healthBorderClass(c.health),
        ]"
        :title="`${c.name} (${ROLES[c.role]?.name}) HP:${Math.round(c.health)} M:${Math.round(c.morale)}`"
      >
        {{ getInitials(c.name) }}
      </div>
      <div v-if="overflowCount > 0" class="text-muted ml-0.5 font-bold">
        +{{ overflowCount }}
      </div>
    </div>
    <UButton
      v-if="props.showAction"
      :variant="props.embedded ? 'soft' : 'ghost'"
      color="primary"
      size="xs"
      class="mt-1 w-full"
      label="View"
      @click="openDetail"
    />
  </div>
  <!-- Detail modal -->
  <UModal
    v-model:open="showDetail"
    title="Colony Crew"
    :ui="{ width: 'sm:max-w-md' }"
  >
    <template #body>
      <!-- Summary stats -->
      <div class="text-default mb-3 flex items-center gap-3">
        <span
          >Efficiency:
          <span class="text-highlighted font-bold"
            >{{ efficiency }}%</span
          ></span
        >
        <span
          >Avg HP:
          <span :class="['font-bold', healthTextClass(avgHealth)]">{{
            avgHealth
          }}</span></span
        >
        <span
          >Avg Morale:
          <span :class="['font-bold', moraleTextClass(avgMorale)]">{{
            avgMorale
          }}</span></span
        >
      </div>
      <!-- Colonist list -->
      <div class="scrollbar-dark max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
        <div
          v-for="c in colonists"
          :key="c.id"
          class="bg-muted border-default/70 rounded-md border p-2"
        >
          <div class="flex items-start gap-2">
            <!-- Role-colored dot with initials -->
            <div
              :class="[
                'flex h-6 w-8 shrink-0 items-center justify-center rounded-full font-bold',
                roleClasses(c.role).bg,
              ]"
            >
              {{ getInitials(c.name) }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="text-highlighted truncate font-medium">{{
                  c.name
                }}</span>
                <UBadge
                  size="xs"
                  variant="subtle"
                  :color="roleClasses(c.role).badge"
                  class="shrink-0"
                  :label="ROLES[c.role]?.abbr || c.role"
                />
                <UBadge
                  v-if="c.health < 30"
                  color="error"
                  variant="subtle"
                  size="xs"
                  class="shrink-0"
                  label="CRITICAL"
                />
                <UBadge
                  v-if="c.morale < 20"
                  color="warning"
                  variant="subtle"
                  size="xs"
                  class="shrink-0"
                  label="MUTINOUS"
                />
              </div>
              <!-- Health bar -->
              <div class="mt-1 flex items-center gap-1.5">
                <span class="text-muted w-6">HP</span>
                <UProgress
                  class="flex-1"
                  :model-value="c.health"
                  :color="healthStatus(c.health)"
                  size="xs"
                />
                <span
                  :class="[
                    'w-5 text-right tabular-nums',
                    healthTextClass(c.health),
                  ]"
                  >{{ Math.round(c.health) }}</span
                >
              </div>
              <!-- Morale bar -->
              <div class="mt-0.5 flex items-center gap-1.5">
                <span class="text-muted w-6">MRL</span>
                <UProgress
                  class="flex-1"
                  :model-value="c.morale"
                  :color="moraleStatus(c.morale)"
                  size="xs"
                />
                <span
                  :class="[
                    'w-5 text-right tabular-nums',
                    moraleTextClass(c.morale),
                  ]"
                  >{{ Math.round(c.morale) }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- Role bonus summary -->
      <div class="border-default/70 mt-3 border-t pt-2">
        <USeparator label="Role Bonuses" class="mb-2" />
        <div class="flex flex-col gap-1.5">
          <div
            v-for="rs in roleSummary"
            :key="rs.role"
            class="flex items-start gap-2"
          >
            <UBadge
              variant="subtle"
              :color="rs.badge"
              :label="`${rs.count}x ${rs.name}`"
              class="shrink-0"
            />
            <span class="text-muted text-xs leading-snug">{{ rs.effect }}</span>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
