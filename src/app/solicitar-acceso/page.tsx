import { useTranslation } from 'react-i18next';
import AccessRequestForm from '@/components/auth/AccessRequestForm';

// SPEC-52 F5 — ruta PÚBLICA (fuera del Layout, como /login). Funnel: el rechazo de
// beta (BETA_NO_ACCESS_MESSAGE) y el footer de LoginCard linkean acá. Mismo shell
// visual que LoginPage (gradiente + logo + card).
export default function AccessRequestPage() {
  const { t } = useTranslation();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[75%]"
        style={{
          background:
            'radial-gradient(ellipse 55% 42% at 50% 8%, color-mix(in oklch, var(--primary) 45%, transparent) 0%, transparent 65%)',
        }}
      />

      <div className="mb-10 flex flex-col items-center gap-3 text-center">
        <img src="/favicon.svg" alt="" aria-hidden className="h-20 w-20 md:h-24 md:w-24" />
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">SecondMind</h1>
        <p className="text-muted-foreground">
          {t('auth.accessRequest.betaTagline', 'Beta cerrada por invitación')}
        </p>
      </div>

      <div className="w-full max-w-md">
        <div className="relative rounded-2xl border border-border-strong bg-popover p-6 shadow-modal backdrop-blur-md md:p-8">
          <h2 className="text-lg font-semibold">
            {t('auth.accessRequest.pageTitle', 'Solicitar acceso')}
          </h2>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            {t(
              'auth.accessRequest.pageSubtitle',
              'Dejanos tu email y, si hay lugar, sumamos tu cuenta a la beta.',
            )}
          </p>
          <AccessRequestForm />
        </div>
      </div>
    </div>
  );
}
