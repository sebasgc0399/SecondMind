import { useState } from 'react';
import { Button } from '@/components/ui/button';
import useAllowlistMembers from '@/hooks/useAllowlistMembers';
import { revokeAccess } from '@/lib/allowlistMembers';
import AllowlistMemberRow from './AllowlistMemberRow';

export default function AllowlistMembers() {
  const { members, isLoading, error, refetch } = useAllowlistMembers();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  async function handleRevoke(email: string) {
    setBusyEmail(email);
    setActionError('');
    try {
      await revokeAccess(email);
      await refetch();
    } catch {
      setActionError('No se pudo revocar el acceso. Probá de nuevo.');
    } finally {
      setBusyEmail(null);
    }
  }

  // Loading: skeleton, nunca spinner (mantiene el layout, sin layout shift).
  if (isLoading) {
    return (
      <ul className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
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

  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">Todavía no hay miembros en la beta.</p>
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
        {members.map((member) => (
          <AllowlistMemberRow
            key={member.email}
            member={member}
            busy={busyEmail === member.email}
            onRevoke={(email) => void handleRevoke(email)}
          />
        ))}
      </ul>
    </div>
  );
}
