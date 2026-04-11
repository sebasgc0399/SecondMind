import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import type { Editor } from '@tiptap/react';
import { db } from '@/lib/firebase';
import { notesStore } from '@/stores/notesStore';
import { stringifyIds } from '@/lib/tinybase';
import { extractLinks } from '@/lib/editor/extractLinks';
import { syncLinks } from '@/lib/editor/syncLinks';
import useAuth from '@/hooks/useAuth';

export const AUTOSAVE_DEBOUNCE_MS = 2000;
const SAVED_BADGE_MS = 1500;

export type SaveStatus = 'idle' | 'saving' | 'saved';

interface UseNoteSaveReturn {
  status: SaveStatus;
  flush: () => Promise<void>;
}

export default function useNoteSave(
  noteId: string | undefined,
  editor: Editor | null,
): UseNoteSaveReturn {
  const { user } = useAuth();
  const [status, setStatus] = useState<SaveStatus>('idle');

  const timerRef = useRef<number | null>(null);
  const savedBadgeRef = useRef<number | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const noteIdRef = useRef<string | undefined>(noteId);
  const uidRef = useRef<string | null>(null);
  const pendingRef = useRef<boolean>(false);

  editorRef.current = editor;
  noteIdRef.current = noteId;
  uidRef.current = user?.uid ?? null;

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

      await updateDoc(doc(db, 'users', currentUid, 'notes', currentNoteId), {
        content: JSON.stringify(json),
        contentPlain,
        title,
        updatedAt,
      });

      const extracted = extractLinks(json);
      const { outgoingLinkIds, linkCount } = await syncLinks({
        sourceId: currentNoteId,
        sourceTitle: title,
        userId: currentUid,
        newLinks: extracted,
      });

      notesStore.setPartialRow('notes', currentNoteId, {
        title,
        contentPlain,
        updatedAt,
        linkCount,
        outgoingLinkIds: stringifyIds(outgoingLinkIds),
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

  return { status, flush };
}
