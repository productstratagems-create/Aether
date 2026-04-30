import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const REPO_NAME = 'Aether'

export default defineConfig({
  base: `/${REPO_NAME}/`,

  plugins: [
    react(),

    VitePWA({
      strategies: 'generateSW',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false,
      },

      manifest: {
        name: 'The Lithos Protocol',
        short_name: 'Lithos',
        description: 'Field measurement of infrasonic, magnetic & atmospheric signals',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        start_url: `/${REPO_NAME}/`,
        scope: `/${REPO_NAME}/`,
        orientation: 'portrait',
        icons: [
          {
            src: `/${REPO_NAME}/icons/icon-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `/${REPO_NAME}/icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `/${REPO_NAME}/icons/icon-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        cacheId: 'lithos-v3',
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [],
      },
    }),
  ],
})
