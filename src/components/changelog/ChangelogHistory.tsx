import { useTranslation } from 'react-i18next';
import { CHANGELOG_ENTRIES } from '@/lib/changelog';

/**
 * Historial de novedades (F60): lista TODAS las entradas del catálogo, más nueva
 * primero. El registry está en orden de release (append, Paso 2.5 de
 * `release-ecosystem`) → `reverse()` = newest-first, sin `semver.compare()` (D4).
 * Renderiza el catálogo bundleado (solo versiones liberadas ≤ la del build); no
 * usa `getRunningVersion()`. Calca el patrón i18n del modal what's-new (items como
 * tupla → `returnObjects` + cast `as string[]`).
 */
export default function ChangelogHistory() {
  const { t } = useTranslation();
  const entries = [...CHANGELOG_ENTRIES].reverse();

  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => {
        const items = t(`changelog.${entry.key}.items`, { returnObjects: true }) as string[];
        return (
          <li
            key={entry.version}
            data-version={entry.version}
            className="rounded-lg border border-border bg-card p-4"
          >
            <h2 className="text-sm font-semibold text-foreground">
              {t(`changelog.${entry.key}.title`)}
            </h2>
            <ul className="mt-3 flex flex-col gap-2">
              {items.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
