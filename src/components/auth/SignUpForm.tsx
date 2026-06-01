import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/useAuth';
import { mapAuthError } from '@/lib/authErrors';
import { normalizeEmail } from '@/lib/normalizeEmail';

interface SignUpFormProps {
  onError: (message: string) => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignUpForm({ onError }: SignUpFormProps) {
  const { signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [confirmErr, setConfirmErr] = useState('');
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    let ok = true;
    if (!EMAIL_PATTERN.test(email)) {
      setEmailErr('Email inválido.');
      ok = false;
    } else {
      setEmailErr('');
    }
    if (password.length < 8) {
      setPasswordErr('Mínimo 8 caracteres.');
      ok = false;
    } else {
      setPasswordErr('');
    }
    if (password !== confirmPassword) {
      setConfirmErr('Las contraseñas no coinciden.');
      ok = false;
    } else {
      setConfirmErr('');
    }
    return ok;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError('');
    if (!validate()) return;
    setLoading(true);
    try {
      // SPEC-51 F3: sin pre-check de allowlist (era el oráculo público). El gate
      // corre POST-auth dentro de signUpWithEmail (checkMyAccess autenticado): si
      // no está autorizado o falla la verificación, signUpWithEmail LANZA y el
      // catch muestra el mensaje (genérico o "reintentá") SIN navegar. Email/pw
      // converge al patrón de Google.
      await signUpWithEmail(normalizeEmail(email), password);
      navigate('/', { replace: true });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      onError(mapAuthError(code, 'signup'));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={emailErr ? 'true' : undefined}
          aria-describedby={emailErr ? 'signup-email-error' : undefined}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-destructive"
        />
        {emailErr && (
          <p id="signup-email-error" className="text-xs text-destructive">
            {emailErr}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-password" className="text-sm font-medium">
          Contraseña
        </label>
        <input
          id="signup-password"
          type="password"
          required
          autoComplete="new-password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={passwordErr ? 'true' : undefined}
          aria-describedby={passwordErr ? 'signup-password-error' : undefined}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-destructive"
        />
        {passwordErr ? (
          <p id="signup-password-error" className="text-xs text-destructive">
            {passwordErr}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Mínimo 8 caracteres con al menos un número.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-confirm" className="text-sm font-medium">
          Confirmar contraseña
        </label>
        <input
          id="signup-confirm"
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={confirmErr ? 'true' : undefined}
          aria-describedby={confirmErr ? 'signup-confirm-error' : undefined}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-destructive"
        />
        {confirmErr && (
          <p id="signup-confirm-error" className="text-xs text-destructive">
            {confirmErr}
          </p>
        )}
      </div>
      <Button type="submit" variant="default" size="lg" disabled={loading} className="w-full">
        {loading ? 'Creando cuenta…' : 'Crear cuenta'}
      </Button>
    </form>
  );
}
