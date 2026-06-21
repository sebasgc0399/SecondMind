// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeleteAccountSection from '@/components/settings/DeleteAccountSection';
import { initTestI18n, tEs } from '@/test/i18n';

// SPEC-64 F5 — fork por runtime de la entrada de borrado en los shells nativos. El flujo
// web inline (reauth + modal) está cubierto por DeleteAccountSection.test.tsx (F4). Acá se
// blindan las dos ramas nativas:
//   - Android (Capacitor): el botón NO está oculto y, al tocarlo, delega a openWebDeletion
//     (que abre la danger zone web en un navegador real — el reauth es web-only).
//   - Tauri: el botón se oculta (diferido al fast-follow; el binario actual ni trae esto).

const openWebDeletionMock = vi.fn();
const isCapacitorMock = vi.fn(() => false);
const isTauriMock = vi.fn(() => false);

vi.mock('@/lib/account', () => ({
  reauthenticate: vi.fn(),
  deleteAccount: vi.fn(),
  openWebDeletion: (...args: unknown[]) => openWebDeletionMock(...args) as unknown,
}));

vi.mock('@/hooks/useAuth', () => ({
  default: () => ({
    user: { email: 'qa-delete@x.test', providerData: [{ providerId: 'password' }] },
    signOut: vi.fn(),
  }),
}));

vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }));

vi.mock('@/lib/capacitor', () => ({ isCapacitor: () => isCapacitorMock() }));
vi.mock('@/lib/tauri', () => ({ isTauri: () => isTauriMock() }));

describe('DeleteAccountSection — fork nativo (SPEC-64 F5)', () => {
  beforeEach(async () => {
    await initTestI18n();
    isCapacitorMock.mockReturnValue(false);
    isTauriMock.mockReturnValue(false);
    openWebDeletionMock.mockReset();
    openWebDeletionMock.mockResolvedValue(undefined);
  });

  it('Android (Capacitor): muestra el botón (NO oculto) y al tocarlo abre la URL web', () => {
    isCapacitorMock.mockReturnValue(true);
    render(<DeleteAccountSection />);

    const button = screen.getByRole('button', {
      name: new RegExp(tEs('settings.deleteAccount.button')),
    });
    fireEvent.click(button);

    expect(openWebDeletionMock).toHaveBeenCalledTimes(1);
  });

  it('Tauri: el botón se oculta (no renderiza nada)', () => {
    isTauriMock.mockReturnValue(true);
    const { container } = render(<DeleteAccountSection />);

    expect(container.firstChild).toBeNull();
    expect(
      screen.queryByRole('button', { name: new RegExp(tEs('settings.deleteAccount.button')) }),
    ).toBeNull();
  });
});
