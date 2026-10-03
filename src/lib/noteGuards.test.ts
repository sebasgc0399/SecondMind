import { describe, expect, it } from 'vitest';
import { isLiveNote, isTrashedNote } from '@/lib/noteGuards';

describe('noteGuards', () => {
  it('deletedAt > 0 es papelera', () => {
    expect(isTrashedNote({ deletedAt: 1_700_000_000_000 })).toBe(true);
    expect(isLiveNote({ deletedAt: 1_700_000_000_000 })).toBe(false);
  });

  it('undefined, 0 y negativos no son papelera', () => {
    expect(isTrashedNote({})).toBe(false);
    expect(isTrashedNote({ deletedAt: undefined })).toBe(false);
    expect(isTrashedNote({ deletedAt: 0 })).toBe(false);
    expect(isTrashedNote({ deletedAt: -1 })).toBe(false);
    expect(isLiveNote({ deletedAt: 0 })).toBe(true);
  });

  it('valores no numéricos no son papelera', () => {
    expect(isTrashedNote({ deletedAt: '1700000000000' })).toBe(false);
    expect(isTrashedNote({ deletedAt: true })).toBe(false);
    expect(isTrashedNote({ deletedAt: null })).toBe(false);
  });

  it('row ausente no es papelera', () => {
    expect(isTrashedNote(undefined)).toBe(false);
    expect(isTrashedNote(null)).toBe(false);
  });
});
