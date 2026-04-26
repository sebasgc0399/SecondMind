import { useEffect, useMemo, useRef, useState } from 'react';
import {
  insertMultiple,
  search,
  type AnyOrama,
  type Results,
  type AnyDocument,
} from '@orama/orama';
import { notesStore } from '@/stores/notesStore';
import { createNotesIndex, rowToOramaDoc, type NoteOramaDoc } from '@/lib/orama';
import { useStoreHydration } from '@/hooks/useStoreHydration';

interface UseNoteSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  results: NoteOramaDoc[];
  isInitializing: boolean;
}

const SEARCH_LIMIT = 50;

// Hook que mantiene un índice Orama derivado del notesStore. Estrategia:
// full rebuild en cada change del table. Para ~100 notas es <50ms — el
// trade-off vs sync incremental es: menos código, sin edge cases con
// detección de deletes. Se puede optimizar a updates incrementales si
// el corpus crece >1k.
export default function useNoteSearch(): UseNoteSearchReturn {
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState(0);
  const { isHydrating } = useStoreHydration();
  const dbRef = useRef<AnyOrama | null>(null);

  useEffect(() => {
    function rebuild() {
      const db = createNotesIndex();
      const table = notesStore.getTable('notes');
      // Excluir notas eliminadas del índice — ahorra search work y previene
      // que aparezcan tras un cambio que no dispare el filter post-search.
      const docs = Object.entries(table)
        .map(([id, row]) => rowToOramaDoc(id, row))
        .filter((doc) => doc.deletedAt === 0);
      if (docs.length > 0) insertMultiple(db, docs);
      dbRef.current = db;
      setVersion((v) => v + 1);
    }

    rebuild();
    const listenerId = notesStore.addTableListener('notes', () => rebuild());

    return () => {
      notesStore.delListener(listenerId);
    };
  }, []);

  const results = useMemo<NoteOramaDoc[]>(() => {
    const db = dbRef.current;
    const trimmed = query.trim();

    if (!trimmed) {
      // Sin query: leer todo el table, filtrar archivadas, ordenar por updatedAt desc
      const table = notesStore.getTable('notes');
      return Object.entries(table)
        .map(([id, row]) => rowToOramaDoc(id, row))
        .filter((doc) => !doc.isArchived && doc.deletedAt === 0)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    if (!db) return [];

    // search() retorna Results | Promise<Results> en el tipo, pero al no
    // usar componentes async la versión runtime es sync. Cast explícito.
    const result = search(db, {
      term: trimmed,
      properties: ['title', 'contentPlain'],
      limit: SEARCH_LIMIT,
    }) as Results<AnyDocument>;

    return result.hits
      .map((hit) => hit.document as unknown as NoteOramaDoc)
      .filter((doc) => !doc.isArchived && doc.deletedAt === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 'version' es counter explícito para invalidar el memo tras Orama rebuild
  }, [query, version]);

  return { query, setQuery, results, isInitializing: isHydrating };
}
