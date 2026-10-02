import path from 'path';
import { readFileSync } from 'node:fs';
import { loadEnv } from 'vite';
import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

// SPEC-69 T4 (I2): el modo emulador nunca llega a un build. Se mira el env ya resuelto
// (archivos del modo + process.env, sin filtro de prefijo): un VITE_USE_EMULATOR=true
// olvidado en el .env.local también se carga en producción.
// Además, `--mode emulator` sin su config (flag + projectId demo-*) se niega a arrancar: sin
// el archivo del modo, el dev server cargaría los VITE_FIREBASE_* reales del .env.local y la
// app de :5180 hablaría con producción sin chip.
function assertEmulatorEnv(command: string, mode: string): void {
  // envDir = root = este directorio (no hay `root`/`envDir` custom).
  const env = loadEnv(mode, __dirname, '');
  if (command === 'build' && env.VITE_USE_EMULATOR === 'true') {
    throw new Error(
      `[vite.config] VITE_USE_EMULATOR=true en un build (mode "${mode}"). El modo emulador es ` +
        'solo para el dev server (npm run dev:emu:app). Quitá el flag del entorno o de los ' +
        'archivos de env del modo antes de buildear.',
    );
  }
  if (
    mode === 'emulator' &&
    (env.VITE_USE_EMULATOR !== 'true' || !env.VITE_FIREBASE_PROJECT_ID?.startsWith('demo-'))
  ) {
    throw new Error(
      '[vite.config] --mode emulator exige VITE_USE_EMULATOR=true y VITE_FIREBASE_PROJECT_ID ' +
        `demo-* (recibido "${env.VITE_FIREBASE_PROJECT_ID ?? ''}"). Falta o está incompleto ` +
        'el archivo de env del modo emulador.',
    );
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  assertEmulatorEnv(command, mode);
  return {
    clearScreen: false,
    server: {
      port: 5173,
      strictPort: true,
    },
    envPrefix: ['VITE_', 'TAURI_ENV_'],
    // F59: __APP_VERSION__ build-time = versión de package.json. Se lee POST-reload
    // (no para detectar updates: eso fue el bug self-defeating de useVersionCheck).
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'SecondMind',
          short_name: 'SecondMind',
          description: 'Tu segundo cerebro, en acción.',
          // F58: coherencia con la description (el estándar W3C no soporta
          // manifest multi-idioma — esto NO es i18n del manifest).
          lang: 'es',
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
      // Los tests del guard (hooks de Claude) usan node:test y corren con `npm run test:guard`.
      exclude: [
        ...configDefaults.exclude,
        '**/firestore.rules.test.ts',
        '**/*.e2e.test.ts',
        '.claude/**',
      ],
    },
  };
});
