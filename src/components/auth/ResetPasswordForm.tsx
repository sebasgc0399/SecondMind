import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/useAuth';
import { mapAuthError } from '@/lib/authErrors';

interface ResetPasswordFormProps {
  onBack: () => void;
}

export default function ResetPasswordForm({ onBack }: ResetPasswordFormProps) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email);
      // user-not-found ya fue silenciado dentro del hook (anti-enumeration).
      // El sent: true se muestra siempre que el call resuelve sin throw.
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setError(mapAuthError(code, 'reset'));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base font-medium">Revisá tu correo</h3>
          <p className="text-sm text-muted-foreground">
            Si la cuenta existe, recibirás un enlace en tu email para restablecer tu contraseña.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 self-start text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          Volver al login
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-medium">Recuperar contraseña</h3>
        <p className="text-sm text-muted-foreground">
          Te enviaremos un enlace para restablecer tu contraseña.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reset-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="reset-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" variant="default" size="lg" disabled={loading} className="w-full">
        {loading ? 'Enviando…' : 'Enviar enlace'}
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 self-start text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" />
        Volver al login
      </button>
    </form>
  );
}
