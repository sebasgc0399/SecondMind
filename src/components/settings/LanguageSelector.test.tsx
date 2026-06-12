// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LanguageSelector from '@/components/settings/LanguageSelector';
import { initTestI18n, tEs } from '@/test/i18n';

const setPreferencesMock = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  default: () => ({ user: { uid: 'test-uid' } }),
}));

const usePreferencesMock = vi.fn();
vi.mock('@/hooks/usePreferences', () => ({
  default: () => usePreferencesMock() as unknown,
}));

vi.mock('@/lib/preferences', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/preferences')>();
  return {
    ...actual,
    setPreferences: (...args: unknown[]) => setPreferencesMock(...args) as unknown,
  };
});

describe('LanguageSelector (F58 F1.4/F1.7)', () => {
  beforeEach(async () => {
    await initTestI18n();
    setPreferencesMock.mockReset();
    setPreferencesMock.mockResolvedValue(undefined);
  });

  it('renderiza los endónimos del catálogo y marca el locale persistido como activo', () => {
    usePreferencesMock.mockReturnValue({
      preferences: { locale: 'es' },
      isLoaded: true,
    });
    render(<LanguageSelector />);

    const esButton = screen.getByRole('button', {
      name: new RegExp(tEs('settings.language.es.label')),
    });
    const enButton = screen.getByRole('button', {
      name: new RegExp(tEs('settings.language.en.label')),
    });
    expect(esButton).toHaveProperty('ariaPressed', 'true');
    expect(enButton).toHaveProperty('ariaPressed', 'false');
    // Badge "activo" desde el catálogo, no literal (estrategia tEs).
    expect(esButton.textContent).toContain(tEs('common.activeBadge'));
  });

  it('click en el otro idioma → setPreferences(uid, { locale })', () => {
    usePreferencesMock.mockReturnValue({
      preferences: { locale: 'es' },
      isLoaded: true,
    });
    render(<LanguageSelector />);

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(tEs('settings.language.en.label')) }),
    );
    expect(setPreferencesMock).toHaveBeenCalledWith('test-uid', { locale: 'en' });
  });

  it('click en el idioma ya activo → no escribe', () => {
    usePreferencesMock.mockReturnValue({
      preferences: { locale: 'es' },
      isLoaded: true,
    });
    render(<LanguageSelector />);

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(tEs('settings.language.es.label')) }),
    );
    expect(setPreferencesMock).not.toHaveBeenCalled();
  });

  it('locale null (pre write-eager) → marca activo el idioma corriente de i18n', () => {
    usePreferencesMock.mockReturnValue({
      preferences: { locale: null },
      isLoaded: true,
    });
    render(<LanguageSelector />);

    // initTestI18n fija 'es' → el botón Español debe estar activo.
    const esButton = screen.getByRole('button', {
      name: new RegExp(tEs('settings.language.es.label')),
    });
    expect(esButton).toHaveProperty('ariaPressed', 'true');
  });

  it('tEs lanza ante key inexistente (el harness no da falsos verdes)', () => {
    expect(() => tEs('settings.no.existe')).toThrow(/no existe/);
  });
});
