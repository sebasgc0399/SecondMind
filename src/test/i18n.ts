// Harness i18n para tests (F58 F1.7). En extract.ignore — nunca se instrumenta.
//
// Estrategia de asserts: CONTRA EL CATÁLOGO, no contra literales. Assertear con
// i18n.t() sería vacuo (key faltante → ambos lados renderizan la key y el test
// pasa); tEs() lee el JSON importado y LANZA si la key no existe → test rojo.
import i18n from '@/lib/i18n';
import es from '@/locales/es/translation.json';

/**
 * Fuerza el idioma a 'es' — determinismo en jsdom (su navigator.language es
 * 'en-US', la detección daría 'en'). En environment node el guard de i18n.ts
 * ya resuelve 'es', pero forzarlo es idempotente y explícito.
 */
export async function initTestI18n(): Promise<void> {
  await i18n.changeLanguage('es');
}

/**
 * Resuelve un path jerárquico ('settings.trash.title') contra el catálogo es
 * importado. Lanza si la key no existe — esa es la garantía del harness.
 */
export function tEs(path: string): string {
  const value = path.split('.').reduce<unknown>((node, segment) => {
    if (node && typeof node === 'object' && segment in node) {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, es);
  if (typeof value !== 'string') {
    throw new Error(`tEs: la key "${path}" no existe en src/locales/es/translation.json`);
  }
  return value;
}
