import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useRow } from 'tinybase/ui-react';
import SplitPaneLayout from '@/components/notes/SplitPaneLayout';
import useNote from '@/hooks/useNote';
import { saveNotesCreatesQueue } from '@/lib/saveQueue';

// Estable a nivel módulo para useSyncExternalStore (evita re-suscripciones).
const subscribeToCreatesQueue = (cb: () => void): (() => void) =>
  saveNotesCreatesQueue.subscribe(cb);

export default function NoteDetailPage() {
  const { noteId } = useParams<{ noteId: string }>();
  const navigate = useNavigate();
  const row = useRow('notes', noteId ?? '');
  // useNote acá actúa SOLO como signal anti-race con la hidratación de TinyBase:
  // sin isLoading, el redirect dispararía durante el primer mount del direct-link
  // antes de que el store hidrate. La data real (initialContent, etc.) la carga
  // NoteEditorContainer internamente con su propio useNote(noteId). 2 getDoc
  // calls para el mismo doc — costo trivial (~1ms cada, Firestore caching),
  // aceptable vs over-engineering con context/lifting.
  const { isLoading, notFound } = useNote(noteId);

  // F30.4 G3': cross-check con saveNotesCreatesQueue para tolerar la ventana
  // entre createNote() retorna el id y el flush termina. Sin esto, getDoc
  // (notFound) o un onSnapshot post-error dispararían un redirect erróneo
  // aunque el create esté pending o el usuario pueda reintentar desde el indicator.
  const getCreateEntry = useCallback(
    () => (noteId ? saveNotesCreatesQueue.getEntry(noteId) : undefined),
    [noteId],
  );
  const createEntry = useSyncExternalStore(subscribeToCreatesQueue, getCreateEntry);
  const isCreatePending = createEntry !== undefined && createEntry.status !== 'synced';

  const existsInStore = noteId && Object.keys(row).length > 0;

  useEffect(() => {
    if (!noteId) {
      navigate('/notes', { replace: true });
      return;
    }
    if (!isLoading && (notFound || !existsInStore) && !isCreatePending) {
      navigate('/notes', { replace: true });
    }
  }, [noteId, isLoading, notFound, existsInStore, navigate, isCreatePending]);

  if (!noteId || isLoading || ((notFound || !existsInStore) && !isCreatePending)) {
    return <NoteEditorSkeleton />;
  }

  // NoteEditorContainer maneja su propio error state internamente. Aquí ya
  // sabemos que noteId existe y NO está pending (gating arriba), así que
  // delegamos al SplitPaneLayout que monta el container del pane izquierdo
  // y opcionalmente el del derecho según ?split=.
  return <SplitPaneLayout currentNoteId={noteId} />;
}

function NoteEditorSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-3 px-4 py-6">
      <div className="h-6 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  );
}
