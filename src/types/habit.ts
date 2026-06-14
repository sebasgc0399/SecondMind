// Un doc por día en users/{uid}/habits/{YYYY-MM-DD}. Los 14 hábitos están
// hardcoded — si en el futuro se hacen custom, se refactoriza a dos stores
// (habitDefinitions + habitEntries). Las KEYS son IDs opacos persistidos (D5);
// el label se resuelve en render vía buildHabitLabels(t) (src/lib/entityLabels.ts).
export const HABITS = [
  { key: 'ejercicio', emoji: '🏋️' },
  { key: 'codear', emoji: '💻' },
  { key: 'leer', emoji: '📚' },
  { key: 'meditar', emoji: '🧘' },
  { key: 'comerBien', emoji: '🥗' },
  { key: 'tomarAgua', emoji: '💧' },
  { key: 'planificarDia', emoji: '🗓️' },
  { key: 'madrugar', emoji: '🌅' },
  { key: 'gratitud', emoji: '🙏' },
  { key: 'ingles', emoji: '🗣️' },
  { key: 'pareja', emoji: '❤️' },
  { key: 'estirar', emoji: '🤸' },
  { key: 'tenderCama', emoji: '🛏️' },
  { key: 'noComerDulce', emoji: '🚫' },
] as const;

export type HabitKey = (typeof HABITS)[number]['key'];

export interface HabitEntry {
  id: string;
  date: number;
  ejercicio: boolean;
  codear: boolean;
  leer: boolean;
  meditar: boolean;
  comerBien: boolean;
  tomarAgua: boolean;
  planificarDia: boolean;
  madrugar: boolean;
  gratitud: boolean;
  ingles: boolean;
  pareja: boolean;
  estirar: boolean;
  tenderCama: boolean;
  noComerDulce: boolean;
  progress: number;
  createdAt: number;
  updatedAt: number;
}
