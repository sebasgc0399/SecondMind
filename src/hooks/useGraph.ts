import { useMemo } from 'react';
import { useTable } from 'tinybase/ui-react';
import type { GraphNode, GraphEdge } from 'reagraph';
import type { ParaType, NoteType } from '@/types/common';

const PARA_COLORS: Record<ParaType, string> = {
  project: '#3b82f6',
  area: '#22c55e',
  resource: '#f59e0b',
  archive: '#9ca3af',
};

const DEFAULT_COLOR = '#6b7280';

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}

export interface GraphFilters {
  paraType: ParaType | 'all';
  noteType: NoteType | 'all';
  minLinks: number;
}

export const DEFAULT_FILTERS: GraphFilters = {
  paraType: 'all',
  noteType: 'all',
  minLinks: 0,
};

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  isEmpty: boolean;
}

export default function useGraph(filters: GraphFilters = DEFAULT_FILTERS): GraphData {
  const notesTable = useTable('notes');
  const linksTable = useTable('links', 'links');

  return useMemo(() => {
    const visibleNodeIds = new Set<string>();
    const nodes: GraphNode[] = [];

    for (const [noteId, row] of Object.entries(notesTable)) {
      if (row.isArchived === true || row.isArchived === 1) continue;

      const title = typeof row.title === 'string' && row.title ? row.title : 'Sin titulo';
      const paraType = (row.paraType as ParaType) || 'resource';
      const noteType = (row.noteType as NoteType) || 'fleeting';
      const linkCount = typeof row.linkCount === 'number' ? row.linkCount : 0;

      if (filters.paraType !== 'all' && paraType !== filters.paraType) continue;
      if (filters.noteType !== 'all' && noteType !== filters.noteType) continue;
      if (linkCount < filters.minLinks) continue;

      visibleNodeIds.add(noteId);
      nodes.push({
        id: noteId,
        label: truncate(title, 25),
        fill: PARA_COLORS[paraType] || DEFAULT_COLOR,
        size: Math.max(5, Math.min(25, 5 + linkCount * 3)),
        data: {
          title,
          paraType,
          noteType,
          linkCount,
        },
      });
    }

    const edges: GraphEdge[] = [];
    for (const [linkId, row] of Object.entries(linksTable)) {
      const sourceId = row.sourceId as string;
      const targetId = row.targetId as string;
      if (!sourceId || !targetId) continue;
      if (!visibleNodeIds.has(sourceId) || !visibleNodeIds.has(targetId)) continue;

      edges.push({
        id: linkId,
        source: sourceId,
        target: targetId,
      });
    }

    return { nodes, edges, isEmpty: nodes.length < 3 };
  }, [notesTable, linksTable, filters]);
}
