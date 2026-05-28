import { useEffect, useState } from 'react';
import useAuth from '@/hooks/useAuth';

// Cooldown compartido entre el banner inline (Layout, F47.F4) y la
// pantalla intersticial /verify-email (post-C1 audit 2026-05). La key
// vive en sessionStorage para que cooldown sobreviva re-mounts del
// componente (ej. transición de /verify-email → / tras emailVerified)
// pero NO entre sesiones del browser.
const COOLDOWN_KEY = 'secondmind:em-resend-cooldown';
const COOLDOWN_MS = 60_000;

interface UseEmailVerificationResend {
  remainingSeconds: number;
  sending: boolean;
  handleResend: () => Promise<void>;
}

export default function useEmailVerificationResend(): UseEmailVerificationResend {
  const { resendVerification } = useAuth();

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
        // sessionStorage no disponible (modo privado strict) — no-op
      }
    } catch {
      // No throw — el button queda habilitado, user puede reintentar
    } finally {
      setSending(false);
    }
  }

  return { remainingSeconds, sending, handleResend };
}
