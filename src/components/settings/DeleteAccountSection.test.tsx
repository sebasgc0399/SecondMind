// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeleteAccountSection from '@/components/settings/DeleteAccountSection';
import { initTestI18n, tEs } from '@/test/i18n';

// SPEC-64 F4 — test del GATE DE CONTROL-FLOW del cliente. NO testea el wipe (eso lo
// cubre F1 contra el emulador). Blinda la ÚNICA defensa de un escenario que F1 NO frena:
//
//   Sesión con auth_time fresco por LOGIN (<5 min) + reauth de re-confirmación que FALLA.
//   El gate server-side (auth_time <5min) pasaría porque el auth_time es legítimamente
//   reciente por el login, NO por el reauth. Si el control-flow del cliente llamara
//   deleteAccount() igual, la cuenta se borraría SIN la re-confirmación. La única defensa
//   es el orden `await reauthenticate()` ANTES de `await deleteAccount()` + catch.
//
// Este test rompe si un refactor futuro invierte/desacopla ese orden.

const reauthenticateMock = vi.fn();
const deleteAccountMock = vi.fn();
const signOutMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/lib/account', () => ({
  reauthenticate: (...args: unknown[]) => reauthenticateMock(...args) as unknown,
  deleteAccount: (...args: unknown[]) => deleteAccountMock(...args) as unknown,
}));

vi.mock('@/hooks/useAuth', () => ({
  default: () => ({
    user: { email: 'qa-delete@x.test', providerData: [{ providerId: 'password' }] },
    signOut: (...args: unknown[]) => signOutMock(...args) as unknown,
  }),
}));

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/lib/capacitor', () => ({ isCapacitor: () => false }));
vi.mock('@/lib/tauri', () => ({ isTauri: () => false }));

const ACCOUNT_EMAIL = 'qa-delete@x.test';

async function openModalFillAndConfirm(password: string): Promise<void> {
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(tEs('settings.deleteAccount.button')) }),
  );
  // El email es el único textbox del modal (el password no expone role textbox).
  const emailInput = await screen.findByRole('textbox');
  fireEvent.change(emailInput, { target: { value: ACCOUNT_EMAIL } });
  fireEvent.change(screen.getByLabelText(tEs('settings.deleteAccount.passwordLabel')), {
    target: { value: password },
  });
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(tEs('settings.deleteAccount.confirm')) }),
  );
}

describe('DeleteAccountSection — gate de control-flow (SPEC-64 F4)', () => {
  beforeEach(async () => {
    await initTestI18n();
    reauthenticateMock.mockReset();
    deleteAccountMock.mockReset();
    signOutMock.mockReset();
    navigateMock.mockReset();
  });

  it('reauth FALLA → deleteAccount NUNCA se invoca (ni signOut ni redirect)', async () => {
    reauthenticateMock.mockRejectedValue({ code: 'auth/wrong-password' });
    render(<DeleteAccountSection />);
    await openModalFillAndConfirm('contraseña-incorrecta');

    await waitFor(() => expect(reauthenticateMock).toHaveBeenCalledTimes(1));
    expect(deleteAccountMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('control: reauth OK → deleteAccount + signOut + redirect a /login', async () => {
    reauthenticateMock.mockResolvedValue(undefined);
    deleteAccountMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
    render(<DeleteAccountSection />);
    await openModalFillAndConfirm('contraseña-correcta');

    await waitFor(() => expect(deleteAccountMock).toHaveBeenCalledTimes(1));
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login', { replace: true });
  });
});
