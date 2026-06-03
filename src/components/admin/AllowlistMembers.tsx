import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { UseAllowlistMembersReturn } from '@/hooks/useAllowlistMembers';
import { revokeAccess } from '@/lib/allowlistMembers';
import AllowlistMemberRow from './AllowlistMemberRow';

interface AllowlistMembersProps {
  data: UseAllowlistMembersReturn;
}

export default function AllowlistMembers({ data }: AllowlistMembersProps) {
  const { members, isLoading, error, refetch } = data;
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [query, setQuery] = useState('');

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

  // Empty real (sin miembros): sin buscador, nada que filtrar.
  if (members.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">Todavía no hay miembros en la beta.</p>
      </div>
    );
  }

  // SPEC-53 F12 — filtro client-side por email (la CF ya trajo todo).
  const q = query.trim().toLowerCase();
  const filtered = q ? members.filter((m) => m.email.toLowerCase().includes(q)) : members;

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
        aria-label="Buscar miembros por email"
        className="rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40"
      />
      {/* Empty con filtro activo: mantener el buscador + mensaje diferenciado (no el empty real). */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">Ningún miembro coincide con la búsqueda.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((member) => (
            <AllowlistMemberRow
              key={member.email}
              member={member}
              busy={busyEmail === member.email}
              onRevoke={(email) => void handleRevoke(email)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
