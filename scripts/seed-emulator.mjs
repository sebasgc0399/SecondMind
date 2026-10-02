// SPEC-69 T5 — seed del emulador para `npm run dev:emu`.
//
// Deja los emuladores de Auth y Firestore con un usuario y datos realistas para explorar la app
// en http://localhost:5180 (modo emulador, T4). SOLO emulador: se niega a correr si faltan las
// variables de host que setea el runner de emuladores de firebase-tools o si el proyecto no es
// `demo-*` (I3).
//
// Credenciales de prueba (NO son secretos: existen solo dentro del emulador, que se borra al
// apagarlo):
//   email:    e2e@secondmind.test
//   password: secondmind-e2e
//
// Idempotente: borra todo el Firestore y todas las cuentas del emulador antes de sembrar.
// Uso directo (con emuladores corriendo): `npm run seed:emu`, o dentro del runner de emuladores.
//
// Escritura: `@firebase/rules-unit-testing` con `withSecurityRulesDisabled` (mismo enfoque que
// e2e/helpers/firestore.ts); Auth por REST (mismo enfoque que e2e/helpers/users.ts).
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

// Versión del esquema de preferencias, leída de la fuente (src/lib/preferences.ts) para no driftear.
export function readPreferencesSchemaVersion() {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'preferences.ts'),
    'utf8',
  );
  const m = src.match(/export const PREFERENCES_SCHEMA_VERSION\s*=\s*(\d+)/);
  if (!m) throw new Error('[seed] no se pudo leer PREFERENCES_SCHEMA_VERSION de preferences.ts');
  return Number(m[1]);
}

export const SEED_EMAIL = 'e2e@secondmind.test';
export const SEED_PASSWORD = 'secondmind-e2e';
const DAY = 86_400_000;

// --- Guardas (I3): solo emulador, solo proyecto demo-* -------------------------------------
export function resolveEmulatorTarget(env = process.env, argv = process.argv) {
  const firestoreHost = env.FIRESTORE_EMULATOR_HOST;
  const authHost = env.FIREBASE_AUTH_EMULATOR_HOST;
  const projectId = argv[2] || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || '';
  const problems = [];
  if (!firestoreHost) problems.push('falta FIRESTORE_EMULATOR_HOST');
  if (!authHost) problems.push('falta FIREBASE_AUTH_EMULATOR_HOST');
  if (!projectId.startsWith('demo-')) {
    problems.push(`el proyecto "${projectId || '(vacío)'}" no empieza con "demo-"`);
  }
  if (problems.length > 0) {
    throw new Error(
      `[seed] se niega a correr: ${problems.join('; ')}. Corré dentro del runner de emuladores ` +
        'con --project demo-secondmind (o `npm run dev:emu`).',
    );
  }
  const [fsHost, fsPort] = firestoreHost.split(':');
  return { projectId, firestoreHost: fsHost, firestorePort: Number(fsPort), authHost };
}

// --- Contenido ------------------------------------------------------------------------------
const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const appVersion = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')).version;

// Bloque TipTap: partes = string | { link: noteId }.
function buildBlock(type, parts, titleOf, attrs) {
  const content = [];
  let plain = '';
  for (const p of parts) {
    if (typeof p === 'string') {
      content.push({ type: 'text', text: p });
      plain += p;
    } else {
      // El nodo wikilink real no tiene renderText: editor.getText() no incluye su título.
      content.push({ type: 'wikilink', attrs: { noteId: p.link, noteTitle: titleOf(p.link) } });
    }
  }
  return { node: { type, ...(attrs ? { attrs } : {}), content }, plain };
}

// Texto del párrafo CON los títulos de los wikilinks (contexto del link, a diferencia de contentPlain).
function contextOf(parts, titleOf) {
  return parts.map((p) => (typeof p === 'string' ? p : titleOf(p.link))).join('');
}

