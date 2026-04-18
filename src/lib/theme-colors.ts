import type { ResolvedTheme } from '@/lib/theme';
import type { ParaType } from '@/types/common';

// Reagraph/Three.js NO procesa strings oklch — solo acepta hex / rgb / nombres
// CSS. Los hex de abajo son equivalentes aproximados de los --graph-* de
// src/index.css (calculados del hue 260/155/75/285 con chroma desaturado).
// KEEP IN SYNC con src/index.css cuando se ajuste la paleta.
const GRAPH_COLORS_LIGHT: Record<ParaType | 'default', string> = {
  project: '#5776cf',
  area: '#4faa73',
  resource: '#b28e50',
  archive: '#8d8995',
  default: '#7d7a85',
};

const GRAPH_COLORS_DARK: Record<ParaType | 'default', string> = {
  project: '#7e96e0',
  area: '#77c79b',
  resource: '#d7a664',
  archive: '#a09ea9',
  default: '#8d8995',
};

const CANVAS_BACKGROUND: Record<ResolvedTheme, string> = {
  light: '#fdfcfe',
  dark: '#1d1b22',
};

const LABEL_COLOR: Record<ResolvedTheme, string> = {
  light: '#2d2a3a',
  dark: '#ecebef',
};

const EDGE_COLOR: Record<ResolvedTheme, string> = {
  light: '#cbc8d2',
  dark: '#3f3c46',
};

export function getGraphColors(resolvedTheme: ResolvedTheme) {
  return resolvedTheme === 'dark' ? GRAPH_COLORS_DARK : GRAPH_COLORS_LIGHT;
}

export function getGraphCanvasBackground(resolvedTheme: ResolvedTheme): string {
  return CANVAS_BACKGROUND[resolvedTheme];
}

export function getGraphLabelColor(resolvedTheme: ResolvedTheme): string {
  return LABEL_COLOR[resolvedTheme];
}

export function getGraphEdgeColor(resolvedTheme: ResolvedTheme): string {
  return EDGE_COLOR[resolvedTheme];
}
