import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useAuth from '@/hooks/useAuth';
import { isCapacitor } from '@/lib/capacitor';
import { collectExportData } from '@/lib/export/collectExportData';
import { buildExportZip } from '@/lib/export/buildExportZip';
import { exportFilename, openWebExport, triggerZipDownload } from '@/lib/export/deliverExport';

// SPEC-67 F6: orquesta el export client-side (collect → zip → descarga). En nativo
// rebota a la web (el download client-side no corre en el WebView). El serializador
// + jszip se cargan por dynamic import dentro de buildExportZip (lazy, no inflan el
// bundle principal hasta que el usuario dispara el export).

export type ExportStatus = 'idle' | 'working' | 'done' | 'error';

export default function useExport(): { status: ExportStatus; runExport: () => Promise<void> } {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [status, setStatus] = useState<ExportStatus>('idle');

  const runExport = useCallback(async () => {
    // Nativo (Android): el botón delega al navegador del sistema (Custom Tab) donde
    // el download client-side sí funciona. No genera el zip acá.
    if (isCapacitor()) {
      await openWebExport().catch(() => {
        /* Custom Tab no abrió; reintentable, sin recuperación útil en UI. */
      });
      return;
    }

    if (!user) return;
    setStatus('working');
    try {
      const data = await collectExportData(user.uid);
      const bytes = await buildExportZip(data, t);
      triggerZipDownload(bytes, exportFilename(new Date()));
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }, [user, t]);

  return { status, runExport };
}