const NOTES = [
  {
    id: 'nota-zettelkasten',
    title: 'Zettelkasten',
    paraType: 'resource',
    noteType: 'permanent',
    fav: true,
    tags: ['zettelkasten', 'pkm'],
    ageDays: 20,
    body: [
      [
        'Un Zettelkasten es una caja de notas conectadas entre sí. Cada idea vive en una ',
        { link: 'nota-notas-atomicas' },
        ' y se enlaza con otras en lugar de archivarse por carpetas.',
      ],
      [
        'Niklas Luhmann lo usó durante décadas para escribir más de 70 libros. La idea central es pensar con las notas, no solo guardarlas.',
      ],
      ['Para una visión más amplia del ecosistema, ver ', { link: 'nota-segundo-cerebro' }, '.'],
    ],
  },
  {
    id: 'nota-notas-atomicas',
    title: 'Notas atómicas',
    paraType: 'resource',
    noteType: 'permanent',
    tags: ['zettelkasten'],
    ageDays: 18,
    body: [
      [
        'Una nota atómica contiene una sola idea, escrita con tus propias palabras y con título descriptivo. Eso la hace reutilizable en contextos distintos.',
      ],
      [
        'Es la unidad básica del ',
        { link: 'nota-zettelkasten' },
        ': si una nota mezcla dos ideas, se parte en dos.',
      ],
    ],
  },
  {
    id: 'nota-para',
    title: 'Método PARA',
    paraType: 'area',
    noteType: 'permanent',
    tags: ['organización', 'pkm'],
    ageDays: 15,
    body: [
      [
        'PARA organiza la información por accionabilidad: Proyectos, Áreas, Recursos y Archivo. Un proyecto tiene meta y fecha; un área es una responsabilidad continua.',
      ],
      [
        'Lo propone Tiago Forte dentro de ',
        { link: 'nota-segundo-cerebro' },
        ' y es el paso "organizar" de ',
        { link: 'nota-code' },
        '.',
      ],
    ],
  },
  {
    id: 'nota-progressive-summarization',
    title: 'Progressive Summarization',
    paraType: 'resource',
    noteType: 'literature',
    tags: ['resumen', 'destilar'],
    ageDays: 12,
    body: [
      [
        'Resumir en capas: guardar el texto, resaltar en negrita lo importante, resaltar de nuevo lo esencial y escribir un resumen propio arriba de todo.',
      ],
      [
        'Cada pasada es opcional y solo se hace cuando la nota vuelve a ser útil. Es el paso "destilar" de ',
        { link: 'nota-code' },
        ' y aparece en ',
        { link: 'nota-segundo-cerebro' },
        '.',
      ],
    ],
  },
  {
    id: 'nota-segundo-cerebro',
    title: 'Construir un Segundo Cerebro',
    paraType: 'resource',
    noteType: 'literature',
    source: 'Tiago Forte, Building a Second Brain (2022)',
    tags: ['libro', 'pkm'],
    ageDays: 25,
    body: [
      [
        'Libro de Tiago Forte sobre cómo externalizar la memoria y el pensamiento en un sistema digital confiable, para liberar la mente de recordar y dejarla crear.',
      ],
      [
        'El método se apoya en ',
        { link: 'nota-code' },
        ' como flujo de trabajo y en ',
        { link: 'nota-para' },
        ' como estructura de carpetas.',
      ],
      [
        'Conceptos que lo rodean: ',
        { link: 'nota-zettelkasten' },
        ' y ',
        { link: 'nota-progressive-summarization' },
        '. Esta nota funciona como hub del sistema (4 enlaces salientes).',
      ],
    ],
  },
  {
    id: 'nota-code',
    title: 'Capturar, organizar, destilar, expresar',
    paraType: 'area',
    noteType: 'permanent',
    tags: ['flujo', 'pkm'],
    ageDays: 10,
    body: [
      [
        'El flujo CODE tiene cuatro pasos: Capture, Organize, Distill y Express. Capturar solo lo que resuena, organizar por accionabilidad, destilar lo esencial y expresar creando algo.',
      ],
      ['Organizar se hace con ', { link: 'nota-para' }, '.'],
    ],
  },
  {
    id: 'nota-repeticion-espaciada',
    title: 'Repetición espaciada',
    paraType: 'resource',
    noteType: 'fleeting',
    tags: ['memoria'],
    ageDays: 5,
    body: [
      [
        'Repasar una idea justo antes de olvidarla fortalece el recuerdo. Los intervalos crecen cada vez que el repaso sale bien.',
      ],
      [
        'Idea pendiente: aplicarlo a las ',
        { link: 'nota-notas-atomicas' },
        ' más importantes, combinado con ',
        { link: 'nota-progressive-summarization' },
        '.',
      ],
    ],
  },
  {
    id: 'nota-revision-semanal',
    title: 'Revisión semanal del sistema',
    paraType: 'project',
    noteType: 'fleeting',
    tags: ['hábito'],
    ageDays: 2,
    body: [
      [
        'Cada domingo: vaciar la bandeja de entrada, revisar proyectos activos y elegir tres tareas para la semana siguiente.',
      ],
      ['Apunte rápido, todavía sin conectar con otras notas.'],
    ],
  },
  {
    id: 'nota-papelera',
    title: 'Borrador descartado sobre herramientas',
    paraType: 'archive',
    noteType: 'fleeting',
    trashed: true,
    tags: [],
    ageDays: 30,
    body: [
      [
        'Comparativa a medias entre apps de notas. Se descartó: el sistema importa más que la herramienta.',
      ],
    ],
  },
];

