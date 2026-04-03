import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        login: 'login.html',
        documents: 'documents.html',
        schedule: 'schedule.html',
        accounts: 'accounts.html',
      }
    }
  },
  plugins: [
    VitePWA({
      // Strategies: 'generateSW' (default) generates the service worker for you.
      // Use 'injectManifest' if you want to write your own custom service worker.
      strategies: 'generateSW', 
      
      // Automatically register the service worker
      registerType: 'autoUpdate', 
      
      // Specify which files to cache for offline availability
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: null
      },

      // PWA Web App Manifest Configuration
      manifest: {
        name: 'My Awesome Vite PWA',
        short_name: 'VitePWA',
        description: 'A modern PWA built with Vite and vanilla JavaScript',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
});
