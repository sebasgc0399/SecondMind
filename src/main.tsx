import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'tinybase/ui-react';
import Layout from '@/app/layout';
import DashboardPage from '@/app/page';
import { notesStore } from '@/stores/notesStore';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={notesStore}>
      <Layout>
        <DashboardPage />
      </Layout>
    </Provider>
  </StrictMode>,
);
