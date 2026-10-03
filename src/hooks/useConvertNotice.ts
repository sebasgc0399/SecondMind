import { useCallback, useEffect, useState } from 'react';
import type { ConvertSelectionResult } from '@/hooks/useConvertSelectionToNote';

export const CONVERT_NOTICE_MS = 3000;

export type ConvertNoticeKind = 'done' | 'error';

interface ConvertNoticeState {
  kind: ConvertNoticeKind;
  // Cada evento es un objeto nuevo: dos 'done' seguidos reinician el timer.
  eventId: number;
}

/**
 * Aviso efímero de "Convertir en nota" (no hay librería de toasts: mismo patrón que el
 * badge "Guardado", estado + timer). 'noop' no avisa y limpia un aviso previo.
 */
export default function useConvertNotice() {
  const [notice, setNotice] = useState<ConvertNoticeState | null>(null);

  const handleConvertResult = useCallback((result: ConvertSelectionResult) => {
    setNotice((previous) =>
      result === 'noop' ? null : { kind: result, eventId: (previous?.eventId ?? 0) + 1 },
    );
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timerId = window.setTimeout(() => setNotice(null), CONVERT_NOTICE_MS);
    return () => window.clearTimeout(timerId);
  }, [notice]);

  return { notice: notice?.kind ?? null, handleConvertResult };
}
