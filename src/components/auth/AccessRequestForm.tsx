import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { submitAccessRequest } from '@/lib/accessRequests';
import type { TFunction } from 'i18next';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MOTIVO = 280;

type Status = 'idle' | 'submitting' | 'success';

// Mapea el code del FunctionsError (functions/<code>) a copy. Hardcodeado acá (NO
// authErrors.ts) → F2.6. resource-exhausted = rate-limit por IP; invalid-argument
// = validación server-side. Ningún mensaje confirma membresía (no-oráculo).
function mapSubmitError(code: string | undefined, t: TFunction): string {
  switch (code) {
    case 'functions/resource-exhausted':
      return t(
        'auth.accessRequest.errorRateLimit',
        'Demasiados intentos. Probá de nuevo más tarde.',
      );
    case 'functions/invalid-argument':
      return t('auth.accessRequest.errorEmail', 'Revisá el email ingresado.');
    default:
      return t(
        'auth.accessRequest.errorGeneric',
        'No se pudo enviar la solicitud. Probá de nuevo.',
      );
  }
}

export default function AccessRequestForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [motivo, setMotivo] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError(t('auth.accessRequest.invalidEmail', 'Ingresá un email válido.'));
      return;
    }
    setStatus('submitting');
    try {
      // Respuesta uniforme server-side: nunca distingue nuevo / duplicado / ya-allowlisted.
      await submitAccessRequest(trimmed, motivo.trim() || undefined);
      setStatus('success');
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setError(mapSubmitError(code, t));
      setStatus('idle');
    }
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Check className="h-6 w-6" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            'auth.accessRequest.success',
            'Recibimos tu solicitud. Cuando se habilite tu acceso vas a poder iniciar sesión normalmente.',
          )}
        </p>
        <Link to="/login" className="text-sm font-medium text-primary hover:underline">
          {t('auth.backToSignIn', 'Volver al inicio de sesión')}
        </Link>
      </div>
    );
  }

  const submitting = status === 'submitting';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="access-email" className="text-sm font-medium">
          {t('auth.email', 'Email')}
        </label>
        <input
          id="access-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="access-motivo" className="text-sm font-medium">
            {t('auth.accessRequest.motivo', 'Motivo')}{' '}
            <span className="font-normal text-muted-foreground">
              {t('auth.accessRequest.optional', '(opcional)')}
            </span>
          </label>
          <span className="text-xs text-muted-foreground">
            {motivo.length}/{MAX_MOTIVO}
          </span>
        </div>
        <textarea
          id="access-motivo"
          rows={3}
          maxLength={MAX_MOTIVO}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={t(
            'auth.accessRequest.placeholder',
            'Contanos para qué querés usar SecondMind',
          )}
          className="resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <Button type="submit" variant="default" size="lg" disabled={submitting} className="w-full">
        {submitting
          ? t('common.sending', 'Enviando…')
          : t('auth.accessRequest.submit', 'Solicitar acceso')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Link
        to="/login"
        className="text-center text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        {t('auth.backToSignIn', 'Volver al inicio de sesión')}
      </Link>
    </form>
  );
}
