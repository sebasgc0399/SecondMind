import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Provider } from 'tinybase/ui-react';
import router from '@/app/router';
import useCloseToTray from '@/hooks/useCloseToTray';
import useGlobalShortcutRegistration from '@/hooks/useGlobalShortcutRegistration';
import { isCapacitor } from '@/lib/capacitor';
import { initCapacitorAuth } from '@/lib/capacitorAuth';
import { SplashScreen } from '@capacitor/splash-screen';
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
  void SplashScreen.hide().catch(() => {});
}

function TauriIntegration({ children }: { children: ReactNode }) {
  useCloseToTray();
  useGlobalShortcutRegistration();
  return <>{children}</>;
}

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
