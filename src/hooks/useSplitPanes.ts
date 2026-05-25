import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useRow } from 'tinybase/ui-react';

export type RightPaneStatus = 'idle' | 'loading' | 'ready' | 'not-found';

interface UseSplitPanesReturn {
  leftNoteId: string;
  rightNoteId: string | null;
  isOpen: boolean;
  rightStatus: RightPaneStatus;
  openSplit: (noteId: string) => void;
  closeSplit: (side?: 'left' | 'right') => void;
}

// Grace period antes de declarar 'not-found': TinyBase puede estar hidratando
// la row desde Firestore al primer mount. Sin grace, se mostraría "Nota no
// encontrada" durante ~100-300ms del primer load aunque el id sea válido.
const HYDRATION_GRACE_MS = 500;

// Auto-cierre del split si rightStatus queda 'not-found' sin acción del user.
// Le da tiempo al user a leer el mensaje y decidir antes de que la URL se
// auto-limpie. Cerrar antes (Cmd+\ o botón) cancela el timer.
const NOT_FOUND_AUTO_CLOSE_MS = 5000;

export default function useSplitPanes(currentNoteId: string): UseSplitPanesReturn {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawRightId = searchParams.get('split');

  // Same-note guard: si ?split= apunta a la misma nota actual, tratar como sin
  // split. El effect debajo limpia el query param silencioso (UX: la URL se
  // "auto-corrige", el user no nota nada). Caso edge — el picker F46.4 ya
  // filtra currentNoteId de su lista, así que esto solo aplica a URL manual.
  const sameNote = rawRightId !== null && rawRightId === currentNoteId;
  const rightNoteId = sameNote ? null : rawRightId;
  const isOpen = rightNoteId !== null;

  useEffect(() => {
    if (!sameNote) return;
    console.warn(
      `[useSplitPanes] ?split=${rawRightId} matches current noteId; stripping query param.`,
    );
    const next = new URLSearchParams(searchParams);
    next.delete('split');
    setSearchParams(next, { replace: true });
  }, [sameNote, rawRightId, searchParams, setSearchParams]);

  // TinyBase row reactiva: re-render cuando la row se hidrata desde Firestore.
  // Pasar '' cuando rightNoteId es null (rules of hooks prohibe conditional);
  // el resultado se ignora porque rightExistsInStore chequea null primero.
  const rightRow = useRow('notes', rightNoteId ?? '');
  const rightExistsInStore = rightNoteId !== null && Object.keys(rightRow).length > 0;

  // Grace period: durante 500ms post-mount del split, la ausencia de row se
  // trata como 'loading' (TinyBase puede estar hidratando). Si la row aparece
  // antes, el cleanup del timeout corre y graceExpired no cambia. Si no, pasa
  // a true → status final 'not-found'.
  const [graceExpired, setGraceExpired] = useState(false);
  useEffect(() => {
    if (!isOpen || rightExistsInStore) {
      setGraceExpired(false);
      return;
    }
    const id = window.setTimeout(() => setGraceExpired(true), HYDRATION_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [isOpen, rightExistsInStore]);

  const rightStatus: RightPaneStatus = !isOpen
    ? 'idle'
    : rightExistsInStore
    ? 'ready'
    : graceExpired
    ? 'not-found'
    : 'loading';

  // Auto-cierre 5s tras quedar 'not-found' sin acción del user. Si el user
  // cierra antes (botón X / Cmd+\), searchParams cambia, effect re-corre,
  // cleanup del timeout cancela el auto-close.
  useEffect(() => {
    if (rightStatus !== 'not-found') return;
    const id = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('split');
      setSearchParams(next, { replace: true });
    }, NOT_FOUND_AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [rightStatus, searchParams, setSearchParams]);

  const openSplit = useCallback(
    (noteId: string) => {
      if (noteId === currentNoteId) {
        console.warn(`[useSplitPanes] openSplit(${noteId}) blocked: matches current noteId.`);
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.set('split', noteId);
      setSearchParams(next);
    },
    [currentNoteId, searchParams, setSearchParams],
  );

  const closeSplit = useCallback(
    (side: 'left' | 'right' = 'right') => {
      if (side === 'left' && rightNoteId !== null) {
        // Promover pane derecho a principal: navegar a /notes/{rightNoteId}.
        // El search param se descarta (no llevamos ?split= al promote).
        navigate(`/notes/${rightNoteId}`, { replace: true });
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.delete('split');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, navigate, rightNoteId],
  );

  return {
    leftNoteId: currentNoteId,
    rightNoteId,
    isOpen,
    rightStatus,
    openSplit,
    closeSplit,
  };
}
