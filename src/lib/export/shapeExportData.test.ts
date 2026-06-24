import { describe, it, expect } from 'vitest';
import { shapeExportData, type RawExportInput } from './shapeExportData';

const emptyTables = { projects: {}, objectives: {} };

function baseInput(overrides: Partial<RawExportInput>): RawExportInput {
  return {
    notes: [],
    tasks: {},
    projects: {},
    objectives: {},
    habits: {},
    inbox: {},
    ...overrides,
  };
}

describe('shapeExportData — filtros D6 de notas', () => {
  const input = baseInput({
    notes: [
      {
        id: 'n-active',
        data: {
          title: 'Activa',
          content: '{"type":"doc","content":[]}',
          deletedAt: 0,
          isArchived: false,
          createdAt: 1,
        },
      },
      {
        id: 'n-trash',
        data: {
          title: 'Papelera',
          content: '{"type":"doc"}',
          deletedAt: 9999,
          isArchived: false,
          createdAt: 2,
        },
      },
      {
        id: 'n-archived',
        data: {
          title: 'Archivada',
          content: '{"type":"doc","content":[]}',
          deletedAt: 0,
          isArchived: true,
          createdAt: 3,
        },
      },
    ],
    ...emptyTables,
  });
  const out = shapeExportData(input);

  it('papelera (deletedAt > 0) queda FUERA', () => {
    expect(out.notes.map((n) => n.id)).not.toContain('n-trash');
  });

  it('activas y archivadas quedan DENTRO', () => {
    expect(out.notes.map((n) => n.id)).toEqual(['n-active', 'n-archived']);
  });

  it('preserva isArchived', () => {
    expect(out.notes.find((n) => n.id === 'n-archived')?.isArchived).toBe(true);
  });

  it('noteRefs incluye solo notas exportables (no la papelera)', () => {
    expect(out.noteRefs.map((r) => r.id)).toEqual(['n-active', 'n-archived']);
  });
});

describe('shapeExportData — resiliencia a content corrupto', () => {
  it('content con JSON inválido NO aborta el batch; cae a doc vacío', () => {
    const out = shapeExportData(
      baseInput({
        notes: [
          {
            id: 'n-ok',
            data: {
              title: 'OK',
              content: '{"type":"doc","content":[]}',
              deletedAt: 0,
              createdAt: 1,
            },
          },
          {
            id: 'n-corrupt',
            data: { title: 'Rota', content: 'no es json {[', deletedAt: 0, createdAt: 2 },
          },
          { id: 'n-nocontent', data: { title: 'Sin content', deletedAt: 0, createdAt: 3 } },
        ],
      }),
    );
    expect(out.notes.map((n) => n.id)).toEqual(['n-ok', 'n-corrupt', 'n-nocontent']);
    expect(out.notes.find((n) => n.id === 'n-corrupt')?.contentDoc).toEqual({
      type: 'doc',
      content: [],
    });
    expect(out.notes.find((n) => n.id === 'n-nocontent')?.contentDoc).toEqual({
      type: 'doc',
      content: [],
    });
  });
});

describe('shapeExportData — filtros D6 de inbox', () => {
  it('dismissed FUERA; pending y processed DENTRO', () => {
    const out = shapeExportData(
      baseInput({
        inbox: {
          'i-pending': { rawContent: 'pend', status: 'pending', createdAt: 1 },
          'i-processed': { rawContent: 'proc', status: 'processed', createdAt: 2 },
          'i-dismissed': { rawContent: 'desc', status: 'dismissed', createdAt: 3 },
        },
      }),
    );
    expect(out.inbox.map((i) => i.id)).toEqual(['i-pending', 'i-processed']);
  });
});

describe('shapeExportData — tasks/projects/objectives (archivados DENTRO)', () => {
  it('incluye archivados (Contenido vivo)', () => {
    const out = shapeExportData(
      baseInput({
        tasks: {
          t1: { name: 'Activa', status: 'inbox', isArchived: false, createdAt: 1 },
          t2: { name: 'Archivada', status: 'completed', isArchived: true, createdAt: 2 },
        },
      }),
    );
    expect(out.tasks.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(out.tasks.find((t) => t.id === 't2')?.isArchived).toBe(true);
  });

  it('parsea los arrays JSON-string (noteIds, taskIds)', () => {
    const out = shapeExportData(
      baseInput({
        tasks: { t1: { name: 'T', noteIds: '["n1","n2"]', createdAt: 1 } },
      }),
    );
    expect(out.tasks[0]?.noteIds).toEqual(['n1', 'n2']);
  });
});

describe('shapeExportData — habits compactos', () => {
  it('extrae solo los hábitos marcados (done) ese día', () => {
    const out = shapeExportData(
      baseInput({
        habits: {
          '2026-06-20': {
            date: 100,
            ejercicio: true,
            leer: true,
            codear: false,
            meditar: true,
            progress: 3,
          },
        },
      }),
    );
    expect(out.habits[0]?.done).toEqual(['ejercicio', 'leer', 'meditar']);
    expect(out.habits[0]?.progress).toBe(3);
  });
});
