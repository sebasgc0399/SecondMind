/**
 * Registry de versiones CON entrada de novedades (F59). Fuente de verdad de
 * "¿existe entrada para esta versión?" — desacoplado del i18n (testeable sin
 * i18n init, independiente del locale activo). `version` = string crudo que
 * reporta `getRunningVersion()`; `key` = key i18n normalizada (D8: el
 * `keySeparator '.'` impide usar `'0.6.0'` como segmento de key → `'v060'`).
 */
export interface ChangelogEntry {
  version: string;
  key: string;
}

export const CHANGELOG_ENTRIES: ReadonlyArray<ChangelogEntry> = [{ version: '0.6.0', key: 'v060' }];

export function findChangelogEntry(version: string): ChangelogEntry | undefined {
  return CHANGELOG_ENTRIES.find((e) => e.version === version);
}
