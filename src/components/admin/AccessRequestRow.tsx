import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
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
  const { t } = useTranslation();
  const date = request.createdAt
    ? new Date(request.createdAt).toLocaleString(i18n.language || 'es', {
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
          {t('admin.requests.approve', 'Aprobar')}
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onReject(request.id)}>
          {t('admin.requests.reject', 'Rechazar')}
        </Button>
      </div>
    </li>
  );
}
