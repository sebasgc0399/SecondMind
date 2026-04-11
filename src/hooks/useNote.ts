import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import type { JSONContent } from '@tiptap/core';
import { db } from '@/lib/firebase';
import useAuth from '@/hooks/useAuth';

interface UseNoteReturn {
  initialContent: JSONContent | null;
  isLoading: boolean;
  error: Error | null;
  notFound: boolean;
}

// MVP: carga one-shot con getDoc, no onSnapshot. Evita loops save/load
// donde nuestra propia escritura re-dispara el listener y resetea el
// editor. Multi-tab concurrent editing no soportado en MVP (last write wins).
export default function useNote(noteId: string | undefined): UseNoteReturn {
  const { user } = useAuth();
  const [state, setState] = useState<UseNoteReturn>({
    initialContent: null,
    isLoading: true,
    error: null,
    notFound: false,
  });

  useEffect(() => {
    if (!user || !noteId) {
      setState({ initialContent: null, isLoading: true, error: null, notFound: false });
      return;
    }

    let ignore = false;
    setState({ initialContent: null, isLoading: true, error: null, notFound: false });

    (async () => {
      try {
        const ref = doc(db, 'users', user.uid, 'notes', noteId);
        const snap = await getDoc(ref);
        if (ignore) return;

        if (!snap.exists()) {
          setState({ initialContent: null, isLoading: false, error: null, notFound: true });
          return;
        }

        const raw = snap.data().content as string | undefined;
        const parsed = parseContent(raw);
        setState({
          initialContent: parsed,
          isLoading: false,
          error: null,
          notFound: false,
        });
      } catch (error) {
        if (ignore) return;
        setState({
          initialContent: null,
          isLoading: false,
          error: error as Error,
          notFound: false,
        });
      }
    })();

    return () => {
      ignore = true;
    };
  }, [user, noteId]);

  return state;
}

function parseContent(raw: string | undefined): JSONContent {
  if (!raw) return emptyDoc();
  try {
    const parsed = JSON.parse(raw) as JSONContent;
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed;
    return emptyDoc();
  } catch {
    return emptyDoc();
  }
}

function emptyDoc(): JSONContent {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}
