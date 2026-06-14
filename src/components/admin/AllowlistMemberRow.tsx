import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { AllowlistMember } from '@/types/allowlistMember';

interface AllowlistMemberRowProps {
  member: AllowlistMember;
  busy: boolean;
  onRevoke: (email: string) => void;
}

export default function AllowlistMemberRow({ member, busy, onRevoke }: AllowlistMemberRowProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const date = member.addedAt
    ? new Date(member.addedAt).toLocaleString(i18n.language || 'es', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{member.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('admin.members.added', 'Agregado: {{date}}', { date })}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmOpen(true)}>
          {t('admin.members.revoke', 'Revocar')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('admin.members.revokeDialog.title', '¿Revocar el acceso?')}
        description={t('admin.members.revokeDialog.description', {
          email: member.email,
        })}
        confirmLabel={t('admin.members.revoke', 'Revocar')}
        variant="destructive"
        onConfirm={() => onRevoke(member.email)}
      />
    </li>
  );
}
