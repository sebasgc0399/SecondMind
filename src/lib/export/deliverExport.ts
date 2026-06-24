// Entrega del export (SPEC-67, F6). Web: descarga el zip vía Blob + <a download>.
// Nativo (Android/Capacitor): rebota a la web en el navegador del sistema (calca
// openWebDeletion de SPEC-64) — el <a download> no funciona en el WebView nativo,
// pero el Chrome Custom Tab sí trae la sesión del sistema y descarga ahí. Tauri se
// difiere (el botón queda oculto, F7). La decisión de plataforma vive en useExport.

const WEB_EXPORT_URL = 'https://app.getsecondmind.co/settings#export';

export function exportFilename(date: Date): string {
  return `secondmind-export-${date.toISOString().slice(0, 10)}.zip`;
}

export function triggerZipDownload(bytes: Uint8Array, filename: string): void {
  // Copia a un Uint8Array<ArrayBuffer> fresco: jszip devuelve Uint8Array<ArrayBufferLike>
  // que TS 5.7 no acepta como BlobPart (podría ser SharedArrayBuffer).
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revocar tras un tick: revocar sincrónicamente cancelaría la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Rebote nativo: import dinámico (la dep solo carga en la rama nativa, no entra al
// bundle web). windowName '_system' es web-only; Android lo ignora y abre Custom Tab.
export async function openWebExport(): Promise<void> {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: WEB_EXPORT_URL, windowName: '_system' });
}
