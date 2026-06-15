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
  // Flag one-time (F49): el welcome modal de onboarding se muestra una sola
  // vez a cuentas nuevas; tras cerrarlo queda true cross-device. También
  // actúa como proxy de "candidato de onboarding" que gatea el checklist de
  // Primeros pasos (D2). Campo aditivo — NO bumpear PREFERENCES_SCHEMA_VERSION.
  onboardingWelcomeSeen: boolean;
  // Flag one-time (F49): el usuario descartó explícitamente el checklist de
  // Primeros pasos del dashboard. Campo aditivo — NO bumpear schema.
  onboardingChecklistDismissed: boolean;
  // Idioma de la UI (F58). null = nunca elegido → aplica detección por
  // navigator.language y se persiste eager (F3.1 lo lee server-side para el
  // idioma del output de AI). Campo aditivo F58 — NO bumpear
  // PREFERENCES_SCHEMA_VERSION (desvío 1 del plan F1; gotcha precisado en
  // Spec/gotchas/tinybase-firestore.md § Schema versioning).
  locale: 'es' | 'en' | null;
  // Última versión cuyo modal "Novedades" vio el usuario (F59). null = nunca
  // visto / instalación nueva. Igualdad de string, sin semver. Campo aditivo —
  // NO bumpear PREFERENCES_SCHEMA_VERSION (mismo criterio que locale/onboarding*).
  lastSeenVersion: string | null;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  trashAutoPurgeDays: 30,
  distillIntroSeen: false,
  distillBannersSeen: { l1: false, l2: false, l3: false },
  sidebarHidden: false,
  splitPaneLayout: { left: 50, right: 50 },
  onboardingWelcomeSeen: false,
  onboardingChecklistDismissed: false,
  locale: null,
  lastSeenVersion: null,
};
