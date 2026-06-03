import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { UseAccessRequestsQueueReturn } from '@/hooks/useAccessRequestsQueue';
import { processAccessRequest } from '@/lib/accessRequests';
import AccessRequestRow from './AccessRequestRow';

interface AccessRequestQueueProps {
  data: UseAccessRequestsQueueReturn;
}

// SPEC-53 F8 — el approve ahora enforce capacity sobre la allowlist: si está llena, la CF
// lanza resource-exhausted con { maxUsers, current } en details. Mapeamos ese caso a un
// mensaje accionable; el resto sigue genérico.
function mapProcessError(err: unknown): string {
  const e = err as { code?: string; details?: { maxUsers?: number } } | null;
  if (e?.code === 'functions/resource-exhausted') {
    const max = e.details?.maxUsers;
    return max != null
      ? `Beta llena (${max}). Subí el límite o revocá un miembro antes de aprobar.`
      : 'Beta llena. Subí el límite o revocá un miembro antes de aprobar.';
  }
  return 'No se pudo procesar la solicitud. Probá de nuevo.';
}

export default function AccessRequestQueue({ data }: AccessRequestQueueProps) {
  const { requests, isLoading, error, refetch } = data;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [query, setQuery] = useState('');

  async function handleProcess(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setActionError('');
    try {
      await processAccessRequest(id, action);
      await refetch();
    } catch (err) {
      setActionError(mapProcessError(err));
    } finally {
      setBusyId(null);
    }
  }

  // Loading: skeleton, nunca spinner (mantiene el layout, sin layout shift).
  if (isLoading) {
    return (
      <ul className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  // Empty real (sin solicitudes): sin buscador, nada que filtrar.
  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
      </div>
    );
  }

  // SPEC-53 F12 — filtro client-side por email (la CF ya trajo todo).
  const q = query.trim().toLowerCase();
  const filtered = q ? requests.filter((r) => r.email.toLowerCase().includes(q)) : requests;

  return (
    <div className="flex flex-col gap-3">
      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por email…"
        aria-label="Buscar solicitudes por email"
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40"
      />
      {/* Empty con filtro activo: mantener el buscador + mensaje diferenciado (no el empty real). */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Ninguna solicitud coincide con la búsqueda.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((request) => (
            <AccessRequestRow
              key={request.id}
              request={request}
              busy={busyId === request.id}
              onApprove={(id) => void handleProcess(id, 'approve')}
              onReject={(id) => void handleProcess(id, 'reject')}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
