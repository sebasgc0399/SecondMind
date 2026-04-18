import type { JSONContent } from '@tiptap/core';

export type DistillLevel = 0 | 1 | 2 | 3;

// Las marks de TipTap viven en los text nodes, no en containers
// (paragraph/heading/listItem/etc). El walk debe llegar a node.type === 'text'
// para leer node.marks; inspeccionar solo containers daria siempre 0.
export function computeDistillLevel(doc: JSONContent, summaryL3: string): DistillLevel {
  if (summaryL3.trim().length > 0) return 3;
  const flags = { hasBold: false, hasHighlight: false };
  walk(doc, flags);
  if (flags.hasHighlight) return 2;
  if (flags.hasBold) return 1;
  return 0;
}

function walk(node: JSONContent, flags: { hasBold: boolean; hasHighlight: boolean }): void {
  if (node.type === 'text' && Array.isArray(node.marks)) {
    for (const mark of node.marks) {
      if (mark.type === 'bold') flags.hasBold = true;
      else if (mark.type === 'highlight') flags.hasHighlight = true;
    }
  }
  if (flags.hasBold && flags.hasHighlight) return;
  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, flags);
  }
}
