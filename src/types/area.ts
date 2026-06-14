// Las KEYS (proyectos/conocimiento/…) son IDs opacos persistidos en Firestore
// (D5): NO se migran. El label se resuelve en render vía buildAreaLabels(t)
// (src/lib/entityLabels.ts); acá solo vive el emoji.
export const AREAS = {
  proyectos: { emoji: '🚀' },
  conocimiento: { emoji: '🧠' },
  finanzas: { emoji: '💵' },
  salud: { emoji: '💪' },
  pareja: { emoji: '❤️' },
  habitos: { emoji: '✅' },
} as const;

export type AreaKey = keyof typeof AREAS;
