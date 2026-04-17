import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import type { Editor } from '@tiptap/react';
import { db } from '@/lib/firebase';
import { notesStore } from '@/stores/notesStore';
import { stringifyIds } from '@/lib/tinybase';
import { extractLinks } from '@/lib/editor/extractLinks';
import { computeDistillLevel } from '@/lib/editor/computeDistillLevel';
import { syncLinks } from '@/lib/editor/syncLinks';
import useAuth from '@/hooks/useAuth';

export const AUTOSAVE_DEBOUNCE_MS = 2000;
const SAVED_BADGE_MS = 1500;

export type SaveStatus = 'idle' | 'saving' | 'saved';

interface UseNoteSaveReturn {
  status: SaveStatus;
  flush: () => Promise<void>;
  summaryL3: string;
  setSummaryL3: (next: string) => void;
}

export default function useNoteSave(
  noteId: string | undefined,
  editor: Editor | null,
  initialSummaryL3: string,
): UseNoteSaveReturn {
  const { user } = useAuth();
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [summaryL3, setSummaryL3State] = useState<string>(() => initialSummaryL3);

  const timerRef = useRef<number | null>(null);
  const savedBadgeRef = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const noteIdRef = useRef<string | undefined>(noteId);
  const uidRef = useRef<string | null>(null);
  const pendingRef = useRef<boolean>(false);
  const summaryL3Ref = useRef<string>(initialSummaryL3);

  editorRef.current = editor;
  noteIdRef.current = noteId;
  uidRef.current = user?.uid ?? null;
  summaryL3Ref.current = summaryL3;

  const save = useCallback(async () => {
    const currentEditor = editorRef.current;
    const currentNoteId = noteIdRef.current;
    const currentUid = uidRef.current;
    if (!currentEditor || !currentNoteId || !currentUid) return;
    if (!pendingRef.current) return;

    pendingRef.current = false;
    setStatus('saving');

    try {
      const json = currentEditor.getJSON();
      const contentPlain = currentEditor.getText();
      const firstLine = contentPlain.split('\n', 1)[0]?.trim() ?? '';
      const title = firstLine.slice(0, 200) || 'Sin título';
      const updatedAt = Date.now();
      const summaryL3 = summaryL3Ref.current;
      const distillLevel = computeDistillLevel(json, summaryL3);

      const extracted = extractLinks(json);
      const { outgoingLinkIds, linkCount } = await syncLinks({
        sourceId: currentNoteId,
        sourceTitle: title,
        userId: currentUid,
        newLinks: extracted,
      });

      // Optimistic: TinyBase se actualiza sync antes del updateDoc. Si el
      // write a Firestore falla, pendingRef vuelve a true y el retry re-escribe
      // los mismos datos (idempotente). Reduce latency percibido del badge
      // distillLevel de "2s + red" a "2s puros" (consistente con useHabits).
      notesStore.setPartialRow('notes', currentNoteId, {
        title,
        contentPlain,
        updatedAt,
        linkCount,
        outgoingLinkIds: stringifyIds(outgoingLinkIds),
        summaryL3,
        distillLevel,
      });

      await updateDoc(doc(db, 'users', currentUid, 'notes', currentNoteId), {
        content: JSON.stringify(json),
        contentPlain,
        title,
        updatedAt,
        summaryL3,
        distillLevel,
      });

      setStatus('saved');
      if (savedBadgeRef.current) window.clearTimeout(savedBadgeRef.current);
      savedBadgeRef.current = window.setTimeout(() => {
        setStatus((prev) => (prev === 'saved' ? 'idle' : prev));
      }, SAVED_BADGE_MS);
    } catch (error) {
      console.error('[useNoteSave] save failed', error);
      pendingRef.current = true;
      setStatus('idle');
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
      setStatus('idle');
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
      setStatus('idle');
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

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (savedBadgeRef.current) {
        window.clearTimeout(savedBadgeRef.current);
        savedBadgeRef.current = null;
      }
      if (pendingRef.current) {
        void save();
      }
    };
  }, [save]);

  return { status, flush, summaryL3, setSummaryL3 };
}
