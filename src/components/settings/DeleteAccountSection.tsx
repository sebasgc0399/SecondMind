import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/useAuth';
import { reauthenticate, deleteAccount } from '@/lib/account';
import { mapCfError } from '@/lib/cfError';
import { mapAuthError } from '@/lib/authErrors';
import { isCapacitor } from '@/lib/capacitor';
import { isTauri } from '@/lib/tauri';

// SPEC-64 F3 — danger zone del borrado de cuenta (flujo web). Un solo modal: tipear el
// email exacto (freno anti-accidente) + password si la cuenta es email/pw (Google
// reautentica por popup). reauthenticate() deja el token fresco (getIdToken(true)) y
// deleteAccount() invoca el callable; en éxito signOut + redirect a /login.

export default function DeleteAccountSection() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // F5 completará el comportamiento nativo (Capacitor abre la URL web, Tauri oculta). En
  // F3 el flujo inline NO se monta en WebView nativo: reauthenticateWithPopup es web-only
  // y colgaría dentro del WebView. Guard firme desde acá.
  if (isCapacitor() || isTauri()) return null;
  // Sin email en el token no hay cómo confirmar la intención ni reautenticar.
  if (!user?.email) return null;

  const accountEmail = user.email;
  const isPasswordProvider = user.providerData[0]?.providerId === 'password';
  const emailMatches = emailInput.trim().toLowerCase() === accountEmail.toLowerCase();
  // Habilita el borrado solo con el email exacto Y, si es cuenta password, password
  // no-vacío (un reauth con password vacío falla seguro y confunde).
  const canDelete = !working && emailMatches && (!isPasswordProvider || password.length > 0);

  function resetModal() {
    setEmailInput('');
    setPassword('');
    setError(null);
    setWorking(false);
  }

  async function handleConfirm() {
    setWorking(true);
    setError(null);
    try {
      await reauthenticate(isPasswordProvider ? password : undefined);
      await deleteAccount();
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      // El error puede venir del reauth (auth/* del SDK) o del callable (details.code).
      const code =
        (err as { details?: { code?: string }; code?: string })?.details?.code ??
        (err as { code?: string })?.code;
      const message = code?.startsWith('auth/')
        ? mapAuthError(code, 'signin', t)
        : mapCfError(err, t);
      // mapAuthError devuelve '' para popup cerrado por el usuario (supresión): no es error.
      setError(message || null);
      setWorking(false);
    }
  }

  return (
    <section id="delete-account" aria-labelledby="delete-account-heading" className="scroll-mt-14">
      <div className="mb-3">
        <h2 id="delete-account-heading" className="text-sm font-semibold text-destructive">
          {t('settings.deleteAccount.title', 'Zona de peligro')}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t(
            'settings.deleteAccount.description',
            'Borrar tu cuenta elimina de forma permanente e irreversible todas tus notas, tareas, proyectos y datos. No se puede deshacer.',
          )}
        </p>
      </div>

      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <Button
          variant="destructive"
          onClick={() => {
            resetModal();
            setOpen(true);
          }}
        >
          {t('settings.deleteAccount.button', 'Borrar mi cuenta')}
        </Button>
      </div>

      <AlertDialog
        open={open}
        onOpenChange={(o: boolean) => {
          setOpen(o);
          if (!o) resetModal();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.deleteAccount.modalTitle', '¿Borrar tu cuenta?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'settings.deleteAccount.modalBody',
                'Esto elimina TODOS tus datos de forma permanente. No se puede deshacer.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-3 text-left">
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">
                {t('settings.deleteAccount.confirmEmailLabel', 'Escribí {{email}} para confirmar', {
                  email: accountEmail,
                })}
              </span>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                autoComplete="off"
                disabled={working}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-destructive focus:ring-2 focus:ring-destructive/30 disabled:opacity-50"
              />
            </label>
            {isPasswordProvider && (
              <label className="grid gap-1">
                <span className="text-xs text-muted-foreground">
                  {t('settings.deleteAccount.passwordLabel', 'Tu contraseña')}
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={working}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-destructive focus:ring-2 focus:ring-destructive/30 disabled:opacity-50"
                />
              </label>
            )}
            {error != null && <p className="text-xs text-destructive">{error}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>
              {t('settings.deleteAccount.cancel', 'Cancelar')}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!canDelete}
              onClick={() => void handleConfirm()}
            >
              {working
                ? t('settings.deleteAccount.working', 'Borrando…')
                : t('settings.deleteAccount.confirm', 'Borrar definitivamente')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
