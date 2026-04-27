import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import useAuth from '@/hooks/useAuth';
import type { JSONContent } from '@tiptap/core';

interface UseNoteReturn {
  initialContent: JSONContent | null;
  initialSummaryL3: string;
  isLoading: boolean;
  error: Error | null;
  notFound: boolean;
}

// MVP: carga one-shot con getDoc, no onSnapshot. Evita loops save/load
// donde nuestra propia escritura re-dispara el listener y resetea el
// editor. Multi-tab concurrent editing no soportado en MVP (last write wins).
//
// `version` (opcional, default 0): bump manual desde el caller para forzar
// re-fetch sin cambiar noteId. Caso de uso: discard de cambios locales
// post-error de save (F28) — el caller incrementa version, el effect re-corre,
// getDoc trae el content server-side fresh.
export default function useNote(noteId: string | undefined, version = 0): UseNoteReturn {
  const { user } = useAuth();
  const [state, setState] = useState<UseNoteReturn>({
    initialContent: null,
    initialSummaryL3: '',
    isLoading: true,
    error: null,
    notFound: false,
  });

  useEffect(() => {
    if (!user || !noteId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetcher MVP one-shot con state local; migrar a Suspense/datafetcher (React Query, Suspense data) es refactor de capa, fuera del scope del cleanup F10
      setState({
        initialContent: null,
        initialSummaryL3: '',
        isLoading: true,
        error: null,
        notFound: false,
      });
      return;
    }

    let ignore = false;
    setState({
      initialContent: null,
      initialSummaryL3: '',
      isLoading: true,
      error: null,
      notFound: false,
    });

    (async () => {
      try {
        const ref = doc(db, 'users', user.uid, 'notes', noteId);
        const snap = await getDoc(ref);
        if (ignore) return;

        if (!snap.exists()) {
          setState({
            initialContent: null,
            initialSummaryL3: '',
            isLoading: false,
            error: null,
            notFound: true,
          });
          return;
        }

        const data = snap.data();
        const deletedAt = (data.deletedAt as number | undefined) ?? 0;
        if (deletedAt > 0) {
          setState({
            initialContent: null,
            initialSummaryL3: '',
            isLoading: false,
            error: null,
            notFound: true,
          });
          return;
        }
        const raw = data.content as string | undefined;
        const parsed = parseContent(raw);
        const summaryL3 = (data.summaryL3 as string | undefined) ?? '';
        setState({
          initialContent: parsed,
          initialSummaryL3: summaryL3,
          isLoading: false,
          error: null,
          notFound: false,
        });
      } catch (error) {
        if (ignore) return;
        setState({
          initialContent: null,
          initialSummaryL3: '',
          isLoading: false,
          error: error as Error,
          notFound: false,
        });
      }
    })();

    return () => {
      ignore = true;
    };
  }, [user, noteId, version]);

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
