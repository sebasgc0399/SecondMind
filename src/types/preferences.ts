import type { NoteType } from '@/types/common';

export interface UserPreferences {
  // Días en papelera antes de auto-purga. 0 = Nunca eliminar
  // automáticamente; el usuario debe limpiar manualmente desde la UI.
  trashAutoPurgeDays: 0 | 7 | 15 | 30;
  // Tipo asignado a notas nuevas creadas desde el botón "+ Nueva nota".
  defaultNoteType: NoteType;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  trashAutoPurgeDays: 30,
  defaultNoteType: 'fleeting',
};