function buildNotesAndLinks(now) {
  const titleOf = (id) => NOTES.find((n) => n.id === id)?.title ?? id;
  const links = [];
  const out = new Map(NOTES.map((n) => [n.id, []]));
  const inc = new Map(NOTES.map((n) => [n.id, []]));
  const docs = NOTES.map((n, i) => {
    const nodes = [];
    const plains = [];
    const head = buildBlock('heading', [n.title], titleOf, { level: 1 });
    nodes.push(head.node);
    plains.push(head.plain);
    for (const parts of n.body) {
      const b = buildBlock('paragraph', parts, titleOf);
      nodes.push(b.node);
      plains.push(b.plain);
      for (const p of parts) {
        if (typeof p === 'string' || p.link === n.id) continue;
        if (out.get(n.id).includes(p.link)) continue;
        out.get(n.id).push(p.link);
        inc.get(p.link).push(n.id);
        links.push({
          id: `${n.id}__${p.link}`,
          sourceId: n.id,
          targetId: p.link,
          sourceTitle: n.title,
          targetTitle: titleOf(p.link),
          context: contextOf(parts, titleOf).slice(0, 200),
          linkType: 'explicit',
          strength: 0,
          accepted: true,
          createdAt: now - n.ageDays * DAY,
        });
      }
    }
    const created = now - n.ageDays * DAY;
    return {
      id: n.id,
      data: {
        title: n.title.slice(0, 200),
        contentPlain: plains.join('\n\n'),
        content: JSON.stringify({ type: 'doc', content: nodes }),
        paraType: n.paraType,
        noteType: n.noteType,
        source: n.source ?? '',
        projectIds: '[]',
        areaIds: '[]',
        tagIds: '[]',
        outgoingLinkIds: '[]', // se completan abajo
        incomingLinkIds: '[]',
        linkCount: 0,
        summaryL3: '',
        distillLevel: 0,
        aiTags: JSON.stringify(n.tags),
        aiSummary: '',
        aiProcessed: true, // evita que autoTagNote reescriba la nota
        createdAt: created,
        updatedAt: created + (i % 3) * DAY,
        lastViewedAt: n.trashed ? 0 : now - (i % 4) * DAY,
        viewCount: n.trashed ? 0 : 3 + i,
        isFavorite: n.fav === true,
        isArchived: false,
        deletedAt: n.trashed ? now - 2 * DAY : 0,
        fsrsState: '',
        fsrsDue: 0,
        fsrsLastReview: 0,
      },
    };
  });
  for (const d of docs) {
    d.data.outgoingLinkIds = JSON.stringify(out.get(d.id));
    d.data.linkCount = out.get(d.id).length;
    d.data.incomingLinkIds = JSON.stringify(inc.get(d.id));
  }
  return { notes: docs, links };
}

