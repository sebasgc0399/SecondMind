import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import useExport from '@/hooks/useExport';
import { isCapacitor } from '@/lib/capacitor';
import { isTauri } from '@/lib/tauri';

// SPEC-67 F7 — sección de export en Ajustes. Card no-destructiva (variante B:
// owns su <section id="export"> igual que DeleteAccountSection) que se ramifica
// por runtime:
//   • Web → genera el zip client-side y lo descarga.
//   • Capacitor (Android) → el botón rebota al navegador del sistema (el download
//     client-side no corre en el WebView); ver useExport/openWebExport.
//   • Tauri → oculto (diferido al fast-follow; ampliar el allowlist shell:allow-open
//     + rebuild queda para una versión futura).

export default function ExportSection() {
  const { t } = useTranslation();
  const { status, runExport } = useExport();

  if (isTauri()) return null;
  const isNative = isCapacitor();
  const working = status === 'working';

  return (
    <section id="export" aria-labelledby="export-heading" className="scroll-mt-14">
      <h2 id="export-heading" className="mb-3 text-sm font-semibold text-foreground">
        {t('settings.export.title', 'Exportar mis datos')}
      </h2>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Download className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {t(
                'settings.export.description',
                'Descargá una copia de todo tu contenido (notas, tareas, proyectos, objetivos, hábitos e inbox) en un ZIP de Markdown, listo para abrir en Obsidian, Logseq u otro editor.',
              )}
            </p>
            {isNative && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'settings.export.nativeHint',
                  'Se abrirá tu navegador para descargar el archivo.',
                )}
              </p>
            )}
            {status === 'error' && (
              <p className="mt-1 text-xs text-destructive">
                {t('settings.export.error', 'No se pudo generar la exportación. Intentá de nuevo.')}
              </p>
            )}
            {status === 'done' && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.export.done', 'Listo. Revisá tus descargas.')}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void runExport()}
          disabled={working}
          className="shrink-0 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          {working
            ? t('settings.export.working', 'Generando…')
            : t('settings.export.button', 'Exportar')}
        </button>
      </div>
    </section>
  );
}
