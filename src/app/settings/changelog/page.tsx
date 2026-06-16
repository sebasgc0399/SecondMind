import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import ChangelogHistory from '@/components/changelog/ChangelogHistory';

/**
 * Sub-página del historial de novedades (F60). Ruta lazy `/settings/changelog`,
 * alcanzada desde el link de AppInfoSection. Mantiene Settings limpio y escala
 * con el catálogo creciente (D3).
 */
export default function ChangelogPage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <span aria-hidden>←</span>
        {t('changelog.history.back', 'Ajustes')}
      </Link>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {t('changelog.history.title', 'Historial de novedades')}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {t('changelog.history.description', 'Lo nuevo de cada versión, lo más reciente primero.')}
        </p>
      </header>
      <ChangelogHistory />
    </div>
  );
}
