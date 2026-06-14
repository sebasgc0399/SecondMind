import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AREAS, type AreaKey } from '@/types/area';
import { usePriorityLabels, useInboxResultTypeLabels } from '@/lib/entityLabels';
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
  const { t } = useTranslation();
  const typeLabels = useInboxResultTypeLabels();
  const priorityLabels = usePriorityLabels();
  const [draft, setDraft] = useState<InboxAiResult>(() => buildInitialDraft(item));
  const [tagsRaw, setTagsRaw] = useState(() => buildInitialDraft(item).suggestedTags.join(', '));

  if (isProcessed) {
    const processedLabels: Record<ProcessedKind, string> = {
      note: t('inbox.processed.note', 'Ya procesado como nota'),
      task: t('inbox.processed.task', 'Ya procesado como tarea'),
      project: t('inbox.processed.project', 'Ya procesado como proyecto'),
      trash: t('inbox.processed.trash', 'Descartado'),
    };
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-6 text-center">
        <p className="flex items-center justify-center gap-1.5 text-lg font-medium text-foreground">
          <Check className="h-5 w-5" aria-hidden />
          {processedAs
            ? processedLabels[processedAs]
            : t('inbox.processed.generic', 'Ya procesado')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('inbox.processed.hint', 'Usá → Siguiente para volver a un item pendiente.')}
        </p>
      </div>
    );
  }

  const canSubmit = draft.suggestedTitle.trim().length > 0;
  const submitLabel = isLast
    ? t('common.create', 'Crear')
    : t('inbox.form.createAndNext', 'Crear y siguiente');

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
            {t('inbox.form.title', 'Título')}
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
              {t('inbox.form.type', 'Tipo')}
            </span>
            <select
              value={draft.suggestedType}
              onChange={(e) =>
                setDraft({ ...draft, suggestedType: e.target.value as InboxResultType })
              }
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {Object.entries(typeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('inbox.form.area', 'Área')}
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
              {t('inbox.form.priority', 'Prioridad')}
            </span>
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('inbox.form.tags', 'Tags (separados por coma)')}
          </span>
          <input
            type="text"
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder={t('inbox.form.tagsPlaceholder', 'tag1, tag2, tag3')}
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
          {t('inbox.item.dismiss', 'Descartar')}
        </button>
      </div>
    </form>
  );
}
