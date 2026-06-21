import { httpsCallable } from 'firebase/functions';
import {
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth, functions } from '@/lib/firebase';

// SPEC-64 F2 — lib cliente del borrado de cuenta.

const googleProvider = new GoogleAuthProvider();
const deleteAccountFn = httpsCallable<void, { ok: true }>(functions, 'deleteAccount');

// Reautenticación previa al borrado (D3). Ramifica por el provider del usuario actual.
// Tras reautenticar, fuerza getIdToken(true) ANTES de devolver para que el auth_time
// fresco viaje en el token al callable; sin esto el gate server-side rechaza con
// reauth-required pese a un reauth exitoso (silent failure). Encapsularlo acá (no en F3)
// hace que el contrato sea "al volver, el token está fresco" → F3 no puede olvidarlo.
//
// NOTA (F5): reauthenticateWithPopup SOLO funciona en web. En shells nativos
// (Capacitor/Tauri) el botón abre la URL web y este flujo inline NO se ejecuta; F3 debe
// asegurar que el popup nunca se dispare dentro del WebView nativo (o queda colgado).
export async function reauthenticate(password?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw { code: 'reauth-no-user' };

  // providerData[0] es suficiente en v1 (un provider por cuenta). Si se linkearan
  // Google + password, el [0] sería arbitrario — fuera de scope. Guard si viene vacío.
  const providerId = user.providerData[0]?.providerId;
  if (providerId === 'google.com') {
    await reauthenticateWithPopup(user, googleProvider);
  } else if (providerId === 'password') {
    if (!user.email) throw { code: 'reauth-no-email' };
    if (!password) throw { code: 'reauth-password-required' };
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else {
    throw { code: 'reauth-unsupported-provider' };
  }

  // D3: token nuevo con auth_time actualizado (mismo patrón que useAuth.refreshUser:150).
  await user.getIdToken(true);
}

// Wrapper del callable de borrado total e irreversible. El gate de reauth lo enforce el
// server (auth_time); el cliente debe haber llamado reauthenticate() —que dejó el token
// fresco— inmediatamente antes. Propaga el error del callable (details.code) para que
// mapCfError resuelva el copy (reauth-required / delete-account-failed / ...).
export async function deleteAccount(): Promise<void> {
  await deleteAccountFn();
}

// SPEC-64 F5 — entrada de borrado para el shell nativo Android (Capacitor). El flujo
// inline (reauth + reauthenticateWithPopup) es web-only y colgaría dentro del WebView, así
// que en Android el botón abre la danger zone WEB en un navegador real —un Chrome Custom
// Tab vía @capacitor/browser— donde el reauth de Firebase sí funciona: el Custom Tab NO es
// el WebView de la app y trae la sesión/cookies del sistema. El hash #delete-account hace
// scroll directo a la sección. `windowName` es web-only en @capacitor/browser (Android lo
// ignora y abre Custom Tab igual); se pasa '_system' por contrato, sin efecto en nativo.
// Import dinámico: la dep solo carga en la rama nativa, no entra al bundle web.
const WEB_DELETION_URL = 'https://app.getsecondmind.co/settings#delete-account';

export async function openWebDeletion(): Promise<void> {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url: WEB_DELETION_URL, windowName: '_system' });
}
