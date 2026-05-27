import { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';
import useAuth from '@/hooks/useAuth';

const DISMISS_KEY = 'secondmind:em-banner-dismissed';
const COOLDOWN_KEY = 'secondmind:em-resend-cooldown';
const COOLDOWN_MS = 60_000;

export default function EmailVerificationBanner() {
  const { resendVerification, refreshUser } = useAuth();

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [cooldownEndsAt, setCooldownEndsAt] = useState<number>(() => {
    try {
      const raw = sessionStorage.getItem(COOLDOWN_KEY);
      const value = raw ? Number(raw) : 0;
      return Number.isFinite(value) && value > Date.now() ? value : 0;
    } catch {
      return 0;
    }
  });

  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000)),
  );

  const [sending, setSending] = useState(false);

  // Decrement segundo a segundo mientras hay cooldown activo
  useEffect(() => {
    if (cooldownEndsAt <= Date.now()) {
      setRemainingSeconds(0);
      return;
    }
    function tick() {
      const remaining = Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [cooldownEndsAt]);

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

  async function handleResend() {
    if (remainingSeconds > 0 || sending) return;
    setSending(true);
    try {
      await resendVerification();
      const ends = Date.now() + COOLDOWN_MS;
      setCooldownEndsAt(ends);
      try {
        sessionStorage.setItem(COOLDOWN_KEY, String(ends));
      } catch {
        // no-op
      }
    } catch {
      // No throw — el button queda habilitado, user puede reintentar
    } finally {
      setSending(false);
    }
  }

  if (dismissed) return null;

  const resendLabel = sending
    ? 'Enviando…'
    : remainingSeconds > 0
    ? `Enviado · ${remainingSeconds}s`
    : 'Reenviar enlace';

  return (
    <div
      role="status"
      className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-700 dark:text-amber-300"
    >
      <Mail className="size-4 shrink-0" aria-hidden />
      <p className="flex-1">Verificá tu email para asegurar tu cuenta.</p>
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
        aria-label="Cerrar"
        className="rounded-md p-1 transition-colors hover:bg-amber-500/15"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
