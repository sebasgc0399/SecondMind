import {
  LayoutDashboard,
  Inbox,
  FileText,
  CheckSquare,
  FolderKanban,
  Target,
  Network,
  Repeat,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  icon: LucideIcon;
  to: string;
  end?: boolean;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    label: 'Ejecución',
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true },
      { label: 'Tareas', icon: CheckSquare, to: '/tasks' },
      { label: 'Proyectos', icon: FolderKanban, to: '/projects' },
      { label: 'Objetivos', icon: Target, to: '/objectives' },
      { label: 'Hábitos', icon: Repeat, to: '/habits' },
    ],
  },
  {
    label: 'Captura',
    items: [{ label: 'Inbox', icon: Inbox, to: '/inbox' }],
  },
  {
    label: 'Conocimiento',
    items: [
      { label: 'Notas', icon: FileText, to: '/notes' },
      { label: 'Grafo', icon: Network, to: '/notes/graph' },
    ],
  },
];

export const navItems: NavItem[] = navSections.flatMap((section) => section.items);
