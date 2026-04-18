import type { ResolvedTheme } from '@/lib/theme';
import type { ParaType } from '@/types/common';

// KEEP IN SYNC WITH src/index.css (--graph-*).
// Reagraph recibe strings de color directamente en GraphNode.fill;
// getComputedStyle sobre CSS vars tiene timing risk en el mount.
const GRAPH_COLORS_LIGHT: Record<ParaType | 'default', string> = {
  project: 'oklch(0.58 0.14 260)',
  area: 'oklch(0.6 0.13 155)',
  resource: 'oklch(0.66 0.14 75)',
  archive: 'oklch(0.6 0.02 285)',
  default: 'oklch(0.55 0.02 285)',
};

const GRAPH_COLORS_DARK: Record<ParaType | 'default', string> = {
  project: 'oklch(0.72 0.14 260)',
  area: 'oklch(0.74 0.13 155)',
  resource: 'oklch(0.78 0.14 75)',
  archive: 'oklch(0.68 0.02 285)',
  default: 'oklch(0.6 0.02 285)',
};

export function getGraphColors(resolvedTheme: ResolvedTheme) {
  return resolvedTheme === 'dark' ? GRAPH_COLORS_DARK : GRAPH_COLORS_LIGHT;
}
