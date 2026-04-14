export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function showMainWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
  const windows = await getAllWebviewWindows();
  const main = windows.find((w) => w.label === 'main');
  if (!main) return;
  await main.show();
  await main.unminimize();
  await main.setFocus();
}

export async function hideCurrentWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  await getCurrentWebviewWindow().hide();
}
