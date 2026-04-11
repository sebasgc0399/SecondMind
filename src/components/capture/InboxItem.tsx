import { FileText, Trash2 } from 'lucide-react';
import type { InboxItem } from '@/types/inbox';
import { formatRelative } from '@/lib/formatDate';

interface InboxItemCardProps {
  item: InboxItem;
  onConvert: () => void;
  onDismiss: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  'quick-capture': 'Captura rápida',
  'web-clip': 'Web clip',
  voice: 'Voz',
  'share-intent': 'Compartido',
  email: 'Email',
};

export default function InboxItemCard({ item, onConvert, onDismiss }: InboxItemCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm whitespace-pre-wrap text-foreground">{item.rawContent}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
          {SOURCE_LABELS[item.source] ?? item.source}
        </span>
        <span>{formatRelative(item.createdAt)}</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onConvert}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <FileText className="h-3 w-3" />
            Nota
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
          >
            <Trash2 className="h-3 w-3" />
            Descartar
          </button>
        </div>
      </div>
    </div>
  );
}
