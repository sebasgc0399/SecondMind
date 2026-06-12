import { useEffect } from 'react';
import useAuth from '@/hooks/useAuth';
import usePreferences from '@/hooks/usePreferences';
import i18n, { detectLocale, writeLocaleHint } from '@/lib/i18n';
import { setPreferences } from '@/lib/preferences';

// F58 F1.3 — converge el locale de la UI con preferences (Firestore).
//
// Secuencia de boot completa (anti-flash, ver plan F1):
//   1. Module-eval de @/lib/i18n (main.tsx): init SÍNCRONO con
//      hint localStorage 'sm-locale' ?? detectLocale(). La UI nace en el
//      idioma correcto sin esperar red — cero flash.
//   2. Layout monta este hook → usePreferences() (suscripción dedupeada).
//   3. Snapshot real llega (isLoaded === true — gate OBLIGATORIO: nunca
//      side-effects contra DEFAULT_PREFERENCES pre-snapshot):
//      - locale === null (nunca elegido) → write eager de la detección al
//        doc. Necesario para F3.1: las CFs leen este campo para el idioma
//        del output de AI. El eco del onSnapshot converge solo.
//      - locale !== null y ≠ i18n.language → changeLanguage (cross-device
//        o hint stale de otra cuenta en el mismo browser).
//      - siempre → writeLocaleHint (ÚNICO escritor del hint; espejo del
//        patrón writeSidebarHiddenHint de F32.4 — solo con snapshot real).
//
// Idempotente por construcción (StrictMode-safe): el doble efecto produce
// dos setDoc merge idénticos (inocuo) o dos changeLanguage al mismo valor
// (no-op para i18next). Sign-out NO limpia el hint (consistente con el hint
// de sidebar): peor caso multi-cuenta = idioma del usuario anterior durante
// ~100-300ms hasta el snapshot.
export default function useLocaleSync(): void {
  const { user } = useAuth();
  const { preferences, isLoaded } = usePreferences();
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid || !isLoaded) return;

    const stored = preferences.locale;
    if (stored === null) {
      const detected = detectLocale();
      void setPreferences(uid, { locale: detected });
      writeLocaleHint(detected);
      return;
    }

    if (stored !== i18n.language) {
      void i18n.changeLanguage(stored);
    }
    writeLocaleHint(stored);
  }, [uid, isLoaded, preferences.locale]);
}
