export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: false },
  css: [
    '~/assets/css/variables.css',
    '~/assets/css/global.css'
  ],
  app: {
    head: {
      title: 'Life Support',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no' }
      ]
    }
  },
  vite: {
    server: {
      proxy: {
        '/colony': {
          target: 'http://localhost:8080',
          changeOrigin: true
        }
      }
    }
  },
  compatibilityDate: '2025-01-01'
})
