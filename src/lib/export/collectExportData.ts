// I/O del export (SPEC-67, F3): lee el content rico de las notas desde Firestore
// (NO está en TinyBase — gotcha universal) y la metadata de las otras 6 entidades
// desde los stores TinyBase en memoria. Delega el shaping + filtros D6 a
// shapeExportData (puro, testeado aparte).
//
// 1 sola query getDocs(notes) trae N docs con su `content` inline (el content es
// un campo del doc, no subcolección). Auth: el uid NO se pasa a getDocs; las
// security rules owner-only lo enforce server-side. getTable() es NO-reactivo
// (no useTable, que exige Provider) — el export es one-shot.

import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { tasksStore } from '@/stores/tasksStore';
import { projectsStore } from '@/stores/projectsStore';
import { objectivesStore } from '@/stores/objectivesStore';
import { habitsStore } from '@/stores/habitsStore';
import { inboxStore } from '@/stores/inboxStore';
import { shapeExportData, type RawDoc, type RawTable } from './shapeExportData';
import type { ExportData } from './exportTypes';

export async function collectExportData(uid: string): Promise<ExportData> {
  const snap = await getDocs(collection(db, 'users', uid, 'notes'));
  const notes: RawDoc[] = snap.docs.map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }));

  return shapeExportData({
    notes,
    tasks: tasksStore.getTable('tasks') as RawTable,
    projects: projectsStore.getTable('projects') as RawTable,
    objectives: objectivesStore.getTable('objectives') as RawTable,
    habits: habitsStore.getTable('habits') as RawTable,
    inbox: inboxStore.getTable('inbox') as RawTable,
  });
}
