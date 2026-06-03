import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { AllowlistMember } from '@/types/allowlistMember';

interface AllowlistMemberRowProps {
  member: AllowlistMember;
  busy: boolean;
  onRevoke: (email: string) => void;
}

export default function AllowlistMemberRow({ member, busy, onRevoke }: AllowlistMemberRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const date = member.addedAt
    ? new Date(member.addedAt).toLocaleString('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{member.email}</p>
        <p className="mt-1 text-xs text-muted-foreground">Agregado: {date}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirmOpen(true)}>
          Revocar
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Revocar el acceso?"
        description={`${member.email} dejará de tener acceso a la beta en su próximo gate (no borra su cuenta ni sus datos). Podés volver a invitarlo aprobando una nueva solicitud.`}
        confirmLabel="Revocar"
        variant="destructive"
        onConfirm={() => onRevoke(member.email)}
      />
    </li>
  );
}
