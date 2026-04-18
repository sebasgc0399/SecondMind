import { useEffect, useRef, useState } from 'react';
import { Check, Unlink, X } from 'lucide-react';

interface LinkInputProps {
  initialUrl?: string;
  onConfirm: (url: string) => void;
  onCancel: () => void;
  onUnlink?: () => void;
}

export default function LinkInput({
  initialUrl = '',
  onConfirm,
  onCancel,
  onUnlink,
}: LinkInputProps) {
  const [url, setUrl] = useState(initialUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onConfirm(normalizeUrl(url));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
      <input
        ref={inputRef}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="https://..."
        className="h-11 min-w-56 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        onClick={() => onConfirm(normalizeUrl(url))}
        aria-label="Confirmar link"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent/60"
      >
        <Check className="h-4 w-4" />
      </button>
      {onUnlink && (
        <button
          type="button"
          onClick={onUnlink}
          aria-label="Desvincular"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent/60"
        >
          <Unlink className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar"
        className="inline-flex h-11 w-11 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent/60"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
