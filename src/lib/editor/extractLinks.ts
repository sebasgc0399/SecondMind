import type { JSONContent } from '@tiptap/core';

export interface ExtractedLink {
  targetId: string;
  targetTitle: string;
  context: string;
}

const MAX_CONTEXT_LENGTH = 200;
const INLINE_TYPES = new Set(['text', 'wikilink', 'hardBreak']);

export function extractLinks(doc: JSONContent): ExtractedLink[] {
  const out: ExtractedLink[] = [];
  walk(doc, null, out);
  return out;
}

function walk(node: JSONContent, parentBlock: JSONContent | null, out: ExtractedLink[]): void {
  const isBlock = Boolean(node.type) && !INLINE_TYPES.has(node.type as string);
  const currentBlock = isBlock ? node : parentBlock;

  if (node.type === 'wikilink') {
    const noteId = node.attrs?.noteId as string | null | undefined;
    if (noteId) {
      const noteTitle = (node.attrs?.noteTitle as string | undefined) ?? '';
      const context = currentBlock ? getBlockText(currentBlock).slice(0, MAX_CONTEXT_LENGTH) : '';
      out.push({ targetId: noteId, targetTitle: noteTitle, context });
    }
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) walk(child, currentBlock, out);
  }
}

function getBlockText(block: JSONContent): string {
  const parts: string[] = [];
  collectText(block, parts);
  return parts.join('').trim();
}

function collectText(node: JSONContent, parts: string[]): void {
  if (node.type === 'text' && typeof node.text === 'string') {
    parts.push(node.text);
    return;
  }
  if (node.type === 'wikilink') {
    const title = (node.attrs?.noteTitle as string | undefined) ?? '';
    parts.push(title);
    return;
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectText(child, parts);
  }
}
