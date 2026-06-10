import path from 'path';
import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'SecondMind',
        short_name: 'SecondMind',
        description: 'Tu segundo cerebro digital',
        start_url: '/',
        display: 'standalone',
        theme_color: '#878bf9',
        background_color: '#0a0a0a',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        // SPEC-54: /auth/action se golpea desde links de email externos → debe cargar
        // SIEMPRE el bundle actual desde la red, nunca el index.html precacheado (que con
        // un SW viejo no tiene la ruta → 404 en el Layout). La ruta necesita red igual
        // (llama a Firebase Auth), así que no perdemos nada offline.
        navigateFallbackDenylist: [/^\/api/, /^\/__\//, /^\/auth\/action/],
        // prompt mode requiere skipWaiting: false explícito — el SW nuevo
        // queda en `waiting` hasta que el cliente llame updateSW(true).
        // clientsClaim: false complementa: tabs abiertos no migran al SW
        // nuevo automáticamente; esperan el reload disparado por el prompt.
        skipWaiting: false,
        clientsClaim: false,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: [
      'react',
      'react-dom',
      'firebase',
      '@firebase/app',
      '@firebase/component',
      '@firebase/auth',
      '@firebase/firestore',
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    // El test de security rules (F4) necesita el emulador de Firestore — corre
    // aparte con `npm run test:rules`, no en el `npm test` default.
    exclude: [...configDefaults.exclude, '**/firestore.rules.test.ts', '**/*.e2e.test.ts'],
  },
});
