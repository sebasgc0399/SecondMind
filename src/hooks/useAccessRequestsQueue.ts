import { useState, useEffect, useCallback } from 'react';
import { listAccessRequests } from '@/lib/accessRequests';
import type { AccessRequest } from '@/types/accessRequest';

interface UseAccessRequestsQueueReturn {
  requests: AccessRequest[];
  isLoading: boolean;
  error: string;
  refetch: () => Promise<void>;
}

// SPEC-52 F6 — fetch one-shot de la cola para /admin. FUERA de TinyBase/repos a
// propósito: es tooling admin efímero (no dominio reactivo del usuario), análogo a la
// excepción "lectura MVP one-shot" de useNote. La autorización real la hace la CF
// (requireAdmin); acá solo se consume el resultado.
export default function useAccessRequestsQueue(): UseAccessRequestsQueueReturn {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setRequests(await listAccessRequests());
    } catch {
      setError('No se pudo cargar la cola de solicitudes.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { requests, isLoading, error, refetch };
}
