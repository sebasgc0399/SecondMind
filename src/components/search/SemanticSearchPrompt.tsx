import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useSemanticSearchToggle from '@/hooks/useSemanticSearchToggle';
import SemanticConsentModal from '@/components/search/SemanticConsentModal';

interface SemanticSearchPromptProps {
  // Solo se ofrece activar cuando hay una búsqueda en curso (momento relevante, D5).
  hasQuery: boolean;
}

/**
 * SPEC-66 F4 — Banner contextual "Activar búsqueda semántica" + el modal de
 * reconocimiento. Aparece en la lista de resultados cuando hay query y la
 * semántica está INERTE (el invariante: nada salió a OpenAI todavía).
 *
 * Flujo (D5/D6): click → si el usuario ya reconoció antes (acknowledged) activa
 * directo (D6, sin modal); si nunca reconoció, abre el modal. Aceptar el modal
 * persiste el reconocimiento y dispara el backfill. Todo el peso del cambio vive
 * en useSemanticSearchToggle; este componente solo decide modal-vs-directo.
 */
export default function SemanticSearchPrompt({ hasQuery }: SemanticSearchPromptProps) {
  const { t } = useTranslation();
  const { isLoaded, enabled, acknowledged, busy, enable } = useSemanticSearchToggle();
  const [modalOpen, setModalOpen] = useState(false);

  // Esperar isLoaded para no parpadear el banner contra defaults; ocultar si ya
  // está activa o no hay búsqueda en curso.
  if (!hasQuery || !isLoaded || enabled) return null;

  function handleActivate() {
    if (acknowledged) {
      void enable(); // D6: ya reconoció → activar directo
    } else {
      setModalOpen(true); // primer cruce → modal de reconocimiento
    }
  }

  function handleAccept() {
    setModalOpen(false);
    void enable(); // markAcknowledged + backfill (vía el hook)
  }

  return (
    <section className="mt-8 rounded-lg border border-dashed border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t('search.semanticPrompt.title', 'Buscá también por significado')}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {t(
              'search.semanticPrompt.description',
              'Activá la búsqueda semántica para encontrar notas relacionadas aunque no compartan las mismas palabras.',
            )}
          </p>
          <button
            type="button"
            onClick={handleActivate}
            disabled={busy}
            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {busy
              ? t('search.semanticPrompt.activating', 'Activando…')
              : t('search.semanticPrompt.activate', 'Activar búsqueda semántica')}
          </button>
        </div>
      </div>

      <SemanticConsentModal open={modalOpen} onOpenChange={setModalOpen} onAccept={handleAccept} />
    </section>
  );
}
