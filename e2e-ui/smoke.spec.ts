// SPEC-69 T6 — smoke de UI contra el emulador (`npm run e2e:ui`).
// Datos: scripts/seed-emulator.mjs (usuario e2e@secondmind.test, hub "Construir un Segundo Cerebro").
import { expect, test } from '@playwright/test';

const SEED_EMAIL = 'e2e@secondmind.test';
const SEED_PASSWORD = 'secondmind-e2e'; // credencial de emulador, no es un secreto
const HUB_TITLE = 'Construir un Segundo Cerebro';
const LINKED_TITLE = 'Método PARA';
const TRASHED_TITLE = 'Borrador descartado sobre herramientas';
const SEED_TASK = 'Hacer la revisión semanal';

// Controles positivos (deben FALLAR): E2E_CANARY=1 busca una nota que no existe;
// E2E_CANARY=console emite un console.error para probar el chequeo de consola.
const hubTitle = process.env.E2E_CANARY === '1' ? HUB_TITLE + ' (inexistente)' : HUB_TITLE;

test('smoke: login, dashboard, wikilink, backlinks y papelera', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
  const shot = (name: string) =>
    page.screenshot({
      path: testInfo.outputPath(name + '-' + testInfo.project.name + '.png'),
      fullPage: true,
    });

  await test.step('login con el usuario seed', async () => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(SEED_EMAIL);
    await page.getByLabel('Contraseña', { exact: true }).fill(SEED_PASSWORD);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByText('EMULADOR · demo-secondmind')).toBeVisible();
  });

  await test.step('dashboard con datos del seed', async () => {
    await expect(page.getByText(SEED_TASK).first()).toBeVisible();
    await expect(page.getByText('Hubs activos')).toBeVisible();
    await expect(page.getByText(hubTitle).first()).toBeVisible();
    await shot('dashboard');
  });

  await test.step('abrir la nota hub y seguir un wikilink', async () => {
    await page.getByText(hubTitle).first().click();
    await expect(page).toHaveURL(/\/notes\/nota-segundo-cerebro$/);
    const wikilink = page.locator('.ProseMirror a.wikilink', { hasText: LINKED_TITLE });
    await expect(wikilink).toBeVisible();
    await wikilink.click();
    await expect(page).toHaveURL(/\/notes\/nota-para$/);
  });

  await test.step('el panel de backlinks lista la nota de origen', async () => {
    // Bajo 1024px el panel arranca cerrado a propósito (getInitialPanelState): se abre con el chip.
    const width = page.viewportSize()?.width ?? 0;
    if (width < 1024) await page.getByRole('button', { name: /^Backlinks \(\d+\)$/ }).click();
    const panel = page.getByRole('complementary').filter({ hasText: 'Backlinks' });
    await expect(panel.getByRole('link', { name: new RegExp(HUB_TITLE) })).toBeVisible();
    await shot('nota-backlinks');
  });

  await test.step('la papelera muestra la nota descartada', async () => {
    await page.goto('/notes');
    await page.getByRole('button', { name: /^Papelera/ }).click();
    await expect(page.getByRole('heading', { name: TRASHED_TITLE })).toBeVisible();
    await shot('papelera');
  });

  if (process.env.E2E_CANARY === 'console') await page.evaluate(() => console.error('canario'));
  expect(consoleErrors, 'errores de consola durante el smoke').toEqual([]);
});
