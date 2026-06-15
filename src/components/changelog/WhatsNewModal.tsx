import { Dialog } from '@base-ui/react/dialog';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useWhatsNew from '@/hooks/useWhatsNew';

/**
 * Modal "Novedades" one-time por versión (F59). Calca el patrón one-shot de
 * WelcomeModal (Dialog de base-ui, auto-open post-hidratación). La elegibilidad
 * y la persistencia viven en useWhatsNew; este componente solo pinta.
 */
export default function WhatsNewModal() {
  const { t } = useTranslation();
  const { open, entryKey, dismiss } = useWhatsNew();

  if (!entryKey) return null;

  // D6: items como array; el cast resuelve la fricción de tipos de i18next-cli
  // (resources.d.ts tipa el array como tupla de literales). Ver F5.
  const items = t(`changelog.${entryKey}.items`, { returnObjects: true }) as string[];

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background-deep/80 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl border border-border-strong bg-card p-6 shadow-modal outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" aria-hidden />
            </span>
            <Dialog.Title className="text-xl font-semibold text-foreground">
              {t(`changelog.${entryKey}.title`)}
            </Dialog.Title>
          </div>

          <ul className="mt-6 flex flex-col gap-3">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <button
            type="button"
            autoFocus
            onClick={dismiss}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('changelog.dismiss')}
          </button>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
