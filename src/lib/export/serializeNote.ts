// Serializador del content TipTap (ProseMirror JSON) → Markdown, headless, para
// el export (SPEC-67, D2/D3). Usa @tiptap/static-renderer (first-party TipTap v3),
// que deriva el mapping de los nodos/marks estándar del renderHTML de cada
// extensión. El QA empírico (F2) confirmó que el default ya emite GFM correcto para
// heading/listas/blockquote/links/hr y para los marks bold/italic/code/strike/
// highlight (== — preserva distill L1=bold, L2=highlight) y para el codeBlock con
// lenguaje. Requieren override SOLO 4 casos: el nodo `wikilink` (D3 fresh-resolve),
// el codeBlock con language=null (el default emite ```null), las task lists (el
// default cae a HTML crudo) y el escape de pipes en celdas de tabla.

import { renderToMarkdown } from '@tiptap/static-renderer/pm/markdown';
import { exportExtensions } from './exportExtensions';
import type { JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import type { WikilinkResolver } from './wikilinkResolver';

type Children = string | string[] | undefined;

// El node del callback es un ProseMirror Node (no la extensión de @tiptap/core);
// `children` es opcional en NodeProps del static-renderer.
interface NodeCtx {
  node: PMNode;
  children?: Children;
}

function asText(children: Children): string {
  if (Array.isArray(children)) return children.join('');
  return children ?? '';
}

function joinLines(children: Children): string {
  if (Array.isArray(children)) return children.join('\n');
  return children ?? '';
}

// GFM no soporta celdas multi-línea ni pipes literales sin escapar: aplanar a una
// línea y escapar `|`, o la columna se rompe.
function escapeTableCell(text: string): string {
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

// Fence de code block robusto: si el código contiene una corrida de backticks,
// usar un fence más largo. language vacío/null → fence pelado (no ```null).
function codeFence(code: string, language: string): string {
  const longestRun = (code.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  return `${fence}${language}\n${code}\n${fence}`;
}

export function serializeNoteContent(
  content: JSONContent,
  resolveWikilink: WikilinkResolver,
): string {
  return renderToMarkdown({
    content,
    extensions: exportExtensions,
    options: {
      nodeMapping: {
        // D3: wikilink → [[Título fresh-resolved]] / texto plano si dangling.
        wikilink: ({ node }: NodeCtx) =>
          resolveWikilink(
            node.attrs?.noteId as string | null | undefined,
            (node.attrs?.noteTitle as string | undefined) ?? '',
          ),

        // codeBlock: texto crudo (sin escaping markdown) + fence sin ```null. El wrap
        // `\n…\n` matchea el patrón de bloque del default para separar con línea en blanco.
        codeBlock: ({ node }: NodeCtx) =>
          `\n${codeFence(node.textContent ?? '', (node.attrs?.language as string | null) ?? '')}\n`,

        // taskList/taskItem: el default cae a HTML crudo → GFM checklist.
        taskList: ({ children }: NodeCtx) => `\n${joinLines(children)}\n`,
        taskItem: ({ node, children }: NodeCtx) => {
          const checked = node.attrs?.checked === true;
          const inner = asText(children).trim().replace(/\n/g, '\n  '); // indentar sub-tasks
          return `- [${checked ? 'x' : ' '}] ${inner}`;
        },

        // tabla: escapar pipes del contenido de cada celda (el armado de la fila
        // y la separadora |---| los hace el default correctamente).
        tableHeader: ({ children }: NodeCtx) => escapeTableCell(asText(children)),
        tableCell: ({ children }: NodeCtx) => escapeTableCell(asText(children)),
      },
    },
  });
}
