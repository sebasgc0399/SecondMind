import { useState, useEffect, useCallback } from 'react';
import { listAllowlistMembers } from '@/lib/allowlistMembers';
import type { AllowlistMember } from '@/types/allowlistMember';

export interface UseAllowlistMembersReturn {
  members: AllowlistMember[];
  isLoading: boolean;
  error: string;
  refetch: () => Promise<void>;
}

// SPEC-53 F5 — fetch one-shot de los miembros de la beta para /admin. FUERA de TinyBase/repos
// a propósito (tooling admin efímero, igual que useAccessRequestsQueue). La autorización real
// la hace la CF (requireAdmin); acá solo se consume el resultado.
export default function useAllowlistMembers(): UseAllowlistMembersReturn {
  const [members, setMembers] = useState<AllowlistMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setMembers(await listAllowlistMembers());
    } catch {
      setError('No se pudo cargar la lista de miembros.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { members, isLoading, error, refetch };
}
