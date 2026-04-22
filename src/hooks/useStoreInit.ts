import { useEffect, useRef, useState } from 'react';
import { createFirestorePersister } from '@/lib/tinybase';
import { notesStore } from '@/stores/notesStore';
import { linksStore } from '@/stores/linksStore';
import { inboxStore } from '@/stores/inboxStore';
import { tasksStore } from '@/stores/tasksStore';
import { projectsStore } from '@/stores/projectsStore';
import { objectivesStore } from '@/stores/objectivesStore';
import { habitsStore } from '@/stores/habitsStore';
import type { Persister } from 'tinybase/persisters';

interface StoreConfig {
  store: Parameters<typeof createFirestorePersister>[0]['store'];
  tableName: string;
  collection: string;
}

// Si el userId cambia mientras los persisters arrancan (sign out rápido),
// el flag `cancelled` evita que los persisters recién creados queden
// colgados: se destruyen inmediatamente tras inicializar.
export default function useStoreInit(userId: string | null): { isHydrating: boolean } {
  // Estado del último userId que terminó de hidratar. isHydrating se deriva:
  // si userId actual !== hidratado, estamos hidratando. Patrón derivado evita
  // setState dentro del effect al cambiar userId (regla react-hooks/set-state-in-effect).
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const isHydrating = userId === null || hydratedUserId !== userId;
  // Anti-StrictMode: el .then del Promise.all puede resolver para un userId
  // obsoleto en dev (double-mount). El ref retiene el userId vigente; solo
  // marcamos hidratado si coincide con el effect actual.
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    currentUserIdRef.current = userId;
    if (!userId) return;

    const configs: StoreConfig[] = [
      { store: notesStore, tableName: 'notes', collection: 'notes' },
      { store: linksStore, tableName: 'links', collection: 'links' },
      { store: inboxStore, tableName: 'inbox', collection: 'inbox' },
      { store: tasksStore, tableName: 'tasks', collection: 'tasks' },
      { store: projectsStore, tableName: 'projects', collection: 'projects' },
      { store: objectivesStore, tableName: 'objectives', collection: 'objectives' },
      { store: habitsStore, tableName: 'habits', collection: 'habits' },
    ];

    // Limpiar tablas del user anterior antes de hidratar las del user nuevo.
    // delTable con persister aún no creado no dispara setDoc; post-destroy en
    // cleanup tampoco (onSnapshot ya apagado). Cierra la ventana <100ms donde
    // un click escribiría rows del user viejo al path del user nuevo.
    configs.forEach(({ store, tableName }) => store.delTable(tableName));

    let cancelled = false;
    const persisters: Persister[] = [];

    Promise.all(
      configs.map(async (config) => {
        const persister = createFirestorePersister({
          store: config.store,
          collectionPath: `users/${userId}/${config.collection}`,
          tableName: config.tableName,
        });
        await persister.startAutoLoad();
        await persister.startAutoSave();
        return persister;
      }),
    )
      .then((created) => {
        if (cancelled) {
          created.forEach((p) => p.destroy());
          return;
        }
        persisters.push(...created);
        if (currentUserIdRef.current === userId) {
          setHydratedUserId(userId);
        }
      })
      .catch((error) => {
        console.error('[useStoreInit] failed to init persisters', error);
      });

    return () => {
      cancelled = true;
      // destroy primero (apaga onSnapshot + autoSave), luego delTable. Invertido
      // = race con snapshot in-flight que repuebla la tabla ya vaciada.
      persisters.forEach((p) => p.destroy());
      configs.forEach(({ store, tableName }) => store.delTable(tableName));
    };
  }, [userId]);

  return { isHydrating };
}
