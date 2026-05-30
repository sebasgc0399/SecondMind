import { Link } from 'react-router';
import { CheckCircle2, Circle, PartyPopper, X } from 'lucide-react';
import useOnboarding, { type OnboardingStep } from '@/hooks/useOnboarding';

/**
 * Card "Primeros pasos" del dashboard (F49). Muestra los 4 hitos del
 * onboarding, autocompletados de forma reactiva por `useOnboarding`. Visible
 * solo si `shouldShowChecklist` (welcomeSeen && !dismissed). Al llegar a 4/4
 * muestra un estado de logro con cierre explícito — NO se auto-oculta: la
 * única ruta de desaparición es que el usuario descarte la guía (Opción A).
 */
export default function OnboardingChecklist() {
  const { steps, completedCount, allComplete, shouldShowChecklist, dismissChecklist } =
    useOnboarding();

  if (!shouldShowChecklist) return null;

  const total = steps.length;
  // El primer hito pendiente se resalta como "próxima acción" (guía la acción).
  const firstPendingId = steps.find((step) => !step.done)?.id;

  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Primeros pasos</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {completedCount} de {total} completados
          </p>
        </div>
        <button
          type="button"
          onClick={() => void dismissChecklist()}
          aria-label="Descartar guía de primeros pasos"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${(completedCount / total) * 100}%` }}
        />
      </div>

      <ul className="mt-4 flex flex-col gap-1">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} emphasized={step.id === firstPendingId} />
        ))}
      </ul>

      {allComplete && (
        <div className="mt-4 flex flex-col items-center gap-3 rounded-lg bg-primary/5 p-4 text-center">
          <PartyPopper className="h-6 w-6 text-primary" aria-hidden />
          <p className="text-sm font-medium text-foreground">
            ¡Listo! Ya conocés lo esencial de SecondMind.
          </p>
          <button
            type="button"
            onClick={() => void dismissChecklist()}
            className="inline-flex min-h-9 items-center justify-center rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Cerrar
          </button>
        </div>
      )}
    </section>
  );
}

function StepRow({ step, emphasized }: { step: OnboardingStep; emphasized: boolean }) {
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2">
      <span className="shrink-0">
        {step.done ? (
          <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
        ) : (
          <Circle className="h-5 w-5 text-muted-foreground/50" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${
            step.done ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {step.label}
        </p>
        {!step.done && (
          <p className="text-xs leading-relaxed text-muted-foreground">{step.description}</p>
        )}
      </div>
      {!step.done && <StepCta step={step} emphasized={emphasized} />}
    </li>
  );
}

function StepCta({ step, emphasized }: { step: OnboardingStep; emphasized: boolean }) {
  const className = `inline-flex min-h-9 shrink-0 items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
    emphasized
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : 'border border-border bg-background text-foreground hover:bg-accent/40'
  }`;

  if (step.ctaTo) {
    return (
      <Link to={step.ctaTo} className={className}>
        {step.ctaLabel}
      </Link>
    );
  }
  return (
    <button type="button" onClick={step.ctaAction} className={className}>
      {step.ctaLabel}
    </button>
  );
}
