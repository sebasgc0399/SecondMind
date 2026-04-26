import { Check, Sparkles } from 'lucide-react';
import { useNoteSuggestions } from '@/hooks/useNoteSuggestions';

interface EditorSuggestionBannerProps {
  noteId: string;
}

// Banner persistente de sugerencias contextuales en el editor. A diferencia
// de DistillLevelBanner (efímero, auto-dismiss 3s, role=status aria-live)
// este es información persistente — usa role=region sin aria-live para
// evitar doble anuncio si una sugerencia reaparece tras race onSnapshot.
//
// Stateless: el optimistic dismiss vive en useNoteSuggestions, no acá.
export default function EditorSuggestionBanner({ noteId }: EditorSuggestionBannerProps) {
  const { suggestions, accept, dismiss } = useNoteSuggestions(noteId);

  if (suggestions.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Sugerencias de la AI"
      className="mx-auto w-full max-w-180 px-4 pt-3"
    >
      <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3 w-3" />
          Sugerencia AI
        </div>

        {suggestions.map((suggestion, idx) => (
          <div
            key={suggestion.id}
            className={idx > 0 ? 'mt-3 border-t border-primary/15 pt-3' : ''}
          >
            <p className="text-sm font-medium text-foreground">{suggestion.label}</p>
            <p className="mt-1 text-xs text-muted-foreground">{suggestion.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => accept(suggestion)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Check className="h-3 w-3" />
                Aceptar
              </button>
              <button
                type="button"
                onClick={() => dismiss(suggestion)}
                className="inline-flex items-center rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              >
                Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
