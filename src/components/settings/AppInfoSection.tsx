import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CHECK_UPDATES_EVENT } from '@/hooks/useAutoUpdate';
import { isTauri } from '@/lib/tauri';

export default function AppInfoSection() {
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      const { getVersion } = await import('@tauri-apps/api/app');
      const v = await getVersion();
      setVersion(v);
    })();
  }, []);

  if (!isTauri()) return null;

  async function handleCheck() {
    setChecking(true);
    const { emit } = await import('@tauri-apps/api/event');
    try {
      await emit(CHECK_UPDATES_EVENT);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section aria-labelledby="app-info-heading">
      <div className="mb-3">
        <h2 id="app-info-heading" className="text-sm font-semibold text-foreground">
          Información de la app
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Versión actual y actualizaciones.</p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">SecondMind Desktop</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Versión {version ?? '…'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCheck} disabled={checking}>
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          Buscar actualizaciones
        </Button>
      </div>
    </section>
  );
}
