import { beforeEach, describe, expect, it, vi } from 'vitest';
import { inboxRepo } from '@/infra/repos/inboxRepo';
import { inboxStore } from '@/stores/inboxStore';

// vi.mock se hoistea — el factory crea el store antes de los imports.
vi.mock('@/stores/inboxStore', async () => {
  const { createStore } = await import('tinybase');
  const store = createStore().setTablesSchema({
    inbox: {
      rawContent: { type: 'string', default: '' },
      aiSuggestedTitle: { type: 'string', default: '' },
      aiSuggestedType: { type: 'string', default: '' },
      aiSuggestedTags: { type: 'string', default: '[]' },
      aiSuggestedArea: { type: 'string', default: '' },
      aiPriority: { type: 'string', default: 'medium' },
      status: { type: 'string', default: 'pending' },
      processedAs: { type: 'string', default: '' },
      aiProcessed: { type: 'boolean', default: false },
      aiSummary: { type: 'string', default: '' },
      aiConfidence: { type: 'number', default: 0 },
      source: { type: 'string', default: '' },
      sourceUrl: { type: 'string', default: '' },
      createdAt: { type: 'number', default: 0 },
    },
  });
  return { inboxStore: store };
});

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-uid' } as { uid: string } | null },
  db: {} as object,
}));

const setDocMock = vi.fn();
const docMock = vi.fn((_db: object, path: string) => ({ __path: path }));

vi.mock('firebase/firestore', () => ({
  setDoc: (...args: unknown[]) => setDocMock(...args),
  doc: (...args: unknown[]) => docMock(args[0] as object, args[1] as string),
}));

const createFromInboxMock = vi.fn();
const createTaskMock = vi.fn();
const createProjectMock = vi.fn();

vi.mock('@/infra/repos/notesRepo', () => ({
  notesRepo: {
    createFromInbox: (...args: unknown[]) => createFromInboxMock(...args),
  },
}));
vi.mock('@/infra/repos/tasksRepo', () => ({
  tasksRepo: {
    createTask: (...args: unknown[]) => createTaskMock(...args),
  },
}));
vi.mock('@/infra/repos/projectsRepo', () => ({
  projectsRepo: {
    createProject: (...args: unknown[]) => createProjectMock(...args),
  },
}));

describe('inboxRepo', () => {
  beforeEach(async () => {
    setDocMock.mockReset();
    setDocMock.mockResolvedValue(undefined);
    docMock.mockClear();
    createFromInboxMock.mockReset();
    createFromInboxMock.mockResolvedValue('new-note-id');
    createTaskMock.mockReset();
    createTaskMock.mockResolvedValue('new-task-id');
    createProjectMock.mockReset();
    createProjectMock.mockResolvedValue('new-project-id');
    inboxStore.delTable('inbox');
    const firebase = await import('@/lib/firebase');
    (firebase.auth as { currentUser: { uid: string } | null }).currentUser = { uid: 'test-uid' };
  });

  describe('convertToNote', () => {
    it('usa aiSuggestedTitle como default cuando no hay overrides (alinea con convertToTask/Project)', async () => {
      inboxStore.setRow('inbox', 'i1', {
        rawContent: 'QA prefix: contenido largo de la captura del usuario',
        aiSuggestedTitle: 'Título refinado por la IA',
        status: 'pending',
        aiProcessed: true,
      });

      const result = await inboxRepo.convertToNote('i1');

      expect(result?.resultId).toBe('new-note-id');
      expect(createFromInboxMock).toHaveBeenCalledOnce();
      const [rawContent, opts] = createFromInboxMock.mock.calls[0] as [
        string,
        { title: string; tagIds: string[] },
      ];
      expect(rawContent).toBe('QA prefix: contenido largo de la captura del usuario');
      expect(opts.title).toBe('Título refinado por la IA');
      expect(opts.tagIds).toEqual([]);
    });

    it('overrides.title gana sobre aiSuggestedTitle', async () => {
      inboxStore.setRow('inbox', 'i2', {
        rawContent: 'rawContent',
        aiSuggestedTitle: 'AI title',
        status: 'pending',
      });

      await inboxRepo.convertToNote('i2', { title: 'Override title' });

      const [, opts] = createFromInboxMock.mock.calls[0] as [string, { title: string }];
      expect(opts.title).toBe('Override title');
    });

    it('fallback a firstLine cuando no hay aiSuggestedTitle ni override', async () => {
      inboxStore.setRow('inbox', 'i3', {
        rawContent: 'Primera línea\nSegunda línea',
        status: 'pending',
      });

      await inboxRepo.convertToNote('i3');

      const [, opts] = createFromInboxMock.mock.calls[0] as [string, { title: string }];
      expect(opts.title).toBe('Primera línea');
    });

    it('"Sin título" cuando rawContent vacío y no hay aiSuggestedTitle', async () => {
      inboxStore.setRow('inbox', 'i4', {
        rawContent: '',
        status: 'pending',
      });

      await inboxRepo.convertToNote('i4');

      const [, opts] = createFromInboxMock.mock.calls[0] as [string, { title: string }];
      expect(opts.title).toBe('Sin título');
    });

    it('row inexistente → null sin tocar createFromInbox', async () => {
      const result = await inboxRepo.convertToNote('non-existent-id');
      expect(result).toBeNull();
      expect(createFromInboxMock).not.toHaveBeenCalled();
    });
  });
});
