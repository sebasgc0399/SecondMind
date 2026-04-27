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

export const navItems: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/', end: true },
  { label: 'Inbox', icon: Inbox, to: '/inbox' },
  { label: 'Notas', icon: FileText, to: '/notes' },
  { label: 'Grafo', icon: Network, to: '/notes/graph' },
  { label: 'Tareas', icon: CheckSquare, to: '/tasks' },
  { label: 'Proyectos', icon: FolderKanban, to: '/projects' },
  { label: 'Objetivos', icon: Target, to: '/objectives' },
  { label: 'Hábitos', icon: Repeat, to: '/habits' },
];
