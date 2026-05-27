import { useEffect } from 'react';
import type { ReactNode } from 'react';
import useSignupCapacity from '@/hooks/useSignupCapacity';

interface SignupCapacityGateProps {
  children: ReactNode;
}

export default function SignupCapacityGate({ children }: SignupCapacityGateProps) {
  const { state, fetchCapacity } = useSignupCapacity();

  useEffect(() => {
    if (state.status === 'idle') {
      void fetchCapacity();
    }
  }, [state.status, fetchCapacity]);

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
        <p className="text-destructive">{state.message}</p>
        <button
          type="button"
          onClick={() => void fetchCapacity()}
          className="self-start text-primary hover:underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { capacity } = state;

  if (!capacity.signupsEnabled) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">Registro deshabilitado temporalmente</p>
        <p className="text-muted-foreground">
          Volvé más adelante o iniciá sesión con Google si ya tenés cuenta.
        </p>
      </div>
    );
  }

  if (!capacity.canSignUp) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium">
          Beta llena · {capacity.userCount}/{capacity.maxUsers} cuentas
        </p>
        <p className="text-muted-foreground">
          Estamos cerrando esta primera ronda. Volvé pronto o iniciá sesión con Google si ya tenés
          cuenta.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