function buildExecution(now) {
  const d = new Date(now);
  const startToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dueToday = startToday + 23 * 3_600_000 + 30 * 60_000;
  const t = (id, o) => ({
    id,
    data: {
      name: '',
      status: 'in-progress',
      priority: 'medium',
      dueDate: 0,
      projectId: '',
      areaId: '',
      objectiveId: '',
      noteIds: '[]',
      description: '',
      isArchived: false,
      createdAt: now - 7 * DAY,
      updatedAt: now - DAY,
      completedAt: 0,
      ...o,
    },
  });
  const tasks = [
    t('tarea-atomizar', {
      name: 'Reescribir 5 notas como notas atómicas',
      status: 'in-progress',
      priority: 'high',
      dueDate: startToday - DAY,
      projectId: 'proyecto-zettelkasten',
      objectiveId: 'objetivo-conocimiento',
      areaId: 'conocimiento',
      noteIds: '["nota-notas-atomicas"]',
      description: 'Partir las notas que mezclan varias ideas.',
    }),
    t('tarea-revision', {
      name: 'Hacer la revisión semanal',
      status: 'in-progress',
      priority: 'medium',
      dueDate: dueToday,
      projectId: 'proyecto-zettelkasten',
      objectiveId: 'objetivo-conocimiento',
      areaId: 'conocimiento',
      noteIds: '["nota-revision-semanal"]',
    }),
    t('tarea-para-finanzas', {
      name: 'Crear carpetas PARA para finanzas',
      status: 'waiting',
      priority: 'low',
      dueDate: startToday + 3 * DAY,
      projectId: 'proyecto-finanzas',
      objectiveId: 'objetivo-conocimiento',
      areaId: 'finanzas',
      noteIds: '["nota-para"]',
    }),
    t('tarea-leer-libro', {
      name: 'Terminar el capítulo 4 de Building a Second Brain',
      status: 'completed',
      priority: 'medium',
      dueDate: startToday - 2 * DAY,
      completedAt: now - 2 * DAY,
      areaId: 'conocimiento',
      noteIds: '["nota-segundo-cerebro"]',
    }),
    t('tarea-chequeo', {
      name: 'Sacar turno para chequeo médico',
      status: 'in-progress',
      priority: 'urgent',
      dueDate: startToday + 5 * DAY,
      projectId: 'proyecto-salud',
      objectiveId: 'objetivo-salud',
      areaId: 'salud',
    }),
    t('tarea-ideas', {
      name: 'Anotar ideas sueltas para el blog',
      status: 'inbox',
      priority: 'low',
      areaId: 'conocimiento',
    }),
  ];
  const p = (id, o) => ({
    id,
    data: {
      name: '',
      status: 'not-started',
      priority: 'medium',
      areaId: '',
      objectiveId: '',
      taskIds: '[]',
      noteIds: '[]',
      startDate: 0,
      deadline: 0,
      isArchived: false,
      createdAt: now - 20 * DAY,
      updatedAt: now - 2 * DAY,
      ...o,
    },
  });
  const projects = [
    p('proyecto-zettelkasten', {
      name: 'Armar mi sistema Zettelkasten',
      status: 'in-progress',
      priority: 'high',
      areaId: 'conocimiento',
      objectiveId: 'objetivo-conocimiento',
      taskIds: '["tarea-atomizar","tarea-revision"]',
      noteIds: '["nota-zettelkasten","nota-notas-atomicas"]',
      startDate: now - 20 * DAY,
      deadline: startToday + 30 * DAY,
    }),
    p('proyecto-finanzas', {
      name: 'Ordenar finanzas personales con PARA',
      status: 'not-started',
      priority: 'medium',
      areaId: 'finanzas',
      objectiveId: 'objetivo-conocimiento',
      taskIds: '["tarea-para-finanzas"]',
      noteIds: '["nota-para"]',
      deadline: startToday + 60 * DAY,
    }),
    p('proyecto-salud', {
      name: 'Rutina de salud del trimestre',
      status: 'in-progress',
      priority: 'medium',
      areaId: 'salud',
      objectiveId: 'objetivo-salud',
      taskIds: '["tarea-chequeo"]',
      startDate: now - 10 * DAY,
      deadline: startToday + 90 * DAY,
    }),
  ];
  const o = (id, x) => ({
    id,
    data: {
      name: '',
      status: 'in-progress',
      deadline: 0,
      areaId: '',
      projectIds: '[]',
      taskIds: '[]',
      isArchived: false,
      createdAt: now - 25 * DAY,
      updatedAt: now - 3 * DAY,
      ...x,
    },
  });
  const objectives = [
    o('objetivo-conocimiento', {
      name: 'Dominar la gestión del conocimiento personal',
      areaId: 'conocimiento',
      projectIds: '["proyecto-zettelkasten","proyecto-finanzas"]',
      taskIds: '["tarea-atomizar","tarea-revision","tarea-para-finanzas"]',
      deadline: startToday + 120 * DAY,
    }),
    o('objetivo-salud', {
      name: 'Sostener hábitos de salud todo el año',
      status: 'not-started',
      areaId: 'salud',
      projectIds: '["proyecto-salud"]',
      taskIds: '["tarea-chequeo"]',
      deadline: startToday + 250 * DAY,
    }),
  ];
  const inboxItem = (id, rawContent, createdAt) => ({
    id,
    data: {
      rawContent,
      source: 'quick-capture',
      sourceUrl: '',
      aiProcessed: false,
      aiSuggestedTitle: '',
      aiSuggestedType: '',
      aiSuggestedTags: '[]',
      aiSuggestedArea: '',
      aiSummary: '',
      aiPriority: '',
      aiConfidence: 0,
      status: 'pending',
      processedAs: '',
      createdAt,
    },
  });
  const inbox = [
    inboxItem(
      'inbox-articulo',
      'Artículo sobre "evergreen notes" para leer más tarde',
      now - 3 * 3_600_000,
    ),
    inboxItem(
      'inbox-idea',
      'Idea: conectar la repetición espaciada con las notas permanentes más viejas',
      now - 26 * 3_600_000,
    ),
  ];
  const keys = [
    'ejercicio',
    'codear',
    'leer',
    'meditar',
    'comerBien',
    'tomarAgua',
    'planificarDia',
    'madrugar',
    'gratitud',
    'ingles',
    'pareja',
    'estirar',
    'tenderCama',
    'noComerDulce',
  ];
  const habits = [];
  for (let back = 0; back < 7; back++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
    const id = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
      day.getDate(),
    ).padStart(2, '0')}`;
    // La app guarda el día a las 12:00 locales (habitsRepo.ts), no a medianoche.
    const noon = new Date(day);
    noon.setHours(12, 0, 0, 0);
    const data = { date: noon.getTime(), createdAt: day.getTime(), updatedAt: day.getTime() };
    let done = 0;
    keys.forEach((k, i) => {
      const v = (i * 3 + back * 5) % 7 < 4; // patrón determinista y variado
      data[k] = v;
      if (v) done++;
    });
    data.progress = Math.round((done / keys.length) * 100);
    habits.push({ id, data });
  }
  return { tasks, projects, objectives, inbox, habits };
}

async function resetEmulators({ projectId, firestoreHost, firestorePort, authHost }) {
  const f = await fetch(
    `http://${firestoreHost}:${firestorePort}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  if (!f.ok) throw new Error(`[seed] limpiar Firestore: ${f.status} ${f.statusText}`);
  const a = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer owner' },
  });
  if (!a.ok) throw new Error(`[seed] limpiar Auth: ${a.status} ${a.statusText}`);
}

