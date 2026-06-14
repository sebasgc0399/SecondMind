import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Mail } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/useAuth';
import useEmailVerificationResend from '@/hooks/useEmailVerificationResend';

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const { user, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { remainingSeconds, sending, handleResend } = useEmailVerificationResend();

  // Auto-redirect cuando emailVerified pasa a true. Trigger natural:
  // refreshUser dispara setUser(auth.currentUser) post-reload (mismo
  // patrón que EmailVerificationBanner F47.F4); este effect observa el
  // cambio y navega a /.
  useEffect(() => {
    if (user?.emailVerified) {
      navigate('/', { replace: true });
    }
  }, [user?.emailVerified, navigate]);

  // Refresh user vía focus + visibilitychange cuando el usuario vuelve desde
  // su correo. refreshUser hace reload() + getIdToken(true) si quedó verificado
  // y RETORNA el emailVerified actualizado: navegamos sobre ese valor en vez de
  // esperar el re-render del effect de arriba, porque setUser(auth.currentUser)
  // recibe el mismo ref del objeto User (Firebase lo muta in-place) → React
  // bail-out → ese effect no re-evalúa. El return decopla el redirect del bail.
  useEffect(() => {
    async function check() {
      if (await refreshUser()) {
        navigate('/', { replace: true });
      }
    }
    function handleFocus() {
      void check();
    }
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        void check();
      }
    }
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshUser, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-48 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-[280px] w-full max-w-md animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    );
  }

  // Defensa en profundidad: si no hay user, /login. Layout normalmente
  // ya redirigió antes de llegar acá, pero la ruta es top-level y un
  // user puede entrar directo via URL.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Defensa en profundidad: si el user ya verified al cargar la página
  // (race con onAuthStateChanged), no esperar al useEffect.
  if (user.emailVerified) {
    return <Navigate to="/" replace />;
  }

  const resendLabel = sending
    ? t('common.sending', 'Enviando…')
    : remainingSeconds > 0
    ? t('auth.verify.sent', 'Enviado · {{seconds}}s', { seconds: remainingSeconds })
    : t('auth.verify.resend', 'Reenviar enlace');

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
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-amber-500/15 p-3">
            <Mail className="size-6 text-amber-600 dark:text-amber-400" aria-hidden />
          </div>
          <h2 className="text-xl font-semibold">
            {t('auth.verify.pageTitle', 'Verificá tu email para continuar')}
          </h2>
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="auth.verify.body"
              defaults="Para activar tu cuenta verificá <1>{{email}}</1>. Revisá tu bandeja de entrada y la carpeta de spam, y hacé click en el enlace — sin verificación no podés guardar notas ni tareas. ¿No te llegó? Reenvialo abajo."
              values={{ email: user.email ?? '' }}
              components={[
                <span key="0" />,
                <span key="1" className="font-medium text-foreground" />,
              ]}
            />
          </p>
          <Button
            type="button"
            variant="default"
            size="lg"
            disabled={remainingSeconds > 0 || sending}
            onClick={handleResend}
            className="mt-2 w-full"
          >
            {resendLabel}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t(
              'auth.verify.autoRefresh',
              '¿Ya verificaste? Esta página se actualiza sola cuando volvés desde tu correo.',
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
