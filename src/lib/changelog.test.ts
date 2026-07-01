import { describe, expect, it } from 'vitest';
import { CHANGELOG_ENTRIES, findChangelogEntry } from '@/lib/changelog';

describe('findChangelogEntry', () => {
  // Data-driven sobre el catálogo real: NO se desincroniza al liberar una versión
  // nueva. Root cause del test stale post-release v0.6.0 (fix): la guardia vieja
  // hardcodeaba `0.6.0 → undefined` como proxy del invariante F60, pero el release
  // re-agregó la entrada al catálogo y nadie tocó el test → rojo en main.
  it('toda versión del catálogo → devuelve su entrada exacta', () => {
    CHANGELOG_ENTRIES.forEach((e) => expect(findChangelogEntry(e.version)).toEqual(e));
  });

  it('versión fuera del catálogo → undefined', () => {
    expect(findChangelogEntry('0.5.1')).toBeUndefined(); // gap real entre liberadas
    expect(findChangelogEntry('99.99.99')).toBeUndefined(); // sentinel nunca liberado
  });

  it('match por igualdad exacta de string (sin semver)', () => {
    expect(findChangelogEntry('0.5')).toBeUndefined();
    expect(findChangelogEntry('v052')).toBeUndefined();
  });

  it('toda key normalizada sin puntos (D8: conflicto con keySeparator)', () => {
    CHANGELOG_ENTRIES.forEach((e) => expect(e.key).not.toContain('.'));
  });
});
