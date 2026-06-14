import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Brain, Inbox, Sparkles, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useOnboarding from '@/hooks/useOnboarding';

/**
 * Modal de bienvenida de 1 paso (F49). Se auto-abre una sola vez a cuentas
 * nuevas/vacías (gate triple via `shouldShowWelcome`) y, al cerrarse, persiste
 * `onboardingWelcomeSeen` — lo que revela el checklist en el dashboard (D2).
 *
 * Patrón one-shot de DistillIndicator: `autoOpenedRef` evita re-disparar el
 * setOpen en re-renders posteriores; el flag persistido evita reaparecer en
 * futuros mounts. El componente orquesta su propio `open`; el hook solo expone
 * la elegibilidad y la acción de persistencia.
 */
export default function WelcomeModal() {
  const { t } = useTranslation();
  const { shouldShowWelcome, markWelcomeSeen } = useOnboarding();
  const [open, setOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  const pillars = useMemo(
    () => [
      {
        icon: Inbox,
        title: t('onboarding.welcome.pillars.capture.title', 'Capturá sin fricción'),
        description: t(
          'onboarding.welcome.pillars.capture.description',
          'Tirá ideas al inbox y procesalas después, sin perder el hilo.',
        ),
      },
      {
        icon: Workflow,
        title: t('onboarding.welcome.pillars.connect.title', 'Conectá tu conocimiento'),
        description: t(
          'onboarding.welcome.pillars.connect.description',
          'Notas atómicas enlazadas que forman tu segundo cerebro.',
        ),
      },
      {
        icon: Sparkles,
        title: t('onboarding.welcome.pillars.ai.title', 'La IA organiza por vos'),
        description: t(
          'onboarding.welcome.pillars.ai.description',
          'Clasifica, etiqueta y resume tus capturas automáticamente.',
        ),
      },
    ],
    [t],
  );

  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!shouldShowWelcome) return;
    autoOpenedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- auto-open one-shot tras hidratación async (gate triple encapsulado en shouldShowWelcome); el ref guard previene re-disparo en re-renders. Patrón canónico de DistillIndicator
    setOpen(true);
  }, [shouldShowWelcome]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      // Al cerrar (botón "Empezar", Esc o backdrop) persiste el flag → no
      // reaparece y revela el checklist.
      if (!next) void markWelcomeSeen();
    },
    [markWelcomeSeen],
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-background-deep/80 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl border border-border-strong bg-card p-6 shadow-modal outline-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
          <div className="flex flex-col items-center text-center">
            <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Brain className="h-6 w-6" aria-hidden />
            </span>
            <Dialog.Title className="text-xl font-semibold text-foreground">
              {t('onboarding.welcome.title', 'Te damos la bienvenida a SecondMind')}
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t(
                'onboarding.welcome.description',
                'Tu segundo cerebro para capturar ideas, conectar tu conocimiento y dejar que la IA te ayude a organizarlo.',
              )}
            </Dialog.Description>
          </div>

          <ul className="mt-6 flex flex-col gap-4">
            {pillars.map((pillar) => (
              <li key={pillar.title} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <pillar.icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{pillar.title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {pillar.description}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            autoFocus
            onClick={() => handleOpenChange(false)}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('onboarding.welcome.start', 'Empezar')}
          </button>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
