import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { CHECK_UPDATES_EVENT } from '@/hooks/useAutoUpdate';
import { isCapacitor } from '@/lib/capacitor';
import { isTauri } from '@/lib/tauri';
import { getRunningVersion } from '@/lib/version';

export default function AppInfoSection() {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // F59: versión vía el accessor unificado (3 frentes). Fail-safe: si la promesa
  // rechaza, `version` queda null → muestra '…' sin crash. `cancelled` evita
  // set-state tras unmount.
  useEffect(() => {
    let cancelled = false;
    void getRunningVersion()
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        /* versión desconocida → queda en null ('…') */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCheck() {
    setChecking(true);
    const { emit } = await import('@tauri-apps/api/event');
    try {
      await emit(CHECK_UPDATES_EVENT);
    } finally {
      setChecking(false);
    }
  }

  // F59: label de plataforma por frente (reemplaza el productName Tauri-específico).
  const platformLabel = isCapacitor()
    ? t('settings.appInfo.platform.android', 'Android')
    : isTauri()
    ? t('settings.appInfo.platform.desktop', 'Escritorio')
    : t('settings.appInfo.platform.web', 'Web');

  return (
    <section aria-labelledby="app-info-heading">
      <div className="mb-3">
        <h2 id="app-info-heading" className="text-sm font-semibold text-foreground">
          {t('settings.appInfo.title', 'Información de la app')}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('settings.appInfo.description', 'Versión actual y actualizaciones.')}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{platformLabel}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('settings.appInfo.version', 'Versión {{version}}', { version: version ?? '…' })}
          </p>
        </div>
        {isTauri() && (
          <Button variant="outline" size="sm" onClick={handleCheck} disabled={checking}>
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
            {t('settings.appInfo.checkUpdates', 'Buscar actualizaciones')}
          </Button>
        )}
      </div>

      <Link
        to="/settings/changelog"
        className="mt-3 inline-flex items-center gap-1 text-xs text-primary transition-colors hover:underline"
      >
        {t('settings.appInfo.changelogLink', 'Ver novedades anteriores')}
        <span aria-hidden>→</span>
      </Link>
    </section>
  );
}
