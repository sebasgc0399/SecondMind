import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// Chequeo estático (SPEC-70 T3): el `Popup` de base-ui es `position: static`, su
// z-index no aplica. El z-index debe vivir en el `Positioner` (positioned) o el
// popover queda detrás de chrome con z-30 (sidebar floating). Ver 22f7f3a.

const ROOT = process.cwd();
const SCAN_DIRS = [join(ROOT, 'src', 'components'), join(ROOT, 'src', 'app')];
const UI_DIR = join(ROOT, 'src', 'components', 'ui') + sep;

function listTsx(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (full + sep === UI_DIR) continue;
      out.push(...listTsx(full));
    } else if (name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** Devuelve el texto del tag de apertura que arranca en `start` (respeta llaves). */
export function openingTag(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0 && source[i - 1] !== '=') return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** Positioners sin clase `z-` en su className: "archivo:línea". */
export function findPositionersWithoutZ(source: string, file: string): string[] {
  const problems: string[] = [];
  const re = /<[A-Za-z]+\.Positioner\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    const tag = openingTag(source, match.index);
    const classMatch = /className\s*=\s*(?:"([^"]*)"|\{[^}]*\})/.exec(tag);
    const classText = classMatch ? classMatch[0] : '';
    if (!/(^|[\s"'`{])(?:[a-z-]+:)*-?z-/.test(classText)) {
      const line = source.slice(0, match.index).split('\n').length;
      problems.push(`${file}:${line}`);
    }
  }
  return problems;
}

describe('Positioners de base-ui', () => {
  it('detecta un Positioner sin z- (control positivo del chequeo)', () => {
    const bad = `<Popover.Positioner sideOffset={8} align="end">\n<Popover.Popup className="z-50 w-72">`;
    const good = `<Popover.Positioner sideOffset={8} className="z-50">`;
    expect(findPositionersWithoutZ(bad, 'x.tsx')).toEqual(['x.tsx:1']);
    expect(findPositionersWithoutZ(good, 'x.tsx')).toEqual([]);
  });

  it('todo *.Positioner en src/components y src/app lleva clase z- en su className', () => {
    const problems: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of listTsx(dir)) {
        const rel = relative(ROOT, file).split(sep).join('/');
        problems.push(...findPositionersWithoutZ(readFileSync(file, 'utf-8'), rel));
      }
    }
    expect(
      problems,
      `Positioner sin clase z- (el z-index va en el Positioner, no en el Popup): ${problems.join(
        ', ',
      )}`,
    ).toEqual([]);
  });
});
