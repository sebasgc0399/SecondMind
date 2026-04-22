import { useEffect } from 'react';
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
export default function useStoreInit(userId: string | null) {
  useEffect(() => {
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
}
