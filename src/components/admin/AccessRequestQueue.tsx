import { useState } from 'react';
import { Button } from '@/components/ui/button';
import useAccessRequestsQueue from '@/hooks/useAccessRequestsQueue';
import { processAccessRequest } from '@/lib/accessRequests';
import AccessRequestRow from './AccessRequestRow';

export default function AccessRequestQueue() {
  const { requests, isLoading, error, refetch } = useAccessRequestsQueue();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  async function handleProcess(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setActionError('');
    try {
      await processAccessRequest(id, action);
      await refetch();
    } catch {
      setActionError('No se pudo procesar la solicitud. Probá de nuevo.');
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

  if (requests.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {requests.map((request) => (
          <AccessRequestRow
            key={request.id}
            request={request}
            busy={busyId === request.id}
            onApprove={(id) => void handleProcess(id, 'approve')}
            onReject={(id) => void handleProcess(id, 'reject')}
          />
        ))}
      </ul>
    </div>
  );
}
