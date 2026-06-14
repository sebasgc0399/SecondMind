import { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import useEmailVerificationResend from '@/hooks/useEmailVerificationResend';

const DISMISS_KEY = 'secondmind:em-banner-dismissed';

export default function EmailVerificationBanner() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const { remainingSeconds, sending, handleResend } = useEmailVerificationResend();

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Refresh user vía focus + visibilitychange (override SPEC: NO polling 30s).
  // Trigger natural: user vuelve a SecondMind tras click email → focus event
  // → refreshUser → user.emailVerified actualizado → banner desaparece.
  useEffect(() => {
    function handleFocus() {
      void refreshUser();
    }
    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        void refreshUser();
      }
    }
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshUser]);

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // sessionStorage no disponible (modo privado strict, etc.) — no-op
    }
  }

  if (dismissed) return null;

  const resendLabel = sending
    ? t('common.sending', 'Enviando…')
    : remainingSeconds > 0
    ? t('auth.verify.sent', 'Enviado · {{seconds}}s', { seconds: remainingSeconds })
    : t('auth.verify.resend', 'Reenviar enlace');

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300"
    >
      <Mail className="size-4 shrink-0" aria-hidden />
      <p className="flex-1">
        {t('auth.verify.bannerMessage', 'Verificá tu email para asegurar tu cuenta.')}
      </p>
      <button
        type="button"
        onClick={handleResend}
        disabled={remainingSeconds > 0 || sending}
        className="rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
      >
        {resendLabel}
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('common.close', 'Cerrar')}
        className="rounded-md p-1 transition-colors hover:bg-amber-500/15"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
