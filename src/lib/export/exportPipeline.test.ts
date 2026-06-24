// Test de corpus rico end-to-end (SPEC-67): raw (shape de Firestore/stores) →
// shapeExportData (filtros D6) → buildExportZip → se lee el zip y se verifica que
// cada dimensión del export salió bien. Es el "corpus" determinístico que valida
// la interacción D6 + D3 (wikilink a papelera = dangling) + serialización GFM, sin
// necesitar el emulador.

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { shapeExportData, type RawExportInput } from './shapeExportData';
import { buildExportZip } from './buildExportZip';
import type { TFunction } from 'i18next';

const t = ((key: string, def?: string) => def ?? key) as unknown as TFunction;

const activeContent = JSON.stringify({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'link vivo ' },
        { type: 'wikilink', attrs: { noteId: 'n-archived', noteTitle: 'titulo viejo' } },
        { type: 'text', text: ' y link muerto ' },
        { type: 'wikilink', attrs: { noteId: 'n-trash', noteTitle: 'Papelera vieja' } },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'importante', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' y ' },
        { type: 'text', text: 'destacado', marks: [{ type: 'highlight' }] },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
            },
            {
              type: 'tableHeader',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
            },
          ],
        },
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }],
            },
            {
              type: 'tableCell',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }],
            },
          ],
        },
      ],
    },
  ],
});

const raw: RawExportInput = {
  notes: [
    {
      id: 'n-active',
      data: {
        title: 'Nota Activa',
        content: activeContent,
        deletedAt: 0,
        isArchived: false,
        createdAt: 1,
      },
    },
    {
      id: 'n-archived',
      data: {
        title: 'Archivada',
        content: '{"type":"doc","content":[]}',
        deletedAt: 0,
        isArchived: true,
        createdAt: 2,
      },
    },
    {
      id: 'n-trash',
      data: {
        title: 'En papelera',
        content: '{"type":"doc","content":[]}',
        deletedAt: 5555,
        isArchived: false,
        createdAt: 3,
      },
    },
    {
      id: 'n-dup1',
      data: {
        title: 'Duplicada',
        content: '{"type":"doc","content":[]}',
        deletedAt: 0,
        createdAt: 4,
      },
    },
    {
      id: 'n-dup2',
      data: {
        title: 'Duplicada',
        content: '{"type":"doc","content":[]}',
        deletedAt: 0,
        createdAt: 5,
      },
    },
    {
      id: 'n-corrupt',
      data: { title: 'Rota', content: 'no es json {[', deletedAt: 0, createdAt: 6 },
    },
  ],
  tasks: {
    't-active': { name: 'Tarea viva', status: 'inbox', isArchived: false, createdAt: 1 },
    't-arch': { name: 'Tarea archivada', status: 'completed', isArchived: true, createdAt: 2 },
  },
  projects: { p1: { name: 'Proyecto', status: 'in-progress', createdAt: 1 } },
  objectives: { o1: { name: 'Objetivo', status: 'not-started', createdAt: 1 } },
  habits: { '2026-06-20': { date: 1, ejercicio: true, leer: true, progress: 2 } },
  inbox: {
    'i-pending': {
      rawContent: 'idea pendiente',
      source: 'quick-capture',
      status: 'pending',
      createdAt: 1,
    },
    'i-dismissed': {
      rawContent: 'descartada',
      source: 'quick-capture',
      status: 'dismissed',
      createdAt: 2,
    },
  },
};

describe('export pipeline — corpus rico (raw → shape → zip)', () => {
  it('filtra D6, resuelve wikilinks, serializa GFM y arma el zip', async () => {
    const data = shapeExportData(raw);
    const zip = await JSZip.loadAsync(await buildExportZip(data, t));
    const names = Object.keys(zip.files);

    // D6 notas: activa + archivada + duplicadas + corrupta DENTRO; papelera FUERA.
    expect(names).toContain('notas/Nota Activa.md');
    expect(names).toContain('notas/Archivada.md');
    expect(names).toContain('notas/Rota.md');
    expect(names).not.toContain('notas/En papelera.md');

    // Colisión de títulos → nombres únicos.
    expect(names).toContain('notas/Duplicada.md');
    expect(names).toContain('notas/Duplicada-n-dup2.md');

    const activa = await zip.file('notas/Nota Activa.md')!.async('string');
    // D3: wikilink a nota exportable → [[Título fresco]] (no el stale).
    expect(activa).toContain('link vivo [[Archivada]]');
    // D6+D3: wikilink a nota en PAPELERA → dangling, texto plano marcado.
    expect(activa).toContain('\\[\\[Papelera vieja\\]\\]');
    // Distill L1 (bold) y L2 (highlight) preservados.
    expect(activa).toContain('**importante**');
    expect(activa).toContain('==destacado==');
    // Tabla GFM.
    expect(activa).toContain('| A | B |');
    expect(activa).toContain('| --- | --- |');

    // Nota corrupta: incluida, cuerpo vacío (no rompió el batch).
    const rota = await zip.file('notas/Rota.md')!.async('string');
    expect(rota).toContain('# Rota');

    // D6 inbox: dismissed FUERA.
    const inbox = await zip.file('inbox.md')!.async('string');
    expect(inbox).toContain('idea pendiente');
    expect(inbox).not.toContain('descartada');

    // Tasks: archivada DENTRO.
    const tareas = await zip.file('tareas.md')!.async('string');
    expect(tareas).toContain('Tarea viva');
    expect(tareas).toContain('Tarea archivada');

    // Hábitos compactos.
    const habitos = await zip.file('habitos.md')!.async('string');
    expect(habitos).toContain('Ejercicio, Leer (2/14)');
  });
});
