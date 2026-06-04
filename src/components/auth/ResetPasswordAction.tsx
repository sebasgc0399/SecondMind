import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { KeyRound, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ActionStatus from '@/components/auth/ActionStatus';
import { verifyResetCode, confirmReset } from '@/lib/authActions';
import { mapActionError } from '@/lib/authErrors';

interface ResetPasswordActionProps {
  oobCode: string;
}

type State = 'verifying-code' | 'form' | 'submitting' | 'success' | 'error';

// SPEC-54 F5: máquina de reset. Mount → verifyPasswordResetCode (valida + obtiene el email)
// → form (nueva contraseña + confirmación) → confirmPasswordReset. Error en cualquier paso
// (verify o confirm) cae a la pantalla de error con CTA → /login.
export default function ResetPasswordAction({ oobCode }: ResetPasswordActionProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<State>('verifying-code');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [confirmErr, setConfirmErr] = useState('');
  const startedRef = useRef(false);

  useEffect(() => {
    // verifyPasswordResetCode es idempotente (no consume el code), pero el ref evita la
    // 2ª request del doble-mount de StrictMode (G1).
    if (startedRef.current) return;
    startedRef.current = true;
    verifyResetCode(oobCode)
      .then((resolvedEmail) => {
        setEmail(resolvedEmail);
        setState('form');
      })
      .catch((err: unknown) => {
        setErrorMsg(mapActionError((err as { code?: string } | null)?.code));
        setState('error');
      });
  }, [oobCode]);

  // Validación IDÉNTICA a SignUpForm (≥8 + match). NO se agrega la regla "un número" que
  // el copy de signup menciona pero el cliente no enforce.
  function validate(): boolean {
    let ok = true;
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
    if (!validate()) return;
    setState('submitting');
    try {
      await confirmReset(oobCode, password);
      setState('success');
    } catch (err) {
      // El oobCode pudo expirar entre el verify (mount) y este confirm; mapeamos también acá.
      setErrorMsg(mapActionError((err as { code?: string } | null)?.code));
      setState('error');
    }
  }

  const goToLogin = (
    <Button
      type="button"
      variant="default"
      size="lg"
      onClick={() => navigate('/login')}
      className="mt-2 w-full"
    >
      Iniciar sesión
    </Button>
  );

  if (state === 'verifying-code') {
    return (
      <ActionStatus
        variant="loading"
        icon={KeyRound}
        title="Validando el enlace…"
        description="Un segundo, estamos verificando tu enlace de recuperación."
      />
    );
  }

  if (state === 'success') {
    return (
      <ActionStatus
        variant="success"
        icon={CheckCircle2}
        title="Contraseña actualizada"
        description="Ya podés iniciar sesión con tu nueva contraseña."
      >
        {goToLogin}
      </ActionStatus>
    );
  }

  if (state === 'error') {
    return (
      <ActionStatus
        variant="error"
        icon={AlertTriangle}
        title="No pudimos restablecer tu contraseña"
        description={errorMsg}
      >
        {goToLogin}
      </ActionStatus>
    );
  }

  // state === 'form' | 'submitting'
  const submitting = state === 'submitting';
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-amber-500/15 p-3">
          <KeyRound className="size-6 text-amber-600 dark:text-amber-400" aria-hidden />
        </div>
        <h2 className="text-xl font-semibold">Elegí una nueva contraseña</h2>
        <p className="text-sm text-muted-foreground">
          Para la cuenta <span className="font-medium text-foreground">{email}</span>.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reset-password" className="text-sm font-medium">
            Nueva contraseña
          </label>
          <input
            id="reset-password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={passwordErr ? 'true' : undefined}
            aria-describedby={passwordErr ? 'reset-password-error' : undefined}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-destructive"
          />
          {passwordErr ? (
            <p id="reset-password-error" className="text-xs text-destructive">
              {passwordErr}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="reset-confirm" className="text-sm font-medium">
            Confirmar contraseña
          </label>
          <input
            id="reset-confirm"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={confirmErr ? 'true' : undefined}
            aria-describedby={confirmErr ? 'reset-confirm-error' : undefined}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-destructive"
          />
          {confirmErr && (
            <p id="reset-confirm-error" className="text-xs text-destructive">
              {confirmErr}
            </p>
          )}
        </div>
        <Button type="submit" variant="default" size="lg" disabled={submitting} className="w-full">
          {submitting ? 'Guardando…' : 'Cambiar contraseña'}
        </Button>
      </form>
    </div>
  );
}
