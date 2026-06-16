import { describe, expect, it } from 'vitest';
import { CHANGELOG_ENTRIES, findChangelogEntry } from '@/lib/changelog';

describe('findChangelogEntry', () => {
  it('versión con entrada → la devuelve', () => {
    expect(findChangelogEntry('0.5.2')).toEqual({ version: '0.5.2', key: 'v052' });
  });

  it('versión sin entrada → undefined (incl. 0.6.0: removida por no liberada, F60 invariante)', () => {
    expect(findChangelogEntry('0.5.1')).toBeUndefined();
    expect(findChangelogEntry('0.6.0')).toBeUndefined();
  });

  it('match por igualdad exacta de string (sin semver)', () => {
    expect(findChangelogEntry('0.5')).toBeUndefined();
    expect(findChangelogEntry('v052')).toBeUndefined();
  });

  it('toda key normalizada sin puntos (D8: conflicto con keySeparator)', () => {
    CHANGELOG_ENTRIES.forEach((e) => expect(e.key).not.toContain('.'));
  });
});
