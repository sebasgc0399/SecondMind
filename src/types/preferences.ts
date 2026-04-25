export interface UserPreferences {
  // Días en papelera antes de auto-purga. 0 = Nunca eliminar
  // automáticamente; el usuario debe limpiar manualmente desde la UI.
  trashAutoPurgeDays: 0 | 7 | 15 | 30;
  // Flag one-time: el popover educativo de DistillIndicator se auto-abre
  // la primera vez que el usuario abre cualquier nota. Tras dismiss queda
  // true cross-device para no repetirlo.
  distillIntroSeen: boolean;
  // Flag-map por nivel: el banner inline de transición ascendente
  // (DistillLevelBanner) aparece una sola vez por nivel por usuario.
  // Persistencia con dot-notation Firestore para evitar race de closure
  // stale al disparar dos banners contiguos.
  distillBannersSeen: { l1: boolean; l2: boolean; l3: boolean };
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  trashAutoPurgeDays: 30,
  distillIntroSeen: false,
  distillBannersSeen: { l1: false, l2: false, l3: false },
};
