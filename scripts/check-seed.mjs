// SPEC-69 T5 — chequeo de invariantes del seed. Correr DESPUÉS de seed-emulator.mjs, contra los
// mismos emuladores (mismas variables de entorno y guardas que el seed). Lee con las reglas
// deshabilitadas y verifica que los datos sean coherentes con lo que la app espera.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { pathToFileURL } from 'node:url';
import { SEED_EMAIL, resolveEmulatorTarget } from './seed-emulator.mjs';

function parseIds(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Devuelve la lista de fallas (vacía = todo bien) y un resumen de conteos.
export async function checkSeed(target) {
  const failures = [];
  const check = (ok, msg) => {
    if (!ok) failures.push(msg);
  };

  // Usuario: existe y está verificado (Auth emulator, lookup admin por email).
  const lookup = await fetch(
    `http://${target.authHost}/identitytoolkit.googleapis.com/v1/projects/${target.projectId}/accounts:lookup`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [SEED_EMAIL] }),
    },
  );
  const user = (await lookup.json()).users?.[0];
  check(Boolean(user), `no existe el usuario ${SEED_EMAIL}`);
  check(user?.emailVerified === true, `el usuario ${SEED_EMAIL} no tiene emailVerified`);
  if (!user) return { failures, summary: {} };
  const uid = user.localId;

  const env = await initializeTestEnvironment({
    projectId: target.projectId,
    firestore: { host: target.firestoreHost, port: target.firestorePort },
  });
  const summary = {};
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const list = async (name) => {
        const snap = await getDocs(collection(db, `users/${uid}/${name}`));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      };

      const allow = await getDoc(doc(db, 'allowlist', SEED_EMAIL));
      check(allow.exists(), `falta allowlist/${SEED_EMAIL}`);
      const cfg = await getDoc(doc(db, 'config', 'app'));
      check(cfg.exists() && cfg.data().signupsEnabled === true, 'config/app inválido');
      const prefs = await getDoc(doc(db, `users/${uid}/settings/preferences`));
      check(
        prefs.exists() && prefs.data()._schemaVersion === 1,
        'preferences._schemaVersion !== 1',
      );
      check(
        prefs.exists() &&
          prefs.data().onboardingWelcomeSeen === true &&
          prefs.data().lastSeenVersion,
        'preferences sin onboarding visto / lastSeenVersion',
      );

      const notes = await list('notes');
      const links = await list('links');
      const noteIds = new Set(notes.map((n) => n.id));
      const noteById = new Map(notes.map((n) => [n.id, n]));
      check(notes.length >= 8, `se esperaban >=8 notas, hay ${notes.length}`);
      check(links.length >= 6, `se esperaban >=6 links, hay ${links.length}`);
      check(notes.filter((n) => n.deletedAt > 0).length >= 1, 'no hay ninguna nota en papelera');
      check(notes.filter((n) => n.isFavorite === true).length >= 1, 'no hay nota favorita');

      // Links: extremos existentes, id canónico, sin self-link.
      const outExpected = new Map(notes.map((n) => [n.id, new Set()]));
      const inExpected = new Map(notes.map((n) => [n.id, new Set()]));
      for (const l of links) {
        check(l.id === `${l.sourceId}__${l.targetId}`, `link ${l.id}: id no canónico`);
        check(l.sourceId !== l.targetId, `link ${l.id}: self-link`);
        check(noteIds.has(l.sourceId), `link ${l.id}: source inexistente`);
        check(noteIds.has(l.targetId), `link ${l.id}: target inexistente`);
        outExpected.get(l.sourceId)?.add(l.targetId);
        inExpected.get(l.targetId)?.add(l.sourceId);
      }

      for (const n of notes) {
        const out = parseIds(n.outgoingLinkIds);
        const inc = parseIds(n.incomingLinkIds);
        check(out !== null && inc !== null, `nota ${n.id}: link ids no son JSON array`);
        if (out && inc) {
          check(
            JSON.stringify([...out].sort()) === JSON.stringify([...outExpected.get(n.id)].sort()),
            `nota ${n.id}: outgoingLinkIds no refleja los links`,
          );
          check(
            JSON.stringify([...inc].sort()) === JSON.stringify([...inExpected.get(n.id)].sort()),
            `nota ${n.id}: incomingLinkIds no refleja los links`,
          );
          check(n.linkCount === out.length, `nota ${n.id}: linkCount !== outgoing`);
        }
        check(n.aiProcessed === true, `nota ${n.id}: aiProcessed no es true`);

        // content: TipTap doc válido y wikilinks que apuntan a notas existentes.
        let docJson = null;
        try {
          docJson = JSON.parse(n.content);
        } catch {
          /* se reporta abajo */
        }
        check(
          docJson?.type === 'doc' && Array.isArray(docJson.content),
          `nota ${n.id}: content no es un doc TipTap`,
        );
        const wikilinks = [];
        const walk = (node) => {
          if (!node || typeof node !== 'object') return;
          if (node.type === 'wikilink') wikilinks.push(node.attrs?.noteId);
          if (Array.isArray(node.content)) node.content.forEach(walk);
        };
        walk(docJson);
        for (const target of wikilinks) {
          check(noteById.has(target), `nota ${n.id}: wikilink a nota inexistente "${target}"`);
        }
        // Todo wikilink del content tiene su link y viceversa (salvo self).
        check(
          JSON.stringify([...new Set(wikilinks)].sort()) ===
            JSON.stringify([...outExpected.get(n.id)].sort()),
          `nota ${n.id}: wikilinks del content no coinciden con los links`,
        );
      }

      const tasks = await list('tasks');
      const projects = await list('projects');
      const objectives = await list('objectives');
      const inbox = await list('inbox');
      const habits = await list('habits');
      const taskIds = new Set(tasks.map((t) => t.id));
      const projectIds = new Set(projects.map((p) => p.id));
      const objectiveIds = new Set(objectives.map((o) => o.id));
      for (const t of tasks) {
        check(!t.projectId || projectIds.has(t.projectId), `tarea ${t.id}: proyecto inexistente`);
        check(
          !t.objectiveId || objectiveIds.has(t.objectiveId),
          `tarea ${t.id}: objetivo inexistente`,
        );
        for (const id of parseIds(t.noteIds) ?? []) {
          check(noteIds.has(id), `tarea ${t.id}: nota inexistente ${id}`);
        }
      }
      for (const p of projects) {
        for (const id of parseIds(p.taskIds) ?? []) {
          check(taskIds.has(id), `proyecto ${p.id}: tarea inexistente ${id}`);
          check(
            tasks.find((t) => t.id === id)?.projectId === p.id,
            `proyecto ${p.id}: tarea ${id} apunta a otro proyecto`,
          );
        }
        for (const id of parseIds(p.noteIds) ?? []) {
          check(noteIds.has(id), `proyecto ${p.id}: nota inexistente ${id}`);
        }
      }
      for (const o of objectives) {
        for (const id of parseIds(o.projectIds) ?? []) {
          check(projectIds.has(id), `objetivo ${o.id}: proyecto inexistente ${id}`);
        }
      }
      check(tasks.length >= 6, `se esperaban >=6 tareas, hay ${tasks.length}`);
      check(projects.length === 3, `se esperaban 3 proyectos, hay ${projects.length}`);
      check(objectives.length === 2, `se esperaban 2 objetivos, hay ${objectives.length}`);
      check(
        inbox.filter((i) => i.status === 'pending').length === 2,
        'se esperaban 2 inbox pendientes',
      );
      check(habits.length === 7, `se esperaban 7 días de hábitos, hay ${habits.length}`);

      Object.assign(summary, {
        notas: notes.length,
        links: links.length,
        tareas: tasks.length,
        proyectos: projects.length,
        objetivos: objectives.length,
        inbox: inbox.length,
        habitos: habits.length,
      });
    });
  } finally {
    await env.cleanup();
  }
  return { failures, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { failures, summary } = await checkSeed(resolveEmulatorTarget());
    if (failures.length > 0) {
      console.error(`[check-seed] FAIL (${failures.length})`);
      for (const f of failures) console.error(`[check-seed]   - ${f}`);
      process.exitCode = 1;
    } else {
      console.log(`[check-seed] PASS ${JSON.stringify(summary)}`);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
