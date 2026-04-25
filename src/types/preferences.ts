export interface UserPreferences {
  // Días en papelera antes de auto-purga. 0 = Nunca eliminar
  // automáticamente; el usuario debe limpiar manualmente desde la UI.
  trashAutoPurgeDays: 0 | 7 | 15 | 30;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  trashAutoPurgeDays: 30,
};
