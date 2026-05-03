export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

let mainWindowShown = false;

export async function showMainWindow(): Promise<void> {
  if (mainWindowShown) return;
  mainWindowShown = true;
  if (!isTauri()) return;
  try {
    const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
    const windows = await getAllWebviewWindows();
    const main = windows.find((w) => w.label === 'main');
    if (!main) return;
    await main.show();
    await main.unminimize();
    await main.setFocus();
  } catch {
    // El flag ya quedó marcado: evita reintentos infinitos si la API falla.
  }
}

export async function hideCurrentWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  await getCurrentWebviewWindow().hide();
}
