<script setup>
const props = defineProps({
  log: Array,
  minimal: { type: Boolean, default: false },
})
const logEl = ref(null)
watch(
  () => props.log?.length || 0,
  () => {
    nextTick(() => {
      if (logEl.value) {
        logEl.value.scrollTop = logEl.value.scrollHeight
      }
    })
  },
)
</script>
<template>
  <div
    :class="[
      'flex h-full min-h-0 flex-col',
      props.minimal ? 'gap-1 p-1.5' : 'gap-2 p-2',
    ]"
  >
    <h3 v-if="!props.minimal" class="uppercase">Logs</h3>

    <div
      :class="[
        'min-h-0 flex-1 overflow-hidden',
        props.minimal ? '' : 'bg-muted/35 border-default/60 rounded-md border',
      ]"
    >
      <div
        ref="logEl"
        :class="[
          'scrollbar-dark h-full overflow-y-auto',
          props.minimal ? 'px-1 py-0.5' : 'p-1.5',
        ]"
      >
        <div
          v-for="entry in log"
          :key="entry.id"
          class="border-default/70 flex items-center gap-1.5 border-b py-px"
        >
          <UBadge
            v-if="entry.tick != null"
            size="sm"
            color="neutral"
            variant="subtle"
            class="tabular-nums"
            :label="`T${entry.tick}`"
          />
          <span
            :class="[
              'min-w-0 truncate',
              entry.severity === 'normal'
                ? 'text-success'
                : entry.severity === 'warning'
                  ? 'text-warning'
                  : 'text-error',
            ]"
          >
            {{ entry.msg }}
          </span>
        </div>
        <div v-if="!log.length" class="text-success">
          Awaiting colony data...
        </div>
      </div>
    </div>
  </div>
</template>
