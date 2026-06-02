import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { submitAccessRequest } from '@/lib/accessRequests';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MOTIVO = 280;

type Status = 'idle' | 'submitting' | 'success';

// Mapea el code del FunctionsError (functions/<code>) a copy. resource-exhausted es el
// rate-limit por IP; invalid-argument el de validación server-side (el cliente ya valida
// el formato, así que es raro). Ningún mensaje confirma membresía (no-oráculo).
function mapSubmitError(code: string | undefined): string {
  switch (code) {
    case 'functions/resource-exhausted':
      return 'Demasiados intentos. Probá de nuevo más tarde.';
    case 'functions/invalid-argument':
      return 'Revisá el email ingresado.';
    default:
      return 'No se pudo enviar la solicitud. Probá de nuevo.';
  }
}

export default function AccessRequestForm() {
  const [email, setEmail] = useState('');
  const [motivo, setMotivo] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Ingresá un email válido.');
      return;
    }
    setStatus('submitting');
    try {
      // Respuesta uniforme server-side: nunca distingue nuevo / duplicado / ya-allowlisted.
      await submitAccessRequest(trimmed, motivo.trim() || undefined);
      setStatus('success');
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setError(mapSubmitError(code));
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
          Recibimos tu solicitud. Cuando se habilite tu acceso vas a poder iniciar sesión
          normalmente.
        </p>
        <Link to="/login" className="text-sm font-medium text-primary hover:underline">
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  const submitting = status === 'submitting';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="access-email" className="text-sm font-medium">
          Email
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
            Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
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
          placeholder="Contanos para qué querés usar SecondMind"
          className="resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <Button type="submit" variant="default" size="lg" disabled={submitting} className="w-full">
        {submitting ? 'Enviando…' : 'Solicitar acceso'}
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
        Volver al inicio de sesión
      </Link>
    </form>
  );
}
