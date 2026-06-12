import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en/translation.json';
import es from '@/locales/es/translation.json';

export type Locale = 'es' | 'en';

// Hint uid-less (como 'sm-theme'): se lee PRE-auth en el boot para que la UI
// nazca en el idioma correcto sin esperar el snapshot de preferences (patrón
// anti-flash F32.4). Único escritor: useLocaleSync, solo con snapshot real.
const LOCALE_HINT_KEY = 'sm-locale';

export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en';
}

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'es';
  return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function readLocaleHint(): Locale | null {
  try {
    const raw = localStorage.getItem(LOCALE_HINT_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    // localStorage puede no estar disponible (webviews restringidas, privacidad)
    return null;
  }
}

export function writeLocaleHint(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_HINT_KEY, locale);
  } catch {
    // best-effort: sin hint, el próximo boot cae a detectLocale()
  }
}

// Node/tests sin window → 'es' determinístico (jsdom expone navigator.language
// 'en-US' y Node ≥21 lo deriva del ICU del sistema → no determinístico).
const initialLng: Locale =
  typeof window === 'undefined' ? 'es' : readLocaleHint() ?? detectLocale();

// Guard HMR: la re-evaluación del módulo en dev no debe re-inicializar.
if (!i18n.isInitialized) {
  // initAsync: false → init SÍNCRONO (resources ya en memoria; en i18next ≥24
  // reemplaza a initImmediate). Sin esto i18next difiere el init vía setTimeout
  // y el primer render pinta keys crudas.
  void i18n.use(initReactI18next).init({
    resources: {
      es: { translation: es },
      en: { translation: en },
    },
    lng: initialLng,
    fallbackLng: 'es', // D8: el copy fuente es el español actual
    supportedLngs: ['es', 'en'],
    initAsync: false,
    // '' es el defaultValue del extract para el catálogo en → fallback a es,
    // nunca string vacío en pantalla (D8 / riesgo 9 del SPEC).
    returnEmptyString: false,
    interpolation: { escapeValue: false }, // React ya escapa
  });

  i18n.on('languageChanged', (lng) => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lng;
    }
  });
  if (typeof document !== 'undefined') {
    document.documentElement.lang = i18n.language;
  }
}

export default i18n;
