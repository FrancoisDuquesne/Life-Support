<script setup>
const props = defineProps({
  notification: { type: Object, default: null },
})
const emit = defineEmits(['dismiss', 'openLog'])

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
  <div class="notification-bar">
    <Transition name="notif">
      <div
        v-if="notification"
        :key="notification.msg"
        :class="[
          'bg-default/95 border-default/70 mb-1.5 flex items-start gap-2 rounded-md border border-l-4 px-3 py-2 shadow-md backdrop-blur-sm',
          severityBorder(notification.severity),
        ]"
        @click="emit('dismiss')"
      >
        <UIcon
          :name="severityIcon(notification.severity)"
          :class="[
            'mt-0.5 h-4 w-4 shrink-0',
            notification.severity === 'danger' ||
            notification.severity === 'collapse'
              ? 'text-error'
              : notification.severity === 'warning'
                ? 'text-warning'
                : 'text-success',
          ]"
        />
        <span class="text-default min-w-0 text-xs leading-tight">
          {{ notification.msg }}
        </span>
      </div>
    </Transition>
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
.notification-bar {
  position: fixed;
  z-index: 45;
  max-width: 280px;
  pointer-events: auto;
}

/* Desktop: bottom-left */
@media (min-width: 768px) {
  .notification-bar {
    bottom: 1rem;
    left: 1rem;
  }
}

/* Mobile: top-right (avoid bottom build buttons) */
@media (max-width: 767px) {
  .notification-bar {
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
