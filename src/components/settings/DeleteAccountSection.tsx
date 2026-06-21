import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { TriangleAlert } from 'lucide-react';
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
import { reauthenticate, deleteAccount, openWebDeletion } from '@/lib/account';
import { mapCfError } from '@/lib/cfError';
import { mapAuthError } from '@/lib/authErrors';
import { isCapacitor } from '@/lib/capacitor';
import { isTauri } from '@/lib/tauri';

// SPEC-64 — danger zone del borrado de cuenta. Card destructive única (ícono + consecuencia
// a la izquierda, acción a la derecha; espeja el patrón de AppInfoSection) que se ramifica
// por runtime (F5):
//   • Web → flujo inline: el botón abre un modal de confirmación (tipear el email exacto +
//     password si es email/pw; Google reautentica por popup). reauthenticate() deja el token
//     fresco (getIdToken(true)) y deleteAccount() invoca el callable; en éxito signOut +
//     redirect a /login.
//   • Capacitor (Android) → el flujo inline NO corre en WebView nativo (reauthenticateWithPopup
//     es web-only y colgaría), así que el botón —NO oculto— abre la danger zone WEB en un
//     navegador real donde el reauth sí funciona (ver openWebDeletion).
//   • Tauri → oculto (diferido al fast-follow; el binario actual ni siquiera trae este código).

export default function DeleteAccountSection() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isTauri()) return null;
  const isNative = isCapacitor();

  // Web: sin email en el token no hay cómo confirmar la intención ni reautenticar → no
  // renderizar. Nativo NO reautentica in-app (delega al navegador), así que no exige email.
  if (!isNative && !user?.email) return null;

  // Sólo consumidos por el flujo web (modal); en nativo el modal no se monta.
  const accountEmail = user?.email ?? '';
  const isPasswordProvider = user?.providerData[0]?.providerId === 'password';
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
      // SEGURIDAD-CRÍTICA (SPEC-64 F4): `await reauthenticate()` ANTES de
      // `await deleteAccount()` + el catch es la ÚNICA defensa del caso "sesión con
      // auth_time fresco por login (<5 min) + reauth de re-confirmación que falla": el
      // gate server-side de F1 NO lo frena (el auth_time es legítimamente reciente por el
      // login, no por el reauth). No invertir/desacoplar sin DeleteAccountSection.test.tsx
      // en verde (testea exactamente esto: reauth falla → deleteAccount nunca se llama).
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

  function handleDeleteClick() {
    if (isNative) {
      // En nativo el botón delega al navegador (Custom Tab). Si no abre —raro— el usuario
      // puede reintentar; no hay recuperación útil en UI para una acción que sale de la app.
      void openWebDeletion().catch(() => {
        /* Custom Tab no abrió; reintentable. */
      });
      return;
    }
    resetModal();
    setOpen(true);
  }

  return (
    <section id="delete-account" aria-labelledby="delete-account-heading" className="scroll-mt-14">
      <h2 id="delete-account-heading" className="mb-3 text-sm font-semibold text-foreground">
        {t('settings.deleteAccount.title', 'Zona de peligro')}
      </h2>

      <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t(
                'settings.deleteAccount.description',
                'Borrar tu cuenta elimina de forma permanente e irreversible todas tus notas, tareas, proyectos y datos. No se puede deshacer.',
              )}
            </p>
            {isNative && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'settings.deleteAccount.nativeHint',
                  'Se abrirá tu navegador para completar el borrado de forma segura.',
                )}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="destructive"
          className="shrink-0 self-start sm:self-auto"
          onClick={handleDeleteClick}
        >
          {t('settings.deleteAccount.button', 'Borrar mi cuenta')}
        </Button>
      </div>

      {!isNative && (
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
                  {t(
                    'settings.deleteAccount.confirmEmailLabel',
                    'Escribí {{email}} para confirmar',
                    {
                      email: accountEmail,
                    },
                  )}
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
      )}
    </section>
  );
}
