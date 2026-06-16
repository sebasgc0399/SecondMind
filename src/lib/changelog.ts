/**
 * Registry de versiones CON entrada de novedades (F59). Fuente de verdad de
 * "¿existe entrada para esta versión?" — desacoplado del i18n (testeable sin
 * i18n init, independiente del locale activo). `version` = string crudo que
 * reporta `getRunningVersion()`; `key` = key i18n normalizada (D8: el
 * `keySeparator '.'` impide usar `'0.5.2'` como segmento de key → `'v052'`).
 *
 * `as const`: fija las keys como literales (p. ej. `'v052'`) para que el modal
 * (F6) construya `t('changelog.${key}.title')` como key tipada, sin cast.
 */
// F60 — orden del array = orden de release: cada entrada se appendea al FINAL en
// su release (Paso 2.5 de release-ecosystem). El historial (/settings/changelog)
// lo lista con reverse() = newest-first, sin semver. Solo versiones LIBERADAS.
export const CHANGELOG_ENTRIES = [
  { version: '0.5.2', key: 'v052' },
  { version: '0.5.3', key: 'v053' },
] as const;

export type ChangelogEntry = (typeof CHANGELOG_ENTRIES)[number];
export type ChangelogKey = ChangelogEntry['key'];

export function findChangelogEntry(version: string): ChangelogEntry | undefined {
  return CHANGELOG_ENTRIES.find((e) => e.version === version);
}
