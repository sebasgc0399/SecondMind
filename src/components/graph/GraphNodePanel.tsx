import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ParaType, NoteType } from '@/types/common';
import { useNoteTypeLabels, useParaTypeLabels } from '@/lib/entityLabels';

interface GraphNodePanelProps {
  nodeId: string;
  title: string;
  paraType: ParaType;
  noteType: NoteType;
  linkCount: number;
  onClose: () => void;
}

const PARA_BADGE_COLORS: Record<ParaType, string> = {
  project: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  area: 'bg-green-500/15 text-green-700 dark:text-green-400',
  resource: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  archive: 'bg-gray-500/15 text-gray-700 dark:text-gray-400',
};

export default function GraphNodePanel({
  nodeId,
  title,
  paraType,
  noteType,
  linkCount,
  onClose,
}: GraphNodePanelProps) {
  const { t } = useTranslation();
  const noteTypeLabels = useNoteTypeLabels();
  const paraTypeLabels = useParaTypeLabels();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute right-4 top-4 z-10 w-72 rounded-lg border border-border bg-background p-4 shadow-lg"
    >
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <span
          className={`rounded-md px-2 py-0.5 text-xs font-medium ${PARA_BADGE_COLORS[paraType]}`}
        >
          {paraTypeLabels[paraType]}
        </span>
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          {noteTypeLabels[noteType]}
        </span>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">
        {t('graph.stats.connections', { count: linkCount })}
      </p>

      <Link
        to={`/notes/${nodeId}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
      >
        {t('graph.node.openNote', 'Abrir nota →')}
      </Link>
    </div>
  );
}
