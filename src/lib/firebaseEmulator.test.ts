import { describe, expect, it } from 'vitest';
import {
  assertEmulatorModeAllowed,
  EMULATOR_FIREBASE_CONFIG,
  resolveEmulatorMode,
} from '@/lib/firebaseEmulator';

describe('resolveEmulatorMode', () => {
  it('DEV + MODE emulator → true', () => {
    expect(resolveEmulatorMode({ DEV: true, MODE: 'emulator' })).toBe(true);
  });

  it('build (DEV false) con MODE emulator → false', () => {
    expect(resolveEmulatorMode({ DEV: false, MODE: 'emulator' })).toBe(false);
  });

  it.each([['development'], ['production'], ['Emulator'], ['emulator '], ['']])(
    'DEV + MODE %j → false',
    (mode) => {
      expect(resolveEmulatorMode({ DEV: true, MODE: mode })).toBe(false);
    },
  );
});

describe('EMULATOR_FIREBASE_CONFIG', () => {
  it('apunta a un proyecto demo-* con valores falsos (I3)', () => {
    expect(EMULATOR_FIREBASE_CONFIG.projectId).toBe('demo-secondmind');
    expect(EMULATOR_FIREBASE_CONFIG.projectId.startsWith('demo-')).toBe(true);
    expect(EMULATOR_FIREBASE_CONFIG.apiKey).toBe('fake-api-key');
    expect(EMULATOR_FIREBASE_CONFIG.authDomain).toBe('demo-secondmind.firebaseapp.com');
    expect('measurementId' in EMULATOR_FIREBASE_CONFIG).toBe(false);
  });
});

describe('assertEmulatorModeAllowed', () => {
  it('dev server + NODE_ENV development → permitido', () => {
    expect(() =>
      assertEmulatorModeAllowed({ command: 'serve', mode: 'emulator', nodeEnv: 'development' }),
    ).not.toThrow();
  });

  it('dev server sin NODE_ENV → permitido', () => {
    expect(() => assertEmulatorModeAllowed({ command: 'serve', mode: 'emulator' })).not.toThrow();
  });

  it('build --mode emulator → tira', () => {
    expect(() =>
      assertEmulatorModeAllowed({ command: 'build', mode: 'emulator', nodeEnv: 'production' }),
    ).toThrow(/solo para el dev server/);
    expect(() =>
      assertEmulatorModeAllowed({ command: 'build', mode: 'emulator', nodeEnv: 'development' }),
    ).toThrow(/solo para el dev server/);
  });

  it('dev server con NODE_ENV=production (DEV false) → tira', () => {
    expect(() =>
      assertEmulatorModeAllowed({ command: 'serve', mode: 'emulator', nodeEnv: 'production' }),
    ).toThrow(/NODE_ENV "production"/);
  });

  it('vite preview --mode emulator → tira', () => {
    expect(() =>
      assertEmulatorModeAllowed({
        command: 'serve',
        mode: 'emulator',
        isPreview: true,
        nodeEnv: 'production',
      }),
    ).toThrow(/solo para el dev server/);
  });

  it.each([
    ['build', 'production', 'production'],
    ['serve', 'development', 'production'],
    ['serve', 'development', 'development'],
  ])('command %s + mode %s + NODE_ENV %s → no aplica, no tira', (command, mode, nodeEnv) => {
    expect(() => assertEmulatorModeAllowed({ command, mode, nodeEnv })).not.toThrow();
  });
});
