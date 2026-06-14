import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import useAuth from '@/hooks/useAuth';
import { mapAuthError } from '@/lib/authErrors';

interface SignInFormProps {
  onError: (message: string) => void;
  onForgotPassword: () => void;
}

export default function SignInForm({ onError, onForgotPassword }: SignInFormProps) {
  const { t } = useTranslation();
  const { signInWithEmail } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      onError(mapAuthError(code, 'signin'));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signin-email" className="text-sm font-medium">
          {t('auth.email', 'Email')}
        </label>
        <input
          id="signin-email"
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
          <label htmlFor="signin-password" className="text-sm font-medium">
            {t('auth.password', 'Contraseña')}
          </label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-xs text-primary hover:underline"
          >
            {t('auth.forgotPassword', '¿Olvidaste tu contraseña?')}
          </button>
        </div>
        <input
          id="signin-password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40"
        />
      </div>
      <Button type="submit" variant="default" size="lg" disabled={loading} className="w-full">
        {loading ? t('auth.signingIn', 'Iniciando sesión…') : t('auth.signIn', 'Iniciar sesión')}
      </Button>
    </form>
  );
}
