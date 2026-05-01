// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line import/order -- false positive con vi.mock() flow
import { createStore } from 'tinybase';

vi.mock('@/lib/firebase', () => ({
  db: {} as object,
  auth: { currentUser: null as { uid: string } | null },
}));

vi.mock('firebase/firestore', () => ({
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  doc: vi.fn(),
  collection: vi.fn(),
}));

import { migrateTinyBaseSchemaIfNeeded } from '@/lib/tinybase';

const STORAGE_KEY = 'secondmind:tinybase:schemaVersion';

function makeStoreWithRow() {
  const store = createStore().setTablesSchema({
    items: { name: { type: 'string', default: '' } },
  });
  store.setRow('items', 'r1', { name: 'a' });
  return store;
}

describe('migrateTinyBaseSchemaIfNeeded (F36.F8)', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('match: no purga, retorna false, key intacta', () => {
    localStorage.setItem(STORAGE_KEY, '1');
    const store = makeStoreWithRow();
    const purged = migrateTinyBaseSchemaIfNeeded([store]);
    expect(purged).toBe(false);
    expect(store.getTable('items')).toEqual({ r1: { name: 'a' } });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('mismatch null (boot inicial / post-nuclear F7.1): purga y setea key', () => {
    const store = makeStoreWithRow();
    const purged = migrateTinyBaseSchemaIfNeeded([store]);
    expect(purged).toBe(true);
    expect(store.getTable('items')).toEqual({});
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('mismatch versión anterior persistida: purga y actualiza key', () => {
    localStorage.setItem(STORAGE_KEY, '99');
    const store = makeStoreWithRow();
    const purged = migrateTinyBaseSchemaIfNeeded([store]);
    expect(purged).toBe(true);
    expect(store.getTable('items')).toEqual({});
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('localStorage.getItem throw (private mode): no-op silencioso, retorna false', () => {
    const store = makeStoreWithRow();
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage no disponible');
    });
    const purged = migrateTinyBaseSchemaIfNeeded([store]);
    expect(purged).toBe(false);
    expect(store.getTable('items')).toEqual({ r1: { name: 'a' } });
    getItemSpy.mockRestore();
  });

  it('multiple stores: purga todos en mismatch', () => {
    const s1 = makeStoreWithRow();
    const s2 = makeStoreWithRow();
    const purged = migrateTinyBaseSchemaIfNeeded([s1, s2]);
    expect(purged).toBe(true);
    expect(s1.getTable('items')).toEqual({});
    expect(s2.getTable('items')).toEqual({});
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
  });
});
