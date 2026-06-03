import { useEffect } from 'react';
import type { ReactNode } from 'react';
import useSignupsEnabled from '@/hooks/useSignupsEnabled';

interface SignupGateProps {
  children: ReactNode;
}

// SPEC-53 Modelo C — el registro ya NO muestra capacity (el límite se enforce en la
// aprobación, no acá). Solo queda el kill-switch `signupsEnabled` (cliente-only: oculta el
// form; un createUserWithEmailAndPassword directo crearía una huérfana inerte igual — las
// rules + checkMyAccess son el backstop real). Reemplaza al viejo SignupCapacityGate.
export default function SignupGate({ children }: SignupGateProps) {
  const { state, fetchState } = useSignupsEnabled();

  useEffect(() => {
    if (state.status === 'idle') {
      void fetchState();
    }
  }, [state.status, fetchState]);

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div className="flex flex-col gap-3 py-2">
        <p className="text-sm text-muted-foreground">Verificando disponibilidad…</p>
        <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="text-destructive">No se pudo verificar disponibilidad. Reintentá.</p>
        <button
          type="button"
          onClick={() => void fetchState()}
          className="self-start text-primary hover:underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!state.signupsEnabled) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Registro deshabilitado temporalmente</p>
        <p className="text-muted-foreground">
          Volvé más adelante o iniciá sesión con Google si ya tenés cuenta.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
