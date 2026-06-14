import { useSearchParams, useNavigate } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import ActionStatus from '@/components/auth/ActionStatus';
import VerifyEmailAction from '@/components/auth/VerifyEmailAction';
import ResetPasswordAction from '@/components/auth/ResetPasswordAction';

// SPEC-54 F2: landing custom de los action-links de Firebase Auth. Rutea por ?mode= y
// procesa el oobCode con el SDK. Ruta pública sibling (fuera del Layout) → NO hay auth-gate
// y NO redirige al usuario logueado (G3): un logueado puede abrir legítimamente un
// reset/verify (cross-device o de otra cuenta). El SDK usa su propia apiKey; ignoramos
// apiKey/continueUrl/lang del query — solo leemos mode + oobCode.
export default function AuthActionPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const mode = params.get('mode');
  const oobCode = params.get('oobCode');

  function renderBody() {
    const goToLogin = (
      <Button
        type="button"
        variant="default"
        size="lg"
        onClick={() => navigate('/login')}
        className="mt-2 w-full"
      >
        {t('auth.signIn', 'Iniciar sesión')}
      </Button>
    );

    // G9: sin oobCode no hay nada que procesar — fallback ANTES de ramificar por mode.
    if (!oobCode) {
      return (
        <ActionStatus
          variant="error"
          icon={AlertTriangle}
          title={t('auth.action.invalidTitle', 'Enlace inválido')}
          description={t(
            'auth.action.invalidBody',
            'Este enlace no es válido o está incompleto. Pedí uno nuevo desde la app.',
          )}
        >
          {goToLogin}
        </ActionStatus>
      );
    }

    if (mode === 'verifyEmail') return <VerifyEmailAction oobCode={oobCode} />;
    if (mode === 'resetPassword') return <ResetPasswordAction oobCode={oobCode} />;

    // recoverEmail / signIn / mode desconocido → fallback. La app no cambia email (D4) ni
    // usa email-link sign-in, así que estos modes no se emiten en la práctica.
    return (
      <ActionStatus
        variant="error"
        icon={AlertTriangle}
        title={t('auth.action.unsupportedTitle', 'Enlace no soportado')}
        description={t(
          'auth.action.unsupportedBody',
          'Este tipo de enlace no está disponible. Pedí uno nuevo desde la app.',
        )}
      >
        {goToLogin}
      </ActionStatus>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[75%]"
        style={{
          background:
            'radial-gradient(ellipse 55% 42% at 50% 8%, color-mix(in oklch, var(--primary) 45%, transparent) 0%, transparent 65%)',
        }}
      />

      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <img src="/favicon.svg" alt="" aria-hidden className="h-20 w-20 md:h-24 md:w-24" />
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">SecondMind</h1>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border-strong bg-popover p-6 shadow-modal backdrop-blur-md md:p-8">
        {renderBody()}
      </div>
    </div>
  );
}
