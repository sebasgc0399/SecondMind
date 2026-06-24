import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildExportZip } from './buildExportZip';
import type { TFunction } from 'i18next';
import type { JSONContent } from '@tiptap/core';
import type { ExportData, ExportNote } from './exportTypes';

const t = ((key: string, def?: string) => def ?? key) as unknown as TFunction;

function note(id: string, title: string, content: JSONContent): ExportNote {
  return {
    id,
    title,
    contentDoc: content,
    summaryL3: '',
    source: '',
    paraType: 'resource',
    noteType: 'fleeting',
    tagIds: [],
    isArchived: false,
    createdAt: 1,
    updatedAt: 1,
  };
}

const data: ExportData = {
  notes: [
    note('n1', 'Nota Uno', {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'apunta a ' },
            { type: 'wikilink', attrs: { noteId: 'n2', noteTitle: 'stale' } },
          ],
        },
      ],
    }),
    note('n2', 'Nota Dos', { type: 'doc', content: [] }),
  ],
  tasks: [
    {
      id: 't1',
      name: 'Una tarea',
      description: '',
      status: 'inbox',
      priority: 'low',
      dueDate: 0,
      completedAt: 0,
      projectId: '',
      areaId: '',
      objectiveId: '',
      noteIds: [],
      isArchived: false,
      createdAt: 1,
    },
  ],
  projects: [],
  objectives: [],
  habits: [{ id: '2026-06-20', date: 1, done: ['leer'], progress: 1 }],
  inbox: [
    {
      id: 'i1',
      rawContent: 'captura',
      source: 'quick-capture',
      sourceUrl: '',
      status: 'pending',
      createdAt: 1,
    },
  ],
  noteRefs: [
    { id: 'n1', title: 'Nota Uno' },
    { id: 'n2', title: 'Nota Dos' },
  ],
};

describe('buildExportZip', () => {
  it('arma el zip con la estructura esperada y contenido correcto', async () => {
    const bytes = await buildExportZip(data, t);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);

    // Archivos de entidad + LEEME
    for (const f of [
      'LEEME.md',
      'tareas.md',
      'proyectos.md',
      'objetivos.md',
      'habitos.md',
      'inbox.md',
    ]) {
      expect(names).toContain(f);
    }
    // Una nota por archivo bajo notas/
    expect(names).toContain('notas/Nota Uno.md');
    expect(names).toContain('notas/Nota Dos.md');

    // El wikilink se resolvió fresh al título real (no el stale "stale")
    const notaUno = await zip.file('notas/Nota Uno.md')!.async('string');
    expect(notaUno).toContain('apunta a [[Nota Dos]]');

    // La tarea está en tareas.md
    const tareas = await zip.file('tareas.md')!.async('string');
    expect(tareas).toContain('Una tarea');

    // LEEME trae los catálogos
    const leeme = await zip.file('LEEME.md')!.async('string');
    expect(leeme).toContain('### Áreas');
  });
});
