import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Provider } from 'tinybase/ui-react';
import router from '@/app/router';
import { notesStore } from '@/stores/notesStore';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={notesStore}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
);
