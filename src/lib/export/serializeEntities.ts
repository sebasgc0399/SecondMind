// Serializa las 6 entidades no-nota a Markdown legible (SPEC-67, D5) + el LEEME
// con los catálogos key->label (hace inteligibles las keys opacas). Los enums se
// resuelven con el bundle de labels (locale del cliente). Hábitos en formato
// compacto (D5: 14 booleanos x N días en tabla full sería ilegible).

import { HABITS } from '@/types/habit';
import { type ExportLabels, labelOr } from './exportLabels';
import { formatDate, joinSections, oneLine } from './exportMarkdown';
import type { TFunction } from 'i18next';
import type { ExportInboxItem, ExportObjective, ExportProject, ExportTask } from './exportTypes';
import type { ExportHabitDay } from './exportTypes';

function section(header: string, lines: string[], t: TFunction): string {
  if (lines.length === 0) return `${header}\n\n_${t('export.common.empty', '(sin elementos)')}_\n`;
  return `${header}\n\n${lines.join('\n')}\n`;
}

function archivedSuffix(isArchived: boolean, t: TFunction): string {
  return isArchived ? ` _(${t('export.common.archived', 'archivada')})_` : '';
}

export function serializeTasks(tasks: ExportTask[], labels: ExportLabels, t: TFunction): string {
  const lines = tasks.map((task) => {
    const meta = [labelOr(labels.taskStatus, task.status), labelOr(labels.priority, task.priority)];
    const due = formatDate(task.dueDate);
    if (due) meta.push(`${t('export.field.due', 'vence')} ${due}`);
    const name = task.name.trim() || t('export.common.untitled', 'Sin nombre');
    const desc = task.description.trim() ? `\n  - ${oneLine(task.description)}` : '';
    return `- **${name}** — ${meta.join(' · ')}${archivedSuffix(task.isArchived, t)}${desc}`;
  });
  return section(`# ${t('export.section.tasks', 'Tareas')}`, lines, t);
}

export function serializeProjects(
  projects: ExportProject[],
  labels: ExportLabels,
  t: TFunction,
): string {
  const lines = projects.map((p) => {
    const meta = [labelOr(labels.projectStatus, p.status), labelOr(labels.priority, p.priority)];
    const deadline = formatDate(p.deadline);
    if (deadline) meta.push(`${t('export.field.deadline', 'límite')} ${deadline}`);
    const name = p.name.trim() || t('export.common.untitled', 'Sin nombre');
    return `- **${name}** — ${meta.join(' · ')}${archivedSuffix(p.isArchived, t)}`;
  });
  return section(`# ${t('export.section.projects', 'Proyectos')}`, lines, t);
}

export function serializeObjectives(
  objectives: ExportObjective[],
  labels: ExportLabels,
  t: TFunction,
): string {
  const lines = objectives.map((o) => {
    const meta = [labelOr(labels.objectiveStatus, o.status)];
    const deadline = formatDate(o.deadline);
    if (deadline) meta.push(`${t('export.field.deadline', 'límite')} ${deadline}`);
    const name = o.name.trim() || t('export.common.untitled', 'Sin nombre');
    return `- **${name}** — ${meta.join(' · ')}${archivedSuffix(o.isArchived, t)}`;
  });
  return section(`# ${t('export.section.objectives', 'Objetivos')}`, lines, t);
}

export function serializeHabits(
  habits: ExportHabitDay[],
  labels: ExportLabels,
  t: TFunction,
): string {
  const total = HABITS.length;
  const lines = habits.map((day) => {
    const done = day.done.map((k) => labelOr(labels.habit, k));
    const list = done.length > 0 ? done.join(', ') : `_${t('export.habits.none', 'ninguno')}_`;
    return `- **${day.id}**: ${list} (${day.done.length}/${total})`;
  });
  return section(`# ${t('export.section.habits', 'Hábitos')}`, lines, t);
}

export function serializeInbox(inbox: ExportInboxItem[], t: TFunction): string {
  const lines = inbox.map((item) => {
    const content = oneLine(item.rawContent) || t('export.common.emptyContent', '(vacío)');
    const url = item.sourceUrl.trim() ? ` — ${item.sourceUrl.trim()}` : '';
    return `- ${content} _(${item.source})_${url}`;
  });
  return section(`# ${t('export.section.inbox', 'Bandeja de entrada')}`, lines, t);
}

// LEEME.md: explica la estructura del zip y anexa los catálogos key->label (D5).
function catalogBlock(title: string, record: Record<string, string>): string {
  const lines = Object.entries(record).map(([key, label]) => `- \`${key}\` → ${label}`);
  return `### ${title}\n\n${lines.join('\n')}`;
}

export function buildLeeme(labels: ExportLabels, t: TFunction): string {
  const intro = joinSections([
    `# ${t('export.readme.title', 'Exportación de SecondMind')}`,
    t(
      'export.readme.intro',
      'Esta es una copia de tu Contenido en Markdown. Las notas usan wikilinks `[[...]]` entre sí; importá la carpeta en Obsidian, Logseq u otro editor compatible.',
    ),
  ]);

  const files = joinSections([
    `## ${t('export.readme.filesTitle', 'Qué hay en este archivo')}`,
    [
      `- \`notas/\` — ${t('export.readme.filesNotes', 'una nota por archivo `.md`')}`,
      `- \`tareas.md\`, \`proyectos.md\`, \`objetivos.md\`, \`habitos.md\`, \`inbox.md\` — ${t(
        'export.readme.filesEntities',
        'el resto de tu contenido',
      )}`,
    ].join('\n'),
  ]);

  const catalogs = joinSections([
    `## ${t('export.readme.catalogsTitle', 'Catálogos de etiquetas')}`,
    t('export.readme.catalogsIntro', 'El significado de las claves internas usadas arriba:'),
    catalogBlock(t('export.readme.catAreas', 'Áreas'), labels.area),
    catalogBlock(t('export.readme.catHabits', 'Hábitos'), labels.habit),
    catalogBlock(t('export.readme.catNoteTypes', 'Tipos de nota'), labels.noteType),
    catalogBlock(t('export.readme.catParaTypes', 'Categorías'), labels.paraType),
    catalogBlock(t('export.readme.catPriorities', 'Prioridades'), labels.priority),
    catalogBlock(t('export.readme.catTaskStatus', 'Estados de tarea'), labels.taskStatus),
    catalogBlock(t('export.readme.catProjectStatus', 'Estados de proyecto'), labels.projectStatus),
    catalogBlock(
      t('export.readme.catObjectiveStatus', 'Estados de objetivo'),
      labels.objectiveStatus,
    ),
  ]);

  return `${joinSections([intro, files, catalogs])}\n`;
}
