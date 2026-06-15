import { describe, expect, it } from 'vitest';
import { CHANGELOG_ENTRIES, findChangelogEntry } from '@/lib/changelog';

describe('findChangelogEntry', () => {
  it('versión con entrada → la devuelve', () => {
    expect(findChangelogEntry('0.6.0')).toEqual({ version: '0.6.0', key: 'v060' });
  });

  it('versión sin entrada → undefined', () => {
    expect(findChangelogEntry('0.5.1')).toBeUndefined();
  });

  it('match por igualdad exacta de string (sin semver)', () => {
    expect(findChangelogEntry('0.6')).toBeUndefined();
    expect(findChangelogEntry('v060')).toBeUndefined();
  });

  it('toda key normalizada sin puntos (D8: conflicto con keySeparator)', () => {
    CHANGELOG_ENTRIES.forEach((e) => expect(e.key).not.toContain('.'));
  });
});
