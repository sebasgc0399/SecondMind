// Helpers de formato Markdown/YAML para el ensamblado del export (SPEC-67).

export function formatDate(ms: number): string {
  if (!ms || ms <= 0) return '';
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// Valor escalar para YAML frontmatter: bare si es seguro, quoted (JSON) si no.
export function yamlScalar(value: string): string {
  const safe = /^[\p{L}\p{N} .\-/_]+$/u.test(value) && !/^[\s-]/.test(value);
  return safe ? value : JSON.stringify(value);
}

export function yamlList(values: string[]): string {
  return `[${values.map(yamlScalar).join(', ')}]`;
}

// Aplana a una línea (para celdas de tabla / resúmenes inline).
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Une secciones no vacías con línea en blanco entre ellas.
export function joinSections(sections: Array<string | null | undefined>): string {
  return sections.filter((s): s is string => Boolean(s && s.trim())).join('\n\n');
}
