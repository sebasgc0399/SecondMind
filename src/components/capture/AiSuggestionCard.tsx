import { useState } from 'react';
import { Check, Edit2, Sparkles, Trash2, X } from 'lucide-react';
import { AREAS, type AreaKey } from '@/types/area';
import type { Priority } from '@/types/common';
import type { InboxAiResult, InboxResultType } from '@/types/inbox';

interface AiSuggestionCardProps {
  suggestion: InboxAiResult;
  onAccept: (edited: InboxAiResult) => void;
  onDismiss: () => void;
}

const TYPE_LABELS: Record<InboxResultType, string> = {
  note: '📝 Nota',
  task: '✅ Tarea',
  project: '🚀 Proyecto',
  reference: '🔖 Referencia',
  trash: '🗑️ Descartar',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
};

export default function AiSuggestionCard({
  suggestion,
  onAccept,
  onDismiss,
}: AiSuggestionCardProps) {
  const [draft, setDraft] = useState<InboxAiResult | null>(null);
  const [tagsRaw, setTagsRaw] = useState('');

  const isTrash = suggestion.suggestedType === 'trash';
  const isEditing = draft !== null;

  const startEdit = () => {
    setDraft({ ...suggestion });
    setTagsRaw(suggestion.suggestedTags.join(', '));
  };

  const cancelEdit = () => {
    setDraft(null);
    setTagsRaw('');
  };

  const handleAcceptOriginal = () => {
    if (isTrash) {
      onDismiss();
      return;
    }
    onAccept(suggestion);
  };

  const handleAcceptEdited = () => {
    if (!draft) return;
    const parsedTags = tagsRaw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const edited: InboxAiResult = { ...draft, suggestedTags: parsedTags };
    if (edited.suggestedType === 'trash') {
      onDismiss();
      return;
    }
    onAccept(edited);
  };

  if (isEditing && draft) {
    const canSubmit = draft.suggestedTitle.trim().length > 0;
    return (
      <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
          <Edit2 className="h-3 w-3" />
          Editar sugerencia
        </div>

        <div className="space-y-2">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Título
            </span>
            <input
              type="text"
              value={draft.suggestedTitle}
              onChange={(e) => setDraft({ ...draft, suggestedTitle: e.target.value })}
              className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Tipo
              </span>
              <select
                value={draft.suggestedType}
                onChange={(e) =>
                  setDraft({ ...draft, suggestedType: e.target.value as InboxResultType })
                }
                className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="note">📝 Nota</option>
                <option value="task">✅ Tarea</option>
                <option value="project">🚀 Proyecto</option>
                <option value="trash">🗑️ Descartar</option>
              </select>
            </label>

            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Área
              </span>
              <select
                value={draft.suggestedArea}
                onChange={(e) => setDraft({ ...draft, suggestedArea: e.target.value as AreaKey })}
                className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Prioridad
              </span>
              <select
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
                className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Tags (separados por coma)
            </span>
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="tag1, tag2, tag3"
              className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleAcceptEdited}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-3 w-3" />
            Crear
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <X className="h-3 w-3" />
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // Display mode
  const area = AREAS[suggestion.suggestedArea];
  return (
    <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
        <Sparkles className="h-3 w-3" />
        Sugerencia AI
        <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px]">
          {TYPE_LABELS[suggestion.suggestedType]}
        </span>
      </div>

      <p className="text-sm font-medium text-foreground">{suggestion.suggestedTitle}</p>

      {suggestion.summary && (
        <p className="mt-1 text-xs text-muted-foreground">{suggestion.summary}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        {area && (
          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium">
            {area.emoji} {area.label}
          </span>
        )}
        {suggestion.suggestedType === 'task' && (
          <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 font-medium uppercase tracking-wide">
            {PRIORITY_LABELS[suggestion.priority]}
          </span>
        )}
        {suggestion.suggestedTags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground"
          >
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleAcceptOriginal}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {isTrash ? <Trash2 className="h-3 w-3" /> : <Check className="h-3 w-3" />}
          {isTrash ? 'Descartar' : 'Aceptar'}
        </button>
        <button
          type="button"
          onClick={startEdit}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <Edit2 className="h-3 w-3" />
          Editar
        </button>
      </div>
    </div>
  );
}
