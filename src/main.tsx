import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Provider } from 'tinybase/ui-react';
import router from '@/app/router';
import { notesStore } from '@/stores/notesStore';
import { linksStore } from '@/stores/linksStore';
import { inboxStore } from '@/stores/inboxStore';
import './index.css';

// notesStore es el store default del Provider (acceso sin storeId).
// linksStore e inboxStore se acceden con storeId en los hooks reactivos,
// por ejemplo: useRowIds('inbox', 'inbox').
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={notesStore} storesById={{ links: linksStore, inbox: inboxStore }}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
);
