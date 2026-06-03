import { Button } from '@/components/ui/button';
import type { AccessRequest } from '@/types/accessRequest';

interface AccessRequestRowProps {
  request: AccessRequest;
  busy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export default function AccessRequestRow({
  request,
  busy,
  onApprove,
  onReject,
}: AccessRequestRowProps) {
  const date = request.createdAt
    ? new Date(request.createdAt).toLocaleString('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{request.email}</p>
        {request.motivo && (
          <p className="mt-1 text-sm break-words text-muted-foreground">{request.motivo}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{date}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" disabled={busy} onClick={() => onApprove(request.id)}>
          Aprobar
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onReject(request.id)}>
          Rechazar
        </Button>
      </div>
    </li>
  );
}
