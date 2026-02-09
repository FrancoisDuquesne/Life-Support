const base = process.env.NUXT_APP_BASE_URL || '/'

export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxt/ui', '@vite-pwa/nuxt'],
  css: [
    '~/assets/css/main.css'
  ],
  app: {
    baseURL: base,
    head: {
      title: 'Life Support',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' },
        { name: 'theme-color', content: '#0f172a' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: `${base}icons/icon-192.svg` }
      ]
    }
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Life Support — Colony Simulator',
      short_name: 'Life Support',
      description: 'Build and manage a space colony. Single-player strategy game.',
      theme_color: '#0f172a',
      background_color: '#0f172a',
      display: 'standalone',
      orientation: 'any',
      icons: [
        { src: 'icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
        { src: 'icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }
      ]
    },
    workbox: {
      navigateFallback: `${base}index.html`,
      globPatterns: ['**/*.{js,css,html,png,svg,ico}']
    }
  },
  colorMode: {
    preference: 'light'
  },
  compatibilityDate: '2025-11-01'
})
