import { describe, it, expect } from 'vitest';
import {
  serializeTasks,
  serializeProjects,
  serializeObjectives,
  serializeHabits,
  serializeInbox,
  buildLeeme,
} from './serializeEntities';
import { serializeNoteFile } from './serializeNoteFile';
import { buildExportLabels } from './exportLabels';
import { buildWikilinkResolver } from './wikilinkResolver';
import type { JSONContent } from '@tiptap/core';
import type { TFunction } from 'i18next';
import type { ExportNote, ExportTask, ExportHabitDay, ExportInboxItem } from './exportTypes';

// Stub de t(): devuelve el defaultValue (copy fuente español).
const t = ((key: string, def?: string) => def ?? key) as unknown as TFunction;
const labels = buildExportLabels(t);

const JUN20 = Date.UTC(2026, 5, 20);

describe('serializeEntities — tasks', () => {
  it('empty → header + placeholder', () => {
    expect(serializeTasks([], labels, t)).toContain('# Tareas');
    expect(serializeTasks([], labels, t)).toContain('(sin elementos)');
  });

  it('resuelve enums a labels + fecha + archivada', () => {
    const tasks: ExportTask[] = [
      {
        id: 't1',
        name: 'Comprar pan',
        description: 'en la esquina',
        status: 'in-progress',
        priority: 'high',
        dueDate: JUN20,
        completedAt: 0,
        projectId: '',
        areaId: '',
        objectiveId: '',
        noteIds: [],
        isArchived: false,
        createdAt: 1,
      },
      {
        id: 't2',
        name: 'Vieja',
        description: '',
        status: 'completed',
        priority: 'low',
        dueDate: 0,
        completedAt: 0,
        projectId: '',
        areaId: '',
        objectiveId: '',
        noteIds: [],
        isArchived: true,
        createdAt: 2,
      },
    ];
    const out = serializeTasks(tasks, labels, t);
    expect(out).toContain('- **Comprar pan** — En progreso · Alta · vence 2026-06-20');
    expect(out).toContain('  - en la esquina');
    expect(out).toContain('- **Vieja** — Completada · Baja _(archivada)_');
  });
});

describe('serializeEntities — projects y objectives', () => {
  it('proyectos con estado/prioridad/límite', () => {
    const out = serializeProjects(
      [
        {
          id: 'p1',
          name: 'Proyecto X',
          status: 'in-progress',
          priority: 'urgent',
          areaId: '',
          objectiveId: '',
          taskIds: [],
          noteIds: [],
          startDate: 0,
          deadline: JUN20,
          isArchived: false,
          createdAt: 1,
        },
      ],
      labels,
      t,
    );
    expect(out).toContain('- **Proyecto X** — En progreso · Urgente · límite 2026-06-20');
  });

  it('objetivos con estado', () => {
    const out = serializeObjectives(
      [
        {
          id: 'o1',
          name: 'Meta',
          status: 'not-started',
          deadline: 0,
          areaId: '',
          projectIds: [],
          taskIds: [],
          isArchived: false,
          createdAt: 1,
        },
      ],
      labels,
      t,
    );
    expect(out).toContain('- **Meta** — No empezado');
  });
});

describe('serializeEntities — habits (compacto)', () => {
  it('lista por día con labels y conteo /14', () => {
    const habits: ExportHabitDay[] = [
      { id: '2026-06-20', date: JUN20, done: ['ejercicio', 'leer', 'meditar'], progress: 3 },
    ];
    const out = serializeHabits(habits, labels, t);
    expect(out).toContain('- **2026-06-20**: Ejercicio, Leer, Meditar (3/14)');
  });
});

describe('serializeEntities — inbox', () => {
  it('rawContent + source', () => {
    const inbox: ExportInboxItem[] = [
      {
        id: 'i1',
        rawContent: 'idea suelta',
        source: 'quick-capture',
        sourceUrl: '',
        status: 'pending',
        createdAt: 1,
      },
    ];
    expect(serializeInbox(inbox, t)).toContain('- idea suelta _(quick-capture)_');
  });
});

describe('buildLeeme — catálogos D5', () => {
  const leeme = buildLeeme(labels, t);
  it('incluye los catálogos key→label de áreas y hábitos', () => {
    expect(leeme).toContain('### Áreas');
    expect(leeme).toContain('- `proyectos` → Proyectos');
    expect(leeme).toContain('### Hábitos');
    expect(leeme).toContain('- `ejercicio` → Ejercicio');
  });
  it('incluye estados de tarea (el labeler nuevo)', () => {
    expect(leeme).toContain('- `in-progress` → En progreso');
  });
});

describe('serializeNoteFile — ensamblado completo', () => {
  const note: ExportNote = {
    id: 'n1',
    title: 'Mi nota',
    contentDoc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'cuerpo con ' },
            { type: 'wikilink', attrs: { noteId: 'n2', noteTitle: 'viejo' } },
          ],
        },
      ],
    } as JSONContent,
    summaryL3: 'la síntesis',
    source: 'https://x.com',
    paraType: 'resource',
    noteType: 'fleeting',
    tagIds: ['productividad', 'ia'],
    isArchived: false,
    createdAt: JUN20,
    updatedAt: JUN20,
  };
  const resolver = buildWikilinkResolver([{ id: 'n2', title: 'Nota Dos' }]);
  const out = serializeNoteFile(note, resolver, labels, t);

  it('frontmatter con tags literales + metadata localizada', () => {
    expect(out).toContain('---\ntags: [productividad, ia]');
    expect(out).toContain('tipo: Fugaz');
    expect(out).toContain('categoría: Recurso');
    expect(out).toContain('creada: 2026-06-20');
    expect(out).toContain('fuente: "https://x.com"'); // URL con ':' → quoted (YAML seguro)
  });

  it('título H1 + summaryL3 como blockquote al inicio', () => {
    expect(out).toContain('# Mi nota');
    expect(out).toContain('> **Resumen:** la síntesis');
  });

  it('cuerpo serializado con wikilink fresh-resolved', () => {
    expect(out).toContain('cuerpo con [[Nota Dos]]');
  });
});
