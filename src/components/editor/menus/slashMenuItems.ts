import { useMemo } from 'react';
import {
  AtSign,
  BookOpen,
  Code,
  FileCheck,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';
import { notesRepo } from '@/infra/repos/notesRepo';
import type { NoteType } from '@/types/common';
import { buildLiteratureTemplate } from '@/components/editor/templates/literatureTemplate';
import { buildPermanentTemplate } from '@/components/editor/templates/permanentTemplate';
import type { TFunction } from 'i18next';
import type { Editor } from '@tiptap/core';

export interface SlashCommandContext {
  noteId: string;
}

async function updateNoteType(noteId: string, type: NoteType): Promise<void> {
  await notesRepo.updateMeta(noteId, { noteType: type });
}

// F58: category es KEY ESTABLE ('text'/'lists'/…), NO el label visible — el
// label se resuelve en SlashMenu con t() (jurisprudencia navItems: identidad
// estable separada del display traducible). El agrupado del menú compara la
// key, no el texto, así que el switch de idioma no rompe CATEGORY_ORDER.
export type SlashMenuCategory = 'text' | 'lists' | 'blocks' | 'mentions' | 'templates';

export interface SlashMenuItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: SlashMenuCategory;
  keywords?: string[];
  action: (editor: Editor, ctx: SlashCommandContext) => void;
}

export const CATEGORY_ORDER: SlashMenuCategory[] = [
  'text',
  'lists',
  'blocks',
  'mentions',
  'templates',
];

// Fuente única de los items, parametrizada por t. La consumen DOS caminos:
// (1) React vía useSlashMenuItems (t reactivo de useTranslation); (2) la
// extensión TipTap module-scope vía getSlashMenuItems (i18n.t directo, patrón
// wikilink.ts). Sin esto el refactor const→hook rompería la extensión, que no
// puede llamar un hook. Labels EN (Heading 1…) = excepción (c) vía catálogo.
function buildSlashMenuItems(t: TFunction): SlashMenuItem[] {
  return [
    {
      id: 'heading-1',
      label: t('editor.slash.items.heading1.label', 'Heading 1'),
      description: t('editor.slash.items.heading1.description', 'Título principal'),
      icon: Heading1,
      category: 'text',
      keywords: ['h1', 'titulo'],
      action: (editor) => editor.chain().focus().setNode('heading', { level: 1 }).run(),
    },
    {
      id: 'heading-2',
      label: t('editor.slash.items.heading2.label', 'Heading 2'),
      description: t('editor.slash.items.heading2.description', 'Subtítulo'),
      icon: Heading2,
      category: 'text',
      keywords: ['h2', 'subtitulo'],
      action: (editor) => editor.chain().focus().setNode('heading', { level: 2 }).run(),
    },
    {
      id: 'heading-3',
      label: t('editor.slash.items.heading3.label', 'Heading 3'),
      description: t('editor.slash.items.heading3.description', 'Subtítulo menor'),
      icon: Heading3,
      category: 'text',
      keywords: ['h3'],
      action: (editor) => editor.chain().focus().setNode('heading', { level: 3 }).run(),
    },
    {
      id: 'bullet-list',
      label: t('editor.slash.items.bulletList.label', 'Bullet List'),
      description: t('editor.slash.items.bulletList.description', 'Lista con viñetas'),
      icon: List,
      category: 'lists',
      keywords: ['ul', 'vinetas'],
      action: (editor) => editor.chain().focus().toggleBulletList().run(),
    },
    {
      id: 'ordered-list',
      label: t('editor.slash.items.orderedList.label', 'Numbered List'),
      description: t('editor.slash.items.orderedList.description', 'Lista numerada'),
      icon: ListOrdered,
      category: 'lists',
      keywords: ['ol', 'numerada'],
      action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      id: 'task-list',
      label: t('editor.slash.items.taskList.label', 'Task List'),
      description: t('editor.slash.items.taskList.description', 'Lista con checkboxes'),
      icon: ListChecks,
      category: 'lists',
      keywords: ['tareas', 'checkbox', 'todo'],
      action: (editor) => editor.chain().focus().toggleTaskList().run(),
    },
    {
      id: 'code-block',
      label: t('editor.slash.items.codeBlock.label', 'Code Block'),
      description: t('editor.slash.items.codeBlock.description', 'Bloque de código'),
      icon: Code,
      category: 'blocks',
      keywords: ['codigo', 'pre'],
      action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      id: 'blockquote',
      label: t('editor.slash.items.blockquote.label', 'Blockquote'),
      description: t('editor.slash.items.blockquote.description', 'Cita textual'),
      icon: Quote,
      category: 'blocks',
      keywords: ['cita', 'quote'],
      action: (editor) => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      id: 'divider',
      label: t('editor.slash.items.divider.label', 'Divider'),
      description: t('editor.slash.items.divider.description', 'Línea horizontal'),
      icon: Minus,
      category: 'blocks',
      keywords: ['hr', 'linea', 'separador'],
      action: (editor) => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      id: 'mention-note',
      label: t('editor.slash.items.mentionNote.label', 'Mencionar nota'),
      description: t('editor.slash.items.mentionNote.description', 'Insertar @ para autocompletar'),
      icon: AtSign,
      category: 'mentions',
      action: (editor) => editor.chain().focus().insertContent('@').run(),
    },
    {
      id: 'template-literature',
      label: t('editor.slash.items.templateLiterature.label', 'Nota Literature'),
      description: t(
        'editor.slash.items.templateLiterature.description',
        'Template para notas de fuentes',
      ),
      icon: BookOpen,
      category: 'templates',
      action: (editor, ctx) => {
        editor.chain().focus().insertContent(buildLiteratureTemplate(t)).run();
        void updateNoteType(ctx.noteId, 'literature');
      },
    },
    {
      id: 'template-permanent',
      label: t('editor.slash.items.templatePermanent.label', 'Nota Permanent'),
      description: t(
        'editor.slash.items.templatePermanent.description',
        'Template para ideas permanentes',
      ),
      icon: FileCheck,
      category: 'templates',
      action: (editor, ctx) => {
        editor.chain().focus().insertContent(buildPermanentTemplate(t)).run();
        void updateNoteType(ctx.noteId, 'permanent');
      },
    },
  ];
}

// Camino React: t reactivo, re-evalúa al cambiar de idioma.
export function useSlashMenuItems(): SlashMenuItem[] {
  const { t } = useTranslation();
  return useMemo(() => buildSlashMenuItems(t), [t]);
}

// Camino module-scope (extensión TipTap): i18n.t directo, lee el idioma vigente
// en cada llamada. El render del SlashMenu igual re-consulta con sus items del
// hook, así que el idioma del menú es siempre el reactivo; esta versión solo
// alimenta el suggestion plugin de TipTap.
export function getSlashMenuItems(): SlashMenuItem[] {
  return buildSlashMenuItems(i18n.t.bind(i18n));
}

// Filtro puro: recibe los items (del hook) + query. SlashMenu inyecta los
// items traducidos. El haystack incluye el label resuelto, así el filtro
// matchea en el idioma activo.
export function filterSlashMenuItems(items: SlashMenuItem[], query: string): SlashMenuItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => {
    const haystack = [item.label, item.id, ...(item.keywords ?? [])].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}
