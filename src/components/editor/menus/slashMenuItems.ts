import { doc, updateDoc } from 'firebase/firestore';
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
import { auth, db } from '@/lib/firebase';
import { notesStore } from '@/stores/notesStore';
import type { NoteType } from '@/types/common';
import { literatureTemplate } from '@/components/editor/templates/literatureTemplate';
import { permanentTemplate } from '@/components/editor/templates/permanentTemplate';
import type { Editor } from '@tiptap/core';

export interface SlashCommandContext {
  noteId: string;
}

async function updateNoteType(noteId: string, type: NoteType): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  notesStore.setPartialRow('notes', noteId, { noteType: type });
  try {
    await updateDoc(doc(db, 'users', uid, 'notes', noteId), { noteType: type });
  } catch (error) {
    console.error('[slashMenu] updateNoteType failed', error);
  }
}

export type SlashMenuCategory = 'Texto' | 'Listas' | 'Bloques' | 'Menciones' | 'Templates';

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
  'Texto',
  'Listas',
  'Bloques',
  'Menciones',
  'Templates',
];

export const slashMenuItems: SlashMenuItem[] = [
  {
    id: 'heading-1',
    label: 'Heading 1',
    description: 'Título principal',
    icon: Heading1,
    category: 'Texto',
    keywords: ['h1', 'titulo'],
    action: (editor) => editor.chain().focus().setNode('heading', { level: 1 }).run(),
  },
  {
    id: 'heading-2',
    label: 'Heading 2',
    description: 'Subtítulo',
    icon: Heading2,
    category: 'Texto',
    keywords: ['h2', 'subtitulo'],
    action: (editor) => editor.chain().focus().setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'heading-3',
    label: 'Heading 3',
    description: 'Subtítulo menor',
    icon: Heading3,
    category: 'Texto',
    keywords: ['h3'],
    action: (editor) => editor.chain().focus().setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'bullet-list',
    label: 'Bullet List',
    description: 'Lista con viñetas',
    icon: List,
    category: 'Listas',
    keywords: ['ul', 'vinetas'],
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'ordered-list',
    label: 'Numbered List',
    description: 'Lista numerada',
    icon: ListOrdered,
    category: 'Listas',
    keywords: ['ol', 'numerada'],
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'task-list',
    label: 'Task List',
    description: 'Lista con checkboxes',
    icon: ListChecks,
    category: 'Listas',
    keywords: ['tareas', 'checkbox', 'todo'],
    action: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    id: 'code-block',
    label: 'Code Block',
    description: 'Bloque de código',
    icon: Code,
    category: 'Bloques',
    keywords: ['codigo', 'pre'],
    action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'blockquote',
    label: 'Blockquote',
    description: 'Cita textual',
    icon: Quote,
    category: 'Bloques',
    keywords: ['cita', 'quote'],
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Línea horizontal',
    icon: Minus,
    category: 'Bloques',
    keywords: ['hr', 'linea', 'separador'],
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    id: 'mention-note',
    label: 'Mencionar nota',
    description: 'Insertar @ para autocompletar',
    icon: AtSign,
    category: 'Menciones',
    action: (editor) => editor.chain().focus().insertContent('@').run(),
  },
  {
    id: 'template-literature',
    label: 'Nota Literature',
    description: 'Template para notas de fuentes',
    icon: BookOpen,
    category: 'Templates',
    action: (editor, ctx) => {
      editor.chain().focus().insertContent(literatureTemplate).run();
      void updateNoteType(ctx.noteId, 'literature');
    },
  },
  {
    id: 'template-permanent',
    label: 'Nota Permanent',
    description: 'Template para ideas permanentes',
    icon: FileCheck,
    category: 'Templates',
    action: (editor, ctx) => {
      editor.chain().focus().insertContent(permanentTemplate).run();
      void updateNoteType(ctx.noteId, 'permanent');
    },
  },
];

export function filterSlashMenuItems(query: string): SlashMenuItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return slashMenuItems;
  return slashMenuItems.filter((item) => {
    const haystack = [item.label, item.id, ...(item.keywords ?? [])].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}
