import { useMemo } from 'react';
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
import { useTranslation } from 'react-i18next';
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

// F58: labels vía catálogo i18n. Hook (no const a module-scope) porque t()
// debe re-evaluarse al cambiar de idioma — un i18next.t() module-eval
// congelaría el idioma del boot. Keys literales adentro (extract + tipos
// no ven keys dinámicas). `key` de React en consumidores: usar item.to,
// nunca item.label (cambia con el locale → remount).
export function useNavSections(): NavSection[] {
  const { t } = useTranslation();
  return useMemo(
    () => [
      {
        label: t('nav.sections.execution', 'Ejecución'),
        items: [
          {
            label: t('nav.items.dashboard', 'Dashboard'),
            icon: LayoutDashboard,
            to: '/',
            end: true,
          },
          { label: t('nav.items.inbox', 'Inbox'), icon: Inbox, to: '/inbox' },
          { label: t('nav.items.tasks', 'Tareas'), icon: CheckSquare, to: '/tasks' },
          { label: t('nav.items.projects', 'Proyectos'), icon: FolderKanban, to: '/projects' },
          { label: t('nav.items.objectives', 'Objetivos'), icon: Target, to: '/objectives' },
          { label: t('nav.items.habits', 'Hábitos'), icon: Repeat, to: '/habits' },
        ],
      },
      {
        label: t('nav.sections.knowledge', 'Conocimiento'),
        items: [
          { label: t('nav.items.notes', 'Notas'), icon: FileText, to: '/notes', end: true },
          { label: t('nav.items.graph', 'Grafo'), icon: Network, to: '/notes/graph' },
        ],
      },
    ],
    [t],
  );
}

export function useNavItems(): NavItem[] {
  const sections = useNavSections();
  return useMemo(() => sections.flatMap((section) => section.items), [sections]);
}
