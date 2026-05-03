import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';

let hidden = false;

export async function hideSplash(): Promise<void> {
  if (hidden) return;
  hidden = true;
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SplashScreen.hide();
  } catch {
    // primera llamada igual marca hidden=true, evita reintentos infinitos
  }
}