async function createVerifiedUser({ authHost, projectId }) {
  const base = `http://${authHost}/identitytoolkit.googleapis.com/v1`;
  const signUp = await fetch(`${base}/accounts:signUp?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SEED_EMAIL, password: SEED_PASSWORD, returnSecureToken: true }),
  });
  if (!signUp.ok) throw new Error(`[seed] signUp: ${signUp.status} ${await signUp.text()}`);
  const { localId } = await signUp.json();
  const upd = await fetch(`${base}/projects/${projectId}/accounts:update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ localId, emailVerified: true }),
  });
  if (!upd.ok) throw new Error(`[seed] emailVerified: ${upd.status} ${await upd.text()}`);
  return localId;
}

export async function seed(target) {
  const now = Date.now();
  await resetEmulators(target);
  const uid = await createVerifiedUser(target);
  const { notes, links } = buildNotesAndLinks(now);
  const exec = buildExecution(now);

  const env = await initializeTestEnvironment({
    projectId: target.projectId,
    firestore: { host: target.firestoreHost, port: target.firestorePort },
  });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const put = (path, data) => setDoc(doc(db, path), data);
      await put(`allowlist/${SEED_EMAIL}`, { addedAt: now });
      await put('config/app', { signupsEnabled: true, maxUsers: 100 });
      await put(`users/${uid}/settings/preferences`, {
        _schemaVersion: readPreferencesSchemaVersion(),
        trashAutoPurgeDays: 30,
        distillIntroSeen: true,
        distillBannersSeen: { l1: true, l2: true, l3: true },
        sidebarHidden: false,
        splitPaneLayout: { left: 50, right: 50 },
        onboardingWelcomeSeen: true,
        onboardingChecklistDismissed: true,
        locale: 'es',
        lastSeenVersion: appVersion,
      });
      const col = (name, items) =>
        Promise.all(items.map((x) => put(`users/${uid}/${name}/${x.id}`, x.data ?? x)));
      await col('notes', notes);
      await col('links', links);
      await col('tasks', exec.tasks);
      await col('projects', exec.projects);
      await col('objectives', exec.objectives);
      await col('inbox', exec.inbox);
      await col('habits', exec.habits);
    });
  } finally {
    await env.cleanup();
  }

  return {
    uid,
    counts: {
      notas: notes.length,
      'notas en papelera': notes.filter((n) => n.data.deletedAt > 0).length,
      links: links.length,
      tareas: exec.tasks.length,
      proyectos: exec.projects.length,
      objetivos: exec.objectives.length,
      'inbox pendientes': exec.inbox.length,
      'días de hábitos': exec.habits.length,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const target = resolveEmulatorTarget();
    const { uid, counts } = await seed(target);
    console.log(`[seed] proyecto ${target.projectId}, uid ${uid}`);
    for (const [k, v] of Object.entries(counts)) console.log(`[seed]   ${k}: ${v}`);
    console.log('[seed] + allowlist, config/app, settings/preferences (onboarding visto)');
    console.log('[seed] Login en http://localhost:5180');
    console.log(`[seed]   email:    ${SEED_EMAIL}`);
    console.log(`[seed]   password: ${SEED_PASSWORD}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
