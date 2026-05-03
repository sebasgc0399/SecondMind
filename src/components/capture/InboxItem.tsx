import { CloudOff, FileText, Loader2, Trash2 } from 'lucide-react';
import AiSuggestionCard from '@/components/capture/AiSuggestionCard';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import type { InboxAiResult, InboxItem } from '@/types/inbox';
import { formatRelative } from '@/lib/formatDate';

interface InboxItemCardProps {
  item: InboxItem;
  onConvert: () => void;
  onDismiss: () => void;
  onAcceptSuggestion: (edited: InboxAiResult) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  'quick-capture': 'Captura rápida',
  'web-clip': 'Web clip',
  voice: 'Voz',
  'share-intent': 'Compartido',
  email: 'Email',
};

export default function InboxItemCard({
  item,
  onConvert,
  onDismiss,
  onAcceptSuggestion,
}: InboxItemCardProps) {
  const isOnline = useOnlineStatus();

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm whitespace-pre-wrap text-foreground">{item.rawContent}</p>

      {!item.aiProcessed &&
        (isOnline ? (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Procesando con AI...</span>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CloudOff className="h-3 w-3" />
            <span>En cola — se procesará al reconectar</span>
          </div>
        ))}

      {item.aiProcessed && item.aiResult && (
        <AiSuggestionCard
          suggestion={item.aiResult}
          onAccept={onAcceptSuggestion}
          onDismiss={onDismiss}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {typeof item.aiResult?.confidence === 'number' && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
              item.aiResult.confidence >= 0.85
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
            }`}
          >
            {Math.round(item.aiResult.confidence * 100)}%
          </span>
        )}
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {SOURCE_LABELS[item.source] ?? item.source}
        </span>
        <span>{formatRelative(item.createdAt)}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onConvert}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <FileText className="h-3 w-3" />
            Nota
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" />
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}
