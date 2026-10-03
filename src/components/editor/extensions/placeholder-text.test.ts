import { describe, expect, it } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import CodeBlockLowlight from '@/components/editor/extensions/code-block-lowlight';
import { resolvePlaceholderText } from '@/components/editor/extensions/placeholder-text';

const schema = getSchema([
  StarterKit.configure({ codeBlock: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit,
  CodeBlockLowlight,
]);

const texts = { emptyDoc: 'DOC', emptyLine: 'LINE' };

function docOf(content: JSONContent[]): ProseMirrorNode {
  return ProseMirrorNode.fromJSON(schema, { type: 'doc', content });
}

/** Devuelve el primer nodo vacío con el tipo dado y su posición de inicio. */
function findEmpty(doc: ProseMirrorNode, typeName: string) {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (!found && node.type.name === typeName && node.content.size === 0) found = { node, pos };
  });
  if (!found) throw new Error(`no hay ${typeName} vacío`);
  return found as { node: ProseMirrorNode; pos: number };
}

function resolveFor(doc: ProseMirrorNode, typeName: string, isEmptyDoc: boolean) {
  const { node, pos } = findEmpty(doc, typeName);
  return resolvePlaceholderText({ node, pos, doc, isEmptyDoc, texts });
}

const textParagraph: JSONContent = { type: 'paragraph', content: [{ type: 'text', text: 'hola' }] };

describe('resolvePlaceholderText', () => {
  it('nota vacía → placeholder de nota vacía', () => {
    expect(resolveFor(docOf([{ type: 'paragraph' }]), 'paragraph', true)).toBe('DOC');
  });

  it('párrafo vacío en nota con contenido → pista de comandos', () => {
    const doc = docOf([textParagraph, { type: 'paragraph' }]);
    expect(resolveFor(doc, 'paragraph', false)).toBe('LINE');
  });

  it('heading vacío → sin pista', () => {
    const doc = docOf([textParagraph, { type: 'heading', attrs: { level: 2 } }]);
    expect(resolveFor(doc, 'heading', false)).toBe('');
  });

  it('dentro de un bloque de código → sin pista', () => {
    const doc = docOf([textParagraph, { type: 'codeBlock' }]);
    expect(resolveFor(doc, 'codeBlock', false)).toBe('');
  });

  it('dentro de una tabla → sin pista', () => {
    const doc = docOf([
      textParagraph,
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }],
          },
        ],
      },
    ]);
    expect(resolveFor(doc, 'paragraph', false)).toBe('');
  });

  it('dentro de un item de tarea → sin pista', () => {
    const doc = docOf([
      textParagraph,
      {
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
        ],
      },
    ]);
    expect(resolveFor(doc, 'paragraph', false)).toBe('');
  });

  it('dentro de una lista o una cita → sin pista', () => {
    const list = docOf([
      textParagraph,
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
      },
    ]);
    expect(resolveFor(list, 'paragraph', false)).toBe('');
    const quote = docOf([textParagraph, { type: 'blockquote', content: [{ type: 'paragraph' }] }]);
    expect(resolveFor(quote, 'paragraph', false)).toBe('');
  });
});
