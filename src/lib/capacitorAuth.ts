import { SocialLogin } from '@capgo/capacitor-social-login';
import { GoogleAuthProvider, signInWithCredential, type Auth } from 'firebase/auth';

export async function initCapacitorAuth(): Promise<void> {
  const webClientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    throw new Error('VITE_GOOGLE_WEB_CLIENT_ID no está definido en .env.local');
  }
  await SocialLogin.initialize({ google: { webClientId } });
}

export async function signInWithCapacitor(auth: Auth): Promise<void> {
  const res = await SocialLogin.login({
    provider: 'google',
    options: { scopes: ['email', 'profile'] },
  });
  if (res.provider !== 'google') {
    throw new Error(`Proveedor inesperado: ${res.provider}`);
  }
  if (!('idToken' in res.result) || !res.result.idToken) {
    throw new Error('Google Sign-In no devolvió idToken (modo offline no soportado)');
  }
  const credential = GoogleAuthProvider.credential(res.result.idToken);
  await signInWithCredential(auth, credential);
}
