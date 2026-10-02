// Valida el frontmatter de los agentes: `name` y `description` presentes y `name` == nombre de archivo.
// Uso: node scripts/check-agents.mjs [dir]   (por defecto .claude/agents)
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const dir = process.argv[2] ?? '.claude/agents';
let failed = false;

for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
  const text = readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  const fields = {};
  if (match) {
    for (const line of match[1].split('\n')) {
      const m = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
      if (m) fields[m[1]] = m[2].trim();
    }
  }
  const expected = basename(file, '.md');
  const errors = [];
  if (!match) errors.push('sin frontmatter');
  if (!fields.name) errors.push('falta name');
  else if (fields.name !== expected) errors.push(`name "${fields.name}" != archivo "${expected}"`);
  if (!fields.description) errors.push('falta description');
  if (errors.length) {
    failed = true;
    console.error(`FAIL ${file}: ${errors.join('; ')}`);
  } else {
    console.log(`OK   ${file}`);
  }
}

process.exit(failed ? 1 : 0);
