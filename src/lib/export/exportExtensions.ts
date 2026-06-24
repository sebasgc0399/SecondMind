// Set de extensiones TipTap para SERIALIZAR el content de una nota a Markdown
// (export, SPEC-67). Es el set de CONTENIDO de NoteEditor.tsx:51-76 —
// MANTENER EN SYNC si el editor agrega/quita un nodo o mark de contenido.
//
// Diferencias vs el editor (a propósito):
//  - SIN Placeholder ni SlashCommand: son comportamiento de editor, no aportan
//    nodos/marks al schema que el serializador necesita.
//  - Wikilink SIN su plugin de Suggestion: el plugin necesita un Editor vivo
//    (this.editor) que no existe en el render headless. Se conserva el NODO
//    (schema + attrs) y se sobreescribe su salida vía nodeMapping en serializeNote.
//  - CodeBlockLowlight base con lowlight vacío: solo necesitamos el schema del
//    nodo `codeBlock` + su attr `language`; el resaltado (lowlight/highlight.js)
//    es de runtime del editor, irrelevante para Markdown. Evita arrastrar los 25
//    lenguajes de highlight.js al path del export.

import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight } from 'lowlight';
import Wikilink from '@/components/editor/extensions/wikilink';
import type { Extensions } from '@tiptap/core';

const WikilinkSchema = Wikilink.extend({ addProseMirrorPlugins: () => [] });

export const exportExtensions: Extensions = [
  StarterKit.configure({
    codeBlock: false,
    underline: false,
    link: {
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: 'https',
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  TableKit.configure({ table: { resizable: true } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  CodeBlockLowlight.configure({ lowlight: createLowlight() }),
  WikilinkSchema,
];
