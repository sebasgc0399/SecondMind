import { useEffect } from 'react';
import { initPersister } from '@/lib/tinybase';
import type { Persister } from 'tinybase/persisters';

export default function useStoreInit(userId: string | null) {
  useEffect(() => {
    if (!userId) return;

    let persister: Persister | null = null;

    initPersister(userId).then((p) => {
      persister = p;
    });

    return () => {
      persister?.destroy();
    };
  }, [userId]);
}
