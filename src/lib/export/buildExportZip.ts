// Empaqueta el export en un ZIP (SPEC-67, F5): notas/<basename>.md por nota +
// un archivo por las otras 6 entidades + LEEME.md con los catálogos. jszip se
// carga por dynamic import (lazy: solo entra al bundle cuando se dispara el
// export). El mismo filenameMap se usa para los nombres de archivo Y los targets
// de wikilink (resolver), garantizando que `[[X]]` apunte al archivo correcto.

import { buildExportLabels } from './exportLabels';
import { buildFilenameMap } from './filenames';
import { buildWikilinkResolver } from './wikilinkResolver';
import { serializeNoteFile } from './serializeNoteFile';
import {
  buildLeeme,
  serializeHabits,
  serializeInbox,
  serializeObjectives,
  serializeProjects,
  serializeTasks,
} from './serializeEntities';
import type { TFunction } from 'i18next';
import type { ExportData } from './exportTypes';

export async function buildExportZip(data: ExportData, t: TFunction): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');

  const labels = buildExportLabels(t);
  const filenameMap = buildFilenameMap(data.noteRefs);
  const resolveWikilink = buildWikilinkResolver(data.noteRefs);

  const zip = new JSZip();
  zip.file('LEEME.md', buildLeeme(labels, t));

  const notas = zip.folder('notas');
  for (const note of data.notes) {
    const basename = filenameMap.get(note.id) ?? note.id;
    notas?.file(`${basename}.md`, serializeNoteFile(note, resolveWikilink, labels, t));
  }

  zip.file('tareas.md', serializeTasks(data.tasks, labels, t));
  zip.file('proyectos.md', serializeProjects(data.projects, labels, t));
  zip.file('objetivos.md', serializeObjectives(data.objectives, labels, t));
  zip.file('habitos.md', serializeHabits(data.habits, labels, t));
  zip.file('inbox.md', serializeInbox(data.inbox, t));

  return zip.generateAsync({ type: 'uint8array' });
}
