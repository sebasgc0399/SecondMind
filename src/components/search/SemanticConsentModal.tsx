import { Dialog } from '@base-ui/react/dialog';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SemanticConsentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
}

/**
 * SPEC-66 F4 — Modal de reconocimiento afirmativo de la búsqueda semántica.
 *
 * A diferencia de WelcomeModal, NO se auto-abre: es 100% user-triggered (lo abre
 * el banner de búsqueda o el toggle de settings cuando el usuario nunca reconoció).
 * Al aceptar, el padre persiste enabled + acknowledgedAt y dispara el backfill;
 * cancelar/Esc/backdrop deja todo INERTE (no escribe nada) — el invariante de §7.1.
 *
 * COPY PLACEHOLDER: el texto del aviso (qué datos salen, a quién, retención) DEBE
 * alinearse con el texto final de §7.1 del ToS, que sigue en revisión legal. NO
 * fijar este copy hasta que el ToS cierre. Las defaults de i18n abajo son
 * provisionales y están marcadas como tales.
 */
export default function SemanticConsentModal({
  open,
  onOpenChange,
  onAccept,
}: SemanticConsentModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background-deep/80 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl border border-border-strong bg-card p-6 shadow-modal outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" aria-hidden />
            </span>
            <Dialog.Title className="text-xl font-semibold text-foreground">
              {/* PLACEHOLDER — atar a §7.1 del ToS */}
              {t('search.semanticConsent.title', 'Activar búsqueda semántica')}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {/* PLACEHOLDER — atar a §7.1 del ToS */}
              {t(
                'search.semanticConsent.description',
                '[Texto provisional — pendiente §7.1 del ToS] Para buscar por significado, el texto de tus notas y de tus búsquedas se envía a OpenAI (EE. UU.) para generar los vectores de búsqueda. Podés desactivarla cuando quieras desde Ajustes.',
              )}
            </Dialog.Description>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/40"
            >
              {t('common.cancel', 'Cancelar')}
            </button>
            <button
              type="button"
              autoFocus
              onClick={onAccept}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {/* PLACEHOLDER — atar a §7.1 del ToS */}
              {t('search.semanticConsent.accept', 'Entiendo y activar')}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
