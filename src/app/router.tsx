import { createBrowserRouter } from 'react-router';
import Layout from '@/app/layout';
import DashboardPage from '@/app/page';
import InboxPage from '@/app/inbox/page';
import InboxProcessorPage from '@/app/inbox/process/page';
import NotesListPage from '@/app/notes/page';
import NoteDetailPage from '@/app/notes/[noteId]/page';
import TasksPage from '@/app/tasks/page';
import ProjectsPage from '@/app/projects/page';
import ProjectDetailPage from '@/app/projects/[projectId]/page';
import ObjectivesPage from '@/app/objectives/page';
import HabitsPage from '@/app/habits/page';
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
      { path: 'inbox/process', Component: InboxProcessorPage },
      { path: 'notes', Component: NotesListPage },
      { path: 'notes/:noteId', Component: NoteDetailPage },
      { path: 'tasks', Component: TasksPage },
      { path: 'projects', Component: ProjectsPage },
      { path: 'projects/:projectId', Component: ProjectDetailPage },
      { path: 'objectives', Component: ObjectivesPage },
      { path: 'habits', Component: HabitsPage },
      { path: 'settings', Component: SettingsPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
  { path: '/login', Component: LoginPage },
]);

export default router;
