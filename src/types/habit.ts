// Un doc por día en users/{uid}/habits/{YYYY-MM-DD}. Los 14 hábitos están
// hardcoded — si en el futuro se hacen custom, se refactoriza a dos stores
// (habitDefinitions + habitEntries).

export const HABITS = [
  { key: 'ejercicio', label: 'Ejercicio', emoji: '🏋️' },
  { key: 'codear', label: 'Codear', emoji: '💻' },
  { key: 'leer', label: 'Leer', emoji: '📚' },
  { key: 'meditar', label: 'Meditar', emoji: '🧘' },
  { key: 'comerBien', label: 'Comer bien', emoji: '🥗' },
  { key: 'tomarAgua', label: 'Tomar agua', emoji: '💧' },
  { key: 'planificarDia', label: 'Planificar día', emoji: '🗓️' },
  { key: 'madrugar', label: 'Madrugar', emoji: '🌅' },
  { key: 'gratitud', label: 'Gratitud', emoji: '🙏' },
  { key: 'ingles', label: 'Inglés', emoji: '🗣️' },
  { key: 'pareja', label: 'Pareja', emoji: '❤️' },
  { key: 'estirar', label: 'Estirar', emoji: '🤸' },
  { key: 'tenderCama', label: 'Tender cama', emoji: '🛏️' },
  { key: 'noComerDulce', label: 'No comer dulce', emoji: '🚫' },
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
