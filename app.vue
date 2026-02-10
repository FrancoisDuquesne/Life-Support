<script setup>
const appConfig = useAppConfig()

const cssVars = computed(() => ({
  '--game-bg': appConfig.gameUi.background,
}))
</script>

<template>
  <UApp>
    <div :style="cssVars">
      <NuxtPage />
    </div>
  </UApp>
</template>
