import { createBrowserRouter } from 'react-router';
import Layout from '@/app/layout';
import DashboardPage from '@/app/page';
import InboxPage from '@/app/inbox/page';
import NotesListPage from '@/app/notes/page';
import NoteDetailPage from '@/app/notes/[noteId]/page';
import SettingsPage from '@/app/settings/page';
import NotFoundPage from '@/app/not-found';
import LoginPage from '@/app/login/page';

const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: DashboardPage },
      { path: 'inbox', Component: InboxPage },
      { path: 'notes', Component: NotesListPage },
      { path: 'notes/:noteId', Component: NoteDetailPage },
      { path: 'settings', Component: SettingsPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
  { path: '/login', Component: LoginPage },
]);

export default router;
