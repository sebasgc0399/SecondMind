import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { notesRepo } from '@/infra/repos/notesRepo';
import { extractLinks } from '@/lib/editor/extractLinks';
import { computeDistillLevel } from '@/lib/editor/computeDistillLevel';
import { syncLinks } from '@/lib/editor/syncLinks';
import { saveContentQueue } from '@/lib/saveQueue';
import useAuth from '@/hooks/useAuth';
import type { QueueStatus } from '@/lib/saveQueue';
import type { Editor } from '@tiptap/react';

export const AUTOSAVE_DEBOUNCE_MS = 2000;
const SAVED_BADGE_MS = 1500;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'retrying' | 'error';

interface UseNoteSaveReturn {
  status: SaveStatus;
  flush: () => Promise<void>;
  summaryL3: string;
  setSummaryL3: (next: string) => void;
}

function subscribeToQueue(cb: () => void): () => void {
  return saveContentQueue.subscribe(cb);
}

export default function useNoteSave(
  noteId: string | undefined,
  editor: Editor | null,
  initialSummaryL3: string,
): UseNoteSaveReturn {
  const { user } = useAuth();
  const [summaryL3, setSummaryL3State] = useState<string>(() => initialSummaryL3);
  const [savedBadgeVisible, setSavedBadgeVisible] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const noteIdRef = useRef<string | undefined>(noteId);
  const uidRef = useRef<string | null>(null);
  const pendingRef = useRef<boolean>(false);
  const summaryL3Ref = useRef<string>(initialSummaryL3);
  const prevQueueStatusRef = useRef<QueueStatus | undefined>(undefined);

  // eslint-disable-next-line react-hooks/refs -- cache de props/state para acceso en callback estable (`save` con [] deps); refactor cambia comportamiento. Backlog
  editorRef.current = editor;
  // eslint-disable-next-line react-hooks/refs -- ver línea anterior
  noteIdRef.current = noteId;
  // eslint-disable-next-line react-hooks/refs -- ver línea anterior
  uidRef.current = user?.uid ?? null;
  // eslint-disable-next-line react-hooks/refs -- ver línea anterior
  summaryL3Ref.current = summaryL3;

  const getQueueEntry = useCallback(
    () => (noteId ? saveContentQueue.getEntry(noteId) : undefined),
    [noteId],
  );
  const queueEntry = useSyncExternalStore(subscribeToQueue, getQueueEntry, () => undefined);

  const status: SaveStatus = useMemo(() => {
    if (savedBadgeVisible) return 'saved';
    if (!queueEntry) return 'idle';
    switch (queueEntry.status) {
      case 'pending':
      case 'syncing':
        return 'saving';
      case 'retrying':
        return 'retrying';
      case 'error':
        return 'error';
      case 'synced':
        return 'saved';
    }
  }, [queueEntry, savedBadgeVisible]);

  // Latch del badge "✓ Guardado" 1.5s al transicionar a synced. Cuando el queue
  // GC-ea la entry tras synced, queueEntry pasa a undefined; el badge se mantiene
  // visible hasta que el timer expire (no depende del queue para el bookkeeping).
  useEffect(() => {
    const current = queueEntry?.status;
    const prev = prevQueueStatusRef.current;
    prevQueueStatusRef.current = current;

    if (current === 'synced' && prev !== 'synced') {
      setSavedBadgeVisible(true);
      const timerId = window.setTimeout(() => setSavedBadgeVisible(false), SAVED_BADGE_MS);
      return () => window.clearTimeout(timerId);
    }
  }, [queueEntry?.status]);

  const save = useCallback(async () => {
    const currentEditor = editorRef.current;
    const currentNoteId = noteIdRef.current;
    const currentUid = uidRef.current;
    if (!currentEditor || !currentNoteId || !currentUid) return;
    if (!pendingRef.current) return;

    // Guard único: NO encolar si hay error pending para este noteId. El usuario
    // debe resolverlo via SaveErrorBanner antes de que se reanuden saves.
    const currentEntry = saveContentQueue.getEntry(currentNoteId);
    if (currentEntry?.status === 'error') return;

    pendingRef.current = false;

    const json = currentEditor.getJSON();
    const contentPlain = currentEditor.getText();
    const firstLine = contentPlain.split('\n', 1)[0]?.trim() ?? '';
    const title = firstLine.slice(0, 200) || 'Sin título';
    const updatedAt = Date.now();
    const currentSummaryL3 = summaryL3Ref.current;
    const distillLevel = computeDistillLevel(json, currentSummaryL3);

    try {
      const extracted = extractLinks(json);
      const { outgoingLinkIds, linkCount } = await syncLinks({
        sourceId: currentNoteId,
        sourceTitle: title,
        userId: currentUid,
        newLinks: extracted,
      });

      saveContentQueue.enqueue(
        currentNoteId,
        {
          content: JSON.stringify(json),
          contentPlain,
          title,
          updatedAt,
          summaryL3: currentSummaryL3,
          distillLevel,
          linkCount,
          outgoingLinkIds,
        },
        (payload) => notesRepo.saveContent(currentNoteId, payload),
      );
    } catch (error) {
      // syncLinks falló (pre-queue). Restaurar pendingRef para que el próximo
      // save() reintente. Path conocido fuera de scope F28 (deuda visible).
      console.error('[useNoteSave] save failed (pre-queue)', error);
      pendingRef.current = true;
    }
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await save();
  }, [save]);

  // Un solo timer compartido entre editor y textarea del summary: el ultimo
  // keystroke de cualquiera de los dos reinicia el debounce. Intencional, evita
  // writes paralelos con distillLevel stale.
  const setSummaryL3 = useCallback(
    (next: string) => {
      setSummaryL3State(next);
      pendingRef.current = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void save();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [save],
  );

  useEffect(() => {
    if (!editor) return;

    function handleUpdate() {
      pendingRef.current = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void save();
      }, AUTOSAVE_DEBOUNCE_MS);
    }

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, save]);

  // Cleanup F22: timers locales del debounce. NO cancelar el queue entry — el
  // retry sigue corriendo background si el usuario navega a otra nota. Si hay
  // pendingRef sin encolar todavía, intento flush best-effort al unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (pendingRef.current) {
        void save();
      }
    };
  }, [save]);

  return { status, flush, summaryL3, setSummaryL3 };
}
