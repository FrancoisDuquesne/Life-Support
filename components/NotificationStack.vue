<script setup>
const props = defineProps({
  notifications: { type: Array, default: () => [] },
})
const emit = defineEmits(['dismiss', 'openLog'])

const MAX_VISIBLE = 3

const visibleNotifications = computed(() =>
  props.notifications.slice(-MAX_VISIBLE),
)

function severityBorder(severity) {
  switch (severity) {
    case 'danger':
    case 'collapse':
      return 'border-l-red-500'
    case 'warning':
      return 'border-l-amber-500'
    default:
      return 'border-l-green-500'
  }
}

function severityIcon(severity) {
  switch (severity) {
    case 'danger':
    case 'collapse':
      return 'i-heroicons-exclamation-triangle'
    case 'warning':
      return 'i-heroicons-exclamation-circle'
    default:
      return 'i-heroicons-check-circle'
  }
}
</script>

<template>
  <div class="notification-stack">
    <TransitionGroup name="notif">
      <div
        v-for="n in visibleNotifications"
        :key="n.id"
        :class="[
          'bg-default/95 border-default/70 mb-1.5 flex items-start gap-2 rounded-md border border-l-4 px-3 py-2 shadow-md backdrop-blur-sm',
          severityBorder(n.severity),
        ]"
        @click="emit('dismiss', n.id)"
      >
        <UIcon
          :name="severityIcon(n.severity)"
          :class="[
            'mt-0.5 h-4 w-4 shrink-0',
            n.severity === 'danger' || n.severity === 'collapse'
              ? 'text-error'
              : n.severity === 'warning'
                ? 'text-warning'
                : 'text-success',
          ]"
        />
        <span class="text-default min-w-0 text-xs leading-tight">
          {{ n.msg }}
        </span>
      </div>
    </TransitionGroup>
    <UButton
      icon="i-heroicons-bell"
      color="neutral"
      variant="soft"
      size="xs"
      class="mt-1 shadow-sm"
      @click="emit('openLog')"
    />
  </div>
</template>

<style scoped>
.notification-stack {
  position: fixed;
  z-index: 45;
  max-width: 280px;
  pointer-events: auto;
}

/* Desktop: bottom-left */
@media (min-width: 768px) {
  .notification-stack {
    bottom: 1rem;
    left: 1rem;
  }
}

/* Mobile: top-right (avoid bottom build buttons) */
@media (max-width: 767px) {
  .notification-stack {
    top: calc(3.5rem + env(safe-area-inset-top, 0px));
    right: 0.5rem;
    max-width: 220px;
  }
}

.notif-enter-active {
  transition:
    transform 0.15s ease-out,
    opacity 0.15s ease-out;
}
.notif-leave-active {
  transition:
    transform 0.15s ease-in,
    opacity 0.15s ease-in;
}
.notif-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.notif-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

@media (max-width: 767px) {
  .notif-enter-from {
    transform: translateX(20px);
  }
  .notif-leave-to {
    transform: translateX(20px);
  }
}
</style>
