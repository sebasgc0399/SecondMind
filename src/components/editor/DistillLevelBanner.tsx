import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useCell } from 'tinybase/ui-react';
import useAuth from '@/hooks/useAuth';
import usePreferences from '@/hooks/usePreferences';
import { markDistillBannerSeen } from '@/lib/preferences';

interface DistillLevelBannerProps {
  noteId: string;
}

const COPY: Record<1 | 2 | 3, string> = {
  1: 'Subiste a L1 · Pasajes clave marcados',
  2: 'Subiste a L2 · Esenciales resaltados',
  3: 'Llegaste a L3 · Nota destilada',
};

// Mini-banner inline que se muestra durante 3s cuando distillLevel sube de
// un nivel a otro mas alto. Persistencia per-nivel cross-device en
// UserPreferences.distillBannersSeen via dot-notation Firestore (helper
// markDistillBannerSeen). Se muestra una sola vez por nivel por usuario.
//
// Trigger basado en valor persistido (TinyBase post-autosave 2s), no en
// estado live del editor: el badge cambia color al mismo tick que el banner
// aparece. Coherencia visual garantizada.
//
// Edge cases:
// - Mount con nota ya en L>=1: no banner. Primer render captura el nivel
//   actual sin disparar (previousLevelRef arranca undefined).
// - Transicion descendente (L3->L2 al borrar summary): no banner.
// - Transicion ascendente con nivel ya visto: no banner.
// - User navega <2s tras Ctrl+B: NoteEditor desmonta antes de que el cell
//   actualice. Banner anclado al editor — comportamiento esperado.
export default function DistillLevelBanner({ noteId }: DistillLevelBannerProps) {
  const raw = useCell('notes', noteId, 'distillLevel');
  const level = (Number(raw) || 0) as 0 | 1 | 2 | 3;
  const { user } = useAuth();
  const { preferences, isLoaded } = usePreferences();
  const previousLevelRef = useRef<number | undefined>(undefined);
  const [visibleLevel, setVisibleLevel] = useState<1 | 2 | 3 | null>(null);

  useEffect(() => {
    // Primer render: capturamos el nivel actual sin disparar. Asi
    // re-mounts (key={noteId} en page.tsx) sobre notas pre-existentes
    // en L>=1 no muestran banner espureo.
    if (previousLevelRef.current === undefined) {
      previousLevelRef.current = level;
      return;
    }
    const previous = previousLevelRef.current;
    previousLevelRef.current = level;

    if (level <= previous) return;
    if (!isLoaded) return;
    if (!user) return;
    const target = level as 1 | 2 | 3;
    const key = `l${target}` as 'l1' | 'l2' | 'l3';
    if (preferences.distillBannersSeen[key]) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- side-effect genuino: trigger del banner cuando el cell `distillLevel` cambia post-autosave. Auto-hide vive en useEffect aparte (F22 — el cleanup compartido pisaba el banner durante onSnapshot)
    setVisibleLevel(target);
    void markDistillBannerSeen(user.uid, target);
  }, [level, isLoaded, user, preferences.distillBannersSeen]);

  // Auto-hide separado del trigger: si lo mantenemos en el mismo useEffect,
  // el cleanup lo cancela cuando preferences cambia tras markDistillBannerSeen
  // → onSnapshot, dejando el banner visible para siempre.
  useEffect(() => {
    if (visibleLevel === null) return;
    const timerId = window.setTimeout(() => setVisibleLevel(null), 3000);
    return () => window.clearTimeout(timerId);
  }, [visibleLevel]);

  if (visibleLevel === null) return null;

  return (
    <div className="mx-auto w-full max-w-180 px-4 pt-3" role="status" aria-live="polite">
      <div className="flex animate-in items-center gap-2 rounded-r-md border-l-2 border-violet-500 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-700 duration-200 fade-in slide-in-from-top-1 dark:text-violet-300">
        <Sparkles className="h-3.5 w-3.5" />
        <span>{COPY[visibleLevel]}</span>
      </div>
    </div>
  );
}
