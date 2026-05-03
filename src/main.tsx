import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Provider } from 'tinybase/ui-react';
import router from '@/app/router';
import TauriIntegration from '@/app/TauriIntegration';
import { isCapacitor } from '@/lib/capacitor';
import { initCapacitorAuth } from '@/lib/capacitorAuth';
import { hideSplash } from '@/lib/splash';
import { migrateTinyBaseSchemaIfNeeded } from '@/lib/tinybase';
import { notesStore } from '@/stores/notesStore';
import { linksStore } from '@/stores/linksStore';
import { inboxStore } from '@/stores/inboxStore';
import { tasksStore } from '@/stores/tasksStore';
import { projectsStore } from '@/stores/projectsStore';
import { objectivesStore } from '@/stores/objectivesStore';
import { habitsStore } from '@/stores/habitsStore';
import './index.css';

if (isCapacitor()) {
  void initCapacitorAuth().catch((error) => {
    console.error('Failed to initialize Capacitor SocialLogin:', error);
  });
  // Safety: si auth+hydration no completan en 5s, ocultamos el splash igual
  // para no dejar la app colgada en redes lentas o errores. hideSplash() es
  // idempotente; si Layout llama antes vía useHideSplashWhenReady, este es no-op.
  window.setTimeout(() => {
    void hideSplash();
  }, 5000);
}

// F36.F8: invalidar cache TinyBase si bumpeamos el schema en código.
// Debe correr antes de createRoot/Provider/persisters porque delTables con
// persister activo dispararía race con el snapshot in-flight (D-F8.2).
migrateTinyBaseSchemaIfNeeded([
  notesStore,
  linksStore,
  inboxStore,
  tasksStore,
  projectsStore,
  objectivesStore,
  habitsStore,
]);

// notesStore es el store default del Provider (acceso sin storeId).
// Los demás stores se acceden con storeId en los hooks reactivos,
// por ejemplo: useRowIds('inbox', 'inbox') o useTable('tasks', 'tasks').
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider
      store={notesStore}
      storesById={{
        links: linksStore,
        inbox: inboxStore,
        tasks: tasksStore,
        projects: projectsStore,
        objectives: objectivesStore,
        habits: habitsStore,
      }}
    >
      <TauriIntegration>
        <RouterProvider router={router} />
      </TauriIntegration>
    </Provider>
  </StrictMode>,
);
