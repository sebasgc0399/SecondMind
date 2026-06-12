import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import usePreferences from '@/hooks/usePreferences';
import type { Locale } from '@/lib/i18n';
import { setPreferences } from '@/lib/preferences';

interface Option {
  value: Locale;
  label: string;
  description: string;
}

export default function LanguageSelector() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { preferences } = usePreferences();
  // Antes del primer write eager (locale aún null en el doc) el selector ya
  // marca el idioma detectado, que es el que i18n está usando.
  const current: Locale = preferences.locale ?? (i18n.language as Locale);

  // Keys LITERALES dentro del componente (visibles para extract + tipadas).
  // Labels y descriptions son ENDÓNIMOS (cada idioma se muestra en sí mismo,
  // idéntica literal en ambos catálogos): quien no entiende el idioma actual
  // tiene que poder encontrar el suyo. Solo el badge "activo" se traduce.
  const OPTIONS: readonly Option[] = [
    {
      value: 'es',
      label: t('settings.language.es.label', 'Español'),
      description: t('settings.language.es.description', 'La interfaz en español.'),
    },
    {
      value: 'en',
      label: t('settings.language.en.label', 'English'),
      description: t('settings.language.en.description', 'Interface in English.'),
    },
  ] as const;

  function handleSelect(value: Locale) {
    if (!user || value === current) return;
    // El subscribe de preferences propaga → useLocaleSync hace changeLanguage
    // + writeLocaleHint. Latency compensation de Firestore = switch inmediato.
    void setPreferences(user.uid, { locale: value });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {OPTIONS.map(({ value, label, description }) => {
        const isActive = current === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => handleSelect(value)}
            aria-pressed={isActive}
            className={`group flex min-h-[100px] flex-col gap-2 rounded-lg border p-3 text-left transition-all ${
              isActive
                ? 'border-primary bg-accent/40 ring-2 ring-primary/30'
                : 'border-border bg-card hover:border-border/80 hover:bg-accent/40'
            }`}
          >
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium text-foreground">{label}</span>
              {isActive && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-primary">
                  {t('common.activeBadge', 'activo')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </button>
        );
      })}
    </div>
  );
}
