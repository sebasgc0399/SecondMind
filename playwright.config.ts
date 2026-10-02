// SPEC-69 T6 — smoke de UI contra el emulador. `npm run e2e:ui` levanta `dev:emu` (emuladores +
// seed + vite en :5180, ~1 min) y corre e2e-ui/ en 3 viewports con el Chrome instalado.
import { defineConfig } from '@playwright/test';

const PORT = 5180;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e-ui',
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // Un solo worker: los tres proyectos comparten el mismo emulador y el mismo usuario seed.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  webServer: {
    command: 'npm run dev:emu',
    url: BASE_URL,
    timeout: 240_000,
    reuseExistingServer: true,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  use: {
    baseURL: BASE_URL,
    // E0-T6-a: Chrome del sistema, sin descargar navegadores de Playwright.
    channel: 'chrome',
    // La app detecta el idioma del navegador y el login aún no tiene preferencias: sin esto Chrome
    // en en-US renderiza la UI en inglés y los locators en español no encuentran nada.
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'mobile-375', use: { viewport: { width: 375, height: 812 } } },
  ],
});
