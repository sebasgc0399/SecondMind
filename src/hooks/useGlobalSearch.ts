import { useEffect, useMemo, useRef, useState } from 'react';
import {
  insertMultiple,
  search,
  type AnyOrama,
  type Results,
  type AnyDocument,
} from '@orama/orama';
import { notesStore } from '@/stores/notesStore';
import { tasksStore } from '@/stores/tasksStore';
import { projectsStore } from '@/stores/projectsStore';
import {
  createGlobalIndex,
  noteRowToGlobalDoc,
  taskRowToGlobalDoc,
  projectRowToGlobalDoc,
  type GlobalDocType,
  type GlobalOramaDoc,
} from '@/lib/orama';

export interface SearchResult {
  id: string;
  type: GlobalDocType;
  title: string;
  snippet: string;
  updatedAt: number;
}

const SEARCH_LIMIT = 15;
const RECENTS_LIMIT = 5;
const REBUILD_DEBOUNCE_MS = 100;

export default function useGlobalSearch(query: string): SearchResult[] {
  const dbRef = useRef<AnyOrama | null>(null);
  const [version, setVersion] = useState(0);
  const rebuildTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Rebuild the unified Orama index from all 3 stores.
  // Orama v3 create/insertMultiple are sync at runtime (no async components).
  useEffect(() => {
    function rebuild() {
      const db = createGlobalIndex();
      const docs: GlobalOramaDoc[] = [];

      const notesTable = notesStore.getTable('notes');
      for (const [id, row] of Object.entries(notesTable)) {
        if (row.isArchived) continue;
        docs.push(noteRowToGlobalDoc(id, row));
      }

      const tasksTable = tasksStore.getTable('tasks');
      for (const [id, row] of Object.entries(tasksTable)) {
        if (row.isArchived || (row.status as string) === 'completed') continue;
        docs.push(taskRowToGlobalDoc(id, row));
      }

      const projectsTable = projectsStore.getTable('projects');
      for (const [id, row] of Object.entries(projectsTable)) {
        if (row.isArchived) continue;
        docs.push(projectRowToGlobalDoc(id, row));
      }

      if (docs.length > 0) insertMultiple(db, docs);
      dbRef.current = db;
      setVersion((v) => v + 1);
    }

    function scheduleRebuild() {
      clearTimeout(rebuildTimerRef.current);
      rebuildTimerRef.current = setTimeout(rebuild, REBUILD_DEBOUNCE_MS);
    }

    rebuild();
    const l1 = notesStore.addTableListener('notes', scheduleRebuild);
    const l2 = tasksStore.addTableListener('tasks', scheduleRebuild);
    const l3 = projectsStore.addTableListener('projects', scheduleRebuild);
    return () => {
      clearTimeout(rebuildTimerRef.current);
      notesStore.delListener(l1);
      tasksStore.delListener(l2);
      projectsStore.delListener(l3);
    };
  }, []);

  // search() returns Results | Promise<Results> in the type but the
  // runtime version is sync (no async components). Explicit cast.
  return useMemo<SearchResult[]>(() => {
    const trimmed = query.trim();

    if (!trimmed) return getRecents();

    const db = dbRef.current;
    if (!db) return [];

    const result = search(db, {
      term: trimmed,
      properties: ['title', 'body'],
      limit: SEARCH_LIMIT,
    }) as Results<AnyDocument>;

    return result.hits.map((hit) => {
      const doc = hit.document as unknown as GlobalOramaDoc;
      return {
        id: doc.id,
        type: doc._type,
        title: doc.title,
        snippet: doc.body.slice(0, 100),
        updatedAt: doc.updatedAt,
      };
    });
  }, [query, version]);
}

function getRecents(): SearchResult[] {
  const all: SearchResult[] = [];

  const notesTable = notesStore.getTable('notes');
  for (const [id, row] of Object.entries(notesTable)) {
    if (row.isArchived) continue;
    all.push({
      id,
      type: 'note',
      title: ((row.title as string) || '').trim() || 'Sin título',
      snippet: ((row.contentPlain as string) || '').slice(0, 100),
      updatedAt: Number(row.updatedAt) || 0,
    });
  }

  const tasksTable = tasksStore.getTable('tasks');
  for (const [id, row] of Object.entries(tasksTable)) {
    if (row.isArchived || (row.status as string) === 'completed') continue;
    all.push({
      id,
      type: 'task',
      title: ((row.name as string) || '').trim() || 'Sin título',
      snippet: ((row.description as string) || '').slice(0, 100),
      updatedAt: Number(row.updatedAt) || 0,
    });
  }

  const projectsTable = projectsStore.getTable('projects');
  for (const [id, row] of Object.entries(projectsTable)) {
    if (row.isArchived) continue;
    all.push({
      id,
      type: 'project',
      title: ((row.name as string) || '').trim() || 'Sin título',
      snippet: '',
      updatedAt: Number(row.updatedAt) || 0,
    });
  }

  return all.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENTS_LIMIT);
}
