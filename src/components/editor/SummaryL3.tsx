import { useLayoutEffect } from 'react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

interface SummaryL3Props {
  value: string;
  onChange: (next: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  isOpen: boolean;
  onToggle: () => void;
}

export default function SummaryL3({
  value,
  onChange,
  textareaRef,
  isOpen,
  onToggle,
}: SummaryL3Props) {
  // Auto-resize: setear height a '0px' antes de leer scrollHeight es el
  // workaround confiable para iOS Safari (no 'auto').
  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [isOpen, value, textareaRef]);

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = event.target;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
    onChange(el.value);
  }

  return (
    <div className="mx-auto w-full max-w-180 px-4 pt-3">
      <div className="rounded-r-md border-l-2 border-green-500 bg-green-500/5 dark:border-green-400">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-foreground outline-none transition-colors hover:bg-green-500/10"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
          )}
          <Sparkles className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
          <span className="uppercase tracking-wide">Resumen ejecutivo (L3)</span>
          {!isOpen && value.trim().length > 0 && (
            <span className="ml-auto truncate text-[10px] font-normal text-muted-foreground">
              {value.trim().slice(0, 60)}
            </span>
          )}
        </button>
        {isOpen && (
          <div className="px-3 pb-3">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              placeholder="Resumen ejecutivo — ¿cuál es la idea central?"
              rows={2}
              className="w-full resize-none border-none bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
      </div>
    </div>
  );
}
