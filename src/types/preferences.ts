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
  // Pref de visibilidad del sidebar en desktop. true = sidebar oculto,
  // chrome se reemplaza por TopBar minimalista. Solo aplica a desktop
  // (≥1024px); tablet/mobile ignoran este flag.
  sidebarHidden: boolean;
  // Layout del split-pane horizontal (F46) en porcentajes flex-grow.
  // Default { left: 50, right: 50 } = handle al centro. Solo aplica cuando
  // hay split activo en desktop ≥1024px. Campo aditivo F46 — NO bumpear
  // PREFERENCES_SCHEMA_VERSION (D7 del SPEC).
  splitPaneLayout: { left: number; right: number };
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  trashAutoPurgeDays: 30,
  distillIntroSeen: false,
  distillBannersSeen: { l1: false, l2: false, l3: false },
  sidebarHidden: false,
  splitPaneLayout: { left: 50, right: 50 },
};
