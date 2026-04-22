import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { createFirestoreRepo, type RepoRow } from '@/infra/repos/baseRepo';
import { notesStore } from '@/stores/notesStore';
import { stringifyIds } from '@/lib/tinybase';

// Schema TinyBase de notes — NO incluye `content` (el JSON TipTap solo
// vive en Firestore, gotcha universal del proyecto). saveContent más
// abajo usa updateDoc directo con `content` en el payload remoto.
interface NoteRow extends RepoRow {
  title: string;
  contentPlain: string;
  paraType: string;
  noteType: string;
  source: string;
  projectIds: string;
  areaIds: string;
  tagIds: string;
  outgoingLinkIds: string;
  incomingLinkIds: string;
  linkCount: number;
  summaryL1: string;
  summaryL2: string;
  summaryL3: string;
  distillLevel: number;
  aiTags: string;
  aiSummary: string;
  aiProcessed: boolean;
  createdAt: number;
  updatedAt: number;
  lastViewedAt: number;
  viewCount: number;
  isFavorite: boolean;
  isArchived: boolean;
  fsrsState: string;
  fsrsDue: number;
  fsrsLastReview: number;
}

const repo = createFirestoreRepo<NoteRow>({
  store: notesStore,
  table: 'notes',
  pathFor: (uid, id) => `users/${uid}/notes/${id}`,
});

export interface NoteCreateOverrides {
  title?: string;
  contentPlain?: string;
  paraType?: string;
  noteType?: string;
  source?: string;
}

/**
 * Crea una nota vacía. El content (TipTap JSON) se escribe desde
 * useNoteSave al abrir el editor. El caller típicamente hace
 * `await createNote()` antes de `navigate('/notes/{id}')` para respetar
 * el gotcha de ESTADO-ACTUAL: setDoc debe terminar antes de que
 * useNote.getDoc corra en la página destino.
 */
async function createNote(overrides?: NoteCreateOverrides): Promise<string | null> {
  const now = Date.now();
  const defaults: NoteRow = {
    title: overrides?.title ?? '',
    contentPlain: overrides?.contentPlain ?? '',
    paraType: overrides?.paraType ?? 'resource',
    noteType: overrides?.noteType ?? 'fleeting',
    source: overrides?.source ?? '',
    projectIds: '[]',
    areaIds: '[]',
    tagIds: '[]',
    outgoingLinkIds: '[]',
    incomingLinkIds: '[]',
    linkCount: 0,
    summaryL1: '',
    summaryL2: '',
    summaryL3: '',
    distillLevel: 0,
    aiTags: '[]',
    aiSummary: '',
    aiProcessed: false,
    createdAt: now,
    updatedAt: now,
    lastViewedAt: 0,
    viewCount: 0,
    isFavorite: false,
    isArchived: false,
    fsrsState: '',
    fsrsDue: 0,
    fsrsLastReview: 0,
  };

  try {
    return await repo.create(defaults);
  } catch (error) {
    console.error('[notesRepo] createNote failed', error);
    return null;
  }
}

/**
 * Actualiza metadata de una nota (title, flags, fsrs, tags, etc.).
 * NO persiste `content` — para eso usar saveContent().
 */
async function updateMeta(id: string, partial: Partial<NoteRow>): Promise<void> {
  try {
    await repo.update(id, partial);
  } catch (error) {
    console.error('[notesRepo] updateMeta failed', error);
  }
}

export interface SaveContentPayload {
  content: string; // TipTap JSON serializado — solo a Firestore
  contentPlain: string;
  title: string;
  updatedAt: number;
  summaryL3: string;
  distillLevel: number;
  linkCount: number;
  outgoingLinkIds: string[]; // array JS; serializado internamente
}

/**
 * Persiste content + metadata post-save del editor.
 *
 * Particularidad: `content` (TipTap JSON) vive solo en Firestore, NO en
 * TinyBase (gotcha universal). Este método:
 * 1. setPartialRow sync a TinyBase con todos los campos EXCEPTO content.
 * 2. await updateDoc a Firestore con TODOS los campos incluyendo content.
 *
 * El persister auto-sync eventualmente convergería los campos del step 1,
 * pero el updateDoc explícito es un solo write atómico con content incluido
 * y provee awaitability.
 *
 * IMPORTANTE: `outgoingLinkIds` debe pasarse como array. Serialización
 * internamente con `stringifyIds` (no idempotente — no pasar pre-serialized).
 */
async function saveContent(id: string, payload: SaveContentPayload): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('[notesRepo] saveContent: no auth.currentUser.uid');
  }

  const outgoingLinkIdsStr = stringifyIds(payload.outgoingLinkIds);

  // Sync TinyBase (sin content) ANTES del updateDoc async.
  notesStore.setPartialRow('notes', id, {
    title: payload.title,
    contentPlain: payload.contentPlain,
    updatedAt: payload.updatedAt,
    linkCount: payload.linkCount,
    outgoingLinkIds: outgoingLinkIdsStr,
    summaryL3: payload.summaryL3,
    distillLevel: payload.distillLevel,
  });

  await updateDoc(doc(db, `users/${uid}/notes/${id}`), {
    content: payload.content,
    contentPlain: payload.contentPlain,
    title: payload.title,
    updatedAt: payload.updatedAt,
    summaryL3: payload.summaryL3,
    distillLevel: payload.distillLevel,
  });
}

/**
 * Crea una nota desde un inbox item con contenido pre-populado.
 *
 * Particularidades de este flow (a diferencia de createNote regular):
 * - Construye un docJson TipTap desde rawContent (paragraphs por línea).
 * - Persiste `content` (JSON serializado) en Firestore via el factory; TinyBase
 *   lo ignora porque no está en schema (consistente con el content-split).
 * - Setea `aiProcessed: true` si hay tags del inbox — sin esto, `autoTagNote`
 *   CF sobrescribiría los tags aceptados del usuario (gotcha de ESTADO-ACTUAL).
 * - `tagIds` se pasa ya-serializado como string JSON (no array).
 */
async function createFromInbox(
  rawContent: string,
  overrides: { title: string; tagIds: string[] },
): Promise<string | null> {
  const now = Date.now();
  const docJson = {
    type: 'doc',
    content: rawContent
      .split('\n')
      .map((line) =>
        line.trim()
          ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
          : { type: 'paragraph' },
      ),
  };

  const row = {
    title: overrides.title,
    contentPlain: rawContent,
    paraType: 'resource',
    noteType: 'fleeting',
    source: 'inbox',
    projectIds: '[]',
    areaIds: '[]',
    tagIds: stringifyIds(overrides.tagIds),
    outgoingLinkIds: '[]',
    incomingLinkIds: '[]',
    linkCount: 0,
    summaryL1: '',
    summaryL2: '',
    summaryL3: '',
    distillLevel: 0,
    aiTags: '[]',
    aiSummary: '',
    aiProcessed: overrides.tagIds.length > 0,
    createdAt: now,
    updatedAt: now,
    lastViewedAt: 0,
    viewCount: 0,
    isFavorite: false,
    isArchived: false,
    fsrsState: '',
    fsrsDue: 0,
    fsrsLastReview: 0,
    // content va a Firestore via el factory; TinyBase lo ignora por schema.
    content: JSON.stringify(docJson),
  } as NoteRow & { content: string };

  try {
    return await repo.create(row);
  } catch (error) {
    console.error('[notesRepo] createFromInbox failed', error);
    return null;
  }
}

export const notesRepo = { createNote, createFromInbox, updateMeta, saveContent };
