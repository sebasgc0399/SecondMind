import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { AREAS, type AreaKey } from '@/types/area';
import type { Priority } from '@/types/common';
import type { InboxAiResult, InboxItem, InboxResultType } from '@/types/inbox';

type ProcessedKind = 'note' | 'task' | 'project' | 'trash';

interface InboxProcessorFormProps {
  item: InboxItem;
  isLast: boolean;
  isProcessed: boolean;
  processedAs?: ProcessedKind;
  onCreate: (edited: InboxAiResult) => void | Promise<void>;
  onDismiss: () => void;
}

const PROCESSED_LABELS: Record<ProcessedKind, string> = {
  note: '✓ Ya procesado como nota',
  task: '✓ Ya procesado como tarea',
  project: '✓ Ya procesado como proyecto',
  trash: '✓ Descartado',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

function buildInitialDraft(item: InboxItem): InboxAiResult {
  if (item.aiResult) return { ...item.aiResult };
  const fallbackTitle = item.rawContent.slice(0, 80) || '';
  return {
    suggestedTitle: fallbackTitle,
    suggestedType: 'note',
    suggestedTags: [],
    suggestedArea: 'conocimiento',
    summary: '',
    priority: 'medium',
  };
}

export default function InboxProcessorForm({
  item,
  isLast,
  isProcessed,
  processedAs,
  onCreate,
  onDismiss,
}: InboxProcessorFormProps) {
  const [draft, setDraft] = useState<InboxAiResult>(() => buildInitialDraft(item));
  const [tagsRaw, setTagsRaw] = useState(() => buildInitialDraft(item).suggestedTags.join(', '));

  if (isProcessed) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-6 text-center">
        <p className="text-lg font-medium text-foreground">
          {processedAs ? PROCESSED_LABELS[processedAs] : '✓ Ya procesado'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Usá → Siguiente para volver a un item pendiente.
        </p>
      </div>
    );
  }

  const canSubmit = draft.suggestedTitle.trim().length > 0;
  const submitLabel = isLast ? '✓ Crear' : '✓ Crear y siguiente';

  const handleSubmit = () => {
    const parsedTags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    void onCreate({ ...draft, suggestedTags: parsedTags });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        handleSubmit();
      }}
      className="rounded-lg border border-border bg-card p-5"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Título
          </span>
          <input
            type="text"
            value={draft.suggestedTitle}
            onChange={(e) => setDraft({ ...draft, suggestedTitle: e.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            autoFocus
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Tipo
            </span>
            <select
              value={draft.suggestedType}
              onChange={(e) =>
                setDraft({ ...draft, suggestedType: e.target.value as InboxResultType })
              }
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="note">📝 Nota</option>
              <option value="task">✅ Tarea</option>
              <option value="project">🚀 Proyecto</option>
              <option value="trash">🗑️ Descartar</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Área
            </span>
            <select
              value={draft.suggestedArea}
              onChange={(e) => setDraft({ ...draft, suggestedArea: e.target.value as AreaKey })}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {(Object.keys(AREAS) as AreaKey[]).map((key) => (
                <option key={key} value={key}>
                  {AREAS[key].emoji} {AREAS[key].label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {draft.suggestedType === 'task' && (
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Prioridad
            </span>
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tags (separados por coma)
          </span>
          <input
            type="text"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="tag1, tag2, tag3"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Descartar
        </button>
      </div>
    </form>
  );
}
