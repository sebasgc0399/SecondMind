import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Mail, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ActionStatus from '@/components/auth/ActionStatus';
import { applyVerifyEmailCode } from '@/lib/authActions';
import { mapActionError } from '@/lib/authErrors';

interface VerifyEmailActionProps {
  oobCode: string;
}

type State = 'verifying' | 'success' | 'error';

// SPEC-54 F4: máquina de verificación de email. En mount aplica el oobCode (single-use) y
// resuelve a success/error. NO intenta auto-login (D3): el click llega casi siempre
// cross-device sin sesión en este browser; el CTA → /login rebota a / si igual hay sesión.
export default function VerifyEmailAction({ oobCode }: VerifyEmailActionProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<State>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const startedRef = useRef(false);

  useEffect(() => {
    // G1: applyActionCode CONSUME el code; el doble-mount de StrictMode (dev) dispararía
    // una 2ª llamada con invalid-action-code espurio. El ref garantiza una sola corrida.
    if (startedRef.current) return;
    startedRef.current = true;
    applyVerifyEmailCode(oobCode)
      .then(() => setState('success'))
      .catch((err: unknown) => {
        setErrorMsg(mapActionError((err as { code?: string } | null)?.code));
        setState('error');
      });
  }, [oobCode]);

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

  if (state === 'verifying') {
    return (
      <ActionStatus
        variant="loading"
        icon={Mail}
        title="Verificando tu email…"
        description="Un segundo, estamos activando tu cuenta."
      />
    );
  }

  if (state === 'success') {
    return (
      <ActionStatus
        variant="success"
        icon={CheckCircle2}
        title="Email verificado"
        description="Tu cuenta está activa. Ya podés iniciar sesión."
      >
        {goToLogin}
      </ActionStatus>
    );
  }

  return (
    <ActionStatus
      variant="error"
      icon={AlertTriangle}
      title="No pudimos verificar tu email"
      description={errorMsg}
    >
      {goToLogin}
    </ActionStatus>
  );
}
