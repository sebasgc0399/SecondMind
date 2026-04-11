export const AREAS = {
  proyectos: { label: 'Proyectos', emoji: '🚀' },
  conocimiento: { label: 'Conocimiento', emoji: '🧠' },
  finanzas: { label: 'Finanzas', emoji: '💵' },
  salud: { label: 'Salud y Ejercicio', emoji: '💪' },
  pareja: { label: 'Pareja', emoji: '❤️' },
  habitos: { label: 'Hábitos', emoji: '✅' },
} as const;

export type AreaKey = keyof typeof AREAS;
