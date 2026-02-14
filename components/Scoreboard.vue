<script setup>
const props = defineProps({
  scores: { type: Array, default: () => [] },
  tickCount: { type: Number, default: 0 },
  victoryTick: { type: Number, default: 200 },
  isGameOver: { type: Boolean, default: false },
  winner: { type: Object, default: null },
})

const tickProgress = computed(() => {
  if (props.victoryTick <= 0) return 100
  return Math.min(100, Math.round((props.tickCount / props.victoryTick) * 100))
})

const maxTerritory = computed(() => {
  return Math.max(1, ...props.scores.map((s) => s.territoryHexes || 0))
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <!-- Timer -->
    <div class="flex items-center justify-between text-xs">
      <span class="text-muted tracking-wide uppercase">Tick</span>
      <span class="text-highlighted font-bold tabular-nums">
        {{ tickCount }} / {{ victoryTick }}
      </span>
    </div>
    <div class="bg-default h-1.5 overflow-hidden rounded-full">
      <div
        class="bg-primary h-full rounded-full transition-all duration-500"
        :style="{ width: tickProgress + '%' }"
      />
    </div>

    <!-- Faction rows -->
    <div
      v-for="(faction, idx) in scores"
      :key="faction.id"
      :class="[
        'flex items-center gap-2 rounded-md border px-2 py-1.5',
        idx === 0 ? 'border-primary/40 bg-primary/5' : 'border-default',
        !faction.alive ? 'opacity-40' : '',
      ]"
    >
      <!-- Color dot -->
      <span
        class="h-3 w-3 shrink-0 rounded-full"
        :style="{ backgroundColor: faction.color }"
      />
      <!-- Name + rank -->
      <div class="min-w-0 flex-1">
        <div class="text-highlighted flex items-center gap-1 text-xs font-bold">
          <span class="truncate">{{ faction.name }}</span>
          <span v-if="!faction.isAI" class="text-primary text-xs">(You)</span>
          <span v-if="!faction.alive" class="text-error text-xs font-normal">
            Collapsed
          </span>
        </div>
        <div class="text-muted flex gap-2 text-xs tabular-nums">
          <span>Pop {{ faction.population }}</span>
          <span>Bldg {{ faction.buildings }}</span>
        </div>
      </div>
      <!-- Territory bar -->
      <div class="flex w-16 flex-col items-end gap-0.5">
        <span class="text-highlighted text-xs font-bold tabular-nums">
          {{ faction.score }}
        </span>
        <div class="bg-default h-1 w-full overflow-hidden rounded-full">
          <div
            class="h-full rounded-full"
            :style="{
              width:
                Math.round(
                  ((faction.territoryHexes || 0) / maxTerritory) * 100,
                ) + '%',
              backgroundColor: faction.color,
            }"
          />
        </div>
      </div>
    </div>

    <!-- Victory banner -->
    <div
      v-if="isGameOver && winner"
      class="border-primary/50 bg-primary/10 mt-1 rounded-md border p-2 text-center"
    >
      <div class="text-primary text-sm font-bold tracking-wide uppercase">
        {{ winner.name }} wins!
      </div>
      <div class="text-muted text-xs">Score: {{ winner.score }}</div>
    </div>
  </div>
</template>
