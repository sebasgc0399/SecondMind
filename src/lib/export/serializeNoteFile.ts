// Ensambla el `.md` completo de UNA nota (SPEC-67): frontmatter YAML con la
// metadata (tags literales para Obsidian + tipo/categoría/fechas localizados),
// título H1, summaryL3 como blockquote al inicio (D4: patrón TL;DR), y el cuerpo
// serializado por serializeNoteContent (F1/F2).

import { serializeNoteContent } from './serializeNote';
import { type ExportLabels, labelOr } from './exportLabels';
import { formatDate, joinSections, oneLine, yamlList, yamlScalar } from './exportMarkdown';
import type { TFunction } from 'i18next';
import type { WikilinkResolver } from './wikilinkResolver';
import type { ExportNote } from './exportTypes';

export function serializeNoteFile(
  note: ExportNote,
  resolveWikilink: WikilinkResolver,
  labels: ExportLabels,
  t: TFunction,
): string {
  const frontmatter = buildFrontmatter(note, labels, t);
  const title = `# ${note.title.trim() || t('export.note.untitled', 'Sin título')}`;
  const summary = note.summaryL3.trim()
    ? `> **${t('export.note.summary', 'Resumen')}:** ${oneLine(note.summaryL3)}`
    : '';
  const body = serializeNoteContent(note.contentDoc, resolveWikilink).trim();

  return `${joinSections([frontmatter, title, summary, body])}\n`;
}

function buildFrontmatter(note: ExportNote, labels: ExportLabels, t: TFunction): string {
  const lines: string[] = ['---'];
  // 'tags' literal: clave canónica que Obsidian/Logseq indexan.
  if (note.tagIds.length > 0) lines.push(`tags: ${yamlList(note.tagIds)}`);
  lines.push(
    `${t('export.note.fmType', 'tipo')}: ${yamlScalar(labelOr(labels.noteType, note.noteType))}`,
  );
  lines.push(
    `${t('export.note.fmCategory', 'categoría')}: ${yamlScalar(
      labelOr(labels.paraType, note.paraType),
    )}`,
  );
  if (note.isArchived) lines.push(`${t('export.note.fmArchived', 'archivada')}: true`);
  const created = formatDate(note.createdAt);
  if (created) lines.push(`${t('export.note.fmCreated', 'creada')}: ${created}`);
  if (note.source.trim()) {
    lines.push(`${t('export.note.fmSource', 'fuente')}: ${yamlScalar(note.source.trim())}`);
  }
  lines.push('---');
  return lines.join('\n');
}
