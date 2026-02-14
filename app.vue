<script setup>
const appConfig = useAppConfig()

const cssVars = computed(() => ({
  '--game-bg': appConfig.gameUi.background,
}))

function handleError(err) {
  console.error('Unhandled app error:', err)
}
</script>

<template>
  <UApp>
    <div :style="cssVars">
      <NuxtErrorBoundary @error="handleError">
        <NuxtPage />
        <template #error="{ error, clearError }">
          <div
            class="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 p-8 text-white"
          >
            <h1 class="text-xl font-bold text-red-400">Something went wrong</h1>
            <p class="max-w-md text-center text-sm text-slate-300">
              {{ error?.message || 'An unexpected error occurred.' }}
            </p>
            <div class="flex gap-2">
              <UButton
                color="primary"
                label="Try Again"
                @click="clearError()"
              />
              <UButton
                color="neutral"
                variant="outline"
                label="Reload Page"
                @click="() => window.location.reload()"
              />
            </div>
          </div>
        </template>
      </NuxtErrorBoundary>
    </div>
  </UApp>
</template>
