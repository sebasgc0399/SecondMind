import { describe, expect, it } from 'vitest';
import { resolveEmulatorMode } from '@/lib/firebaseEmulator';

const DEMO = 'demo-secondmind';
const REAL = 'secondmindv1';

describe('resolveEmulatorMode', () => {
  it('DEV + flag true + projectId demo-* → true', () => {
    expect(
      resolveEmulatorMode({ DEV: true, VITE_USE_EMULATOR: 'true', VITE_FIREBASE_PROJECT_ID: DEMO }),
    ).toBe(true);
  });

  it('build (DEV false) con flag true → false, aunque el projectId sea demo-*', () => {
    expect(
      resolveEmulatorMode({
        DEV: false,
        VITE_USE_EMULATOR: 'true',
        VITE_FIREBASE_PROJECT_ID: DEMO,
      }),
    ).toBe(false);
  });

  it('build (DEV false) con flag true y projectId real → false sin tirar', () => {
    expect(
      resolveEmulatorMode({
        DEV: false,
        VITE_USE_EMULATOR: 'true',
        VITE_FIREBASE_PROJECT_ID: REAL,
      }),
    ).toBe(false);
  });

  it.each([
    ['false', DEMO],
    [undefined, DEMO],
    ['', DEMO],
    ['TRUE', DEMO],
    ['1', DEMO],
    ['false', REAL],
    [undefined, REAL],
  ])('DEV true + flag %s (projectId %s) → false', (flag, projectId) => {
    expect(
      resolveEmulatorMode({
        DEV: true,
        VITE_USE_EMULATOR: flag,
        VITE_FIREBASE_PROJECT_ID: projectId,
      }),
    ).toBe(false);
  });

  it.each([[false], [undefined]])('DEV false + flag %s → false', (dev) => {
    expect(
      resolveEmulatorMode({
        DEV: Boolean(dev),
        VITE_USE_EMULATOR: undefined,
        VITE_FIREBASE_PROJECT_ID: REAL,
      }),
    ).toBe(false);
  });

  it.each([[REAL], [''], [undefined], ['secondmind-demo'], ['Demo-secondmind']])(
    'DEV + flag true + projectId %s (no demo-*) → tira (I3)',
    (projectId) => {
      expect(() =>
        resolveEmulatorMode({
          DEV: true,
          VITE_USE_EMULATOR: 'true',
          VITE_FIREBASE_PROJECT_ID: projectId,
        }),
      ).toThrow(/demo-\*/);
    },
  );
});
