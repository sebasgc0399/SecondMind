import {
  GoogleAuthProvider,
  signInWithCredential,
  onAuthStateChanged,
  type User,
} from 'firebase/auth/web-extension';
import { auth } from './firebaseConfig.ts';

export async function signInWithChrome(): Promise<User> {
  const { token } = await chrome.identity.getAuthToken({ interactive: true });
  if (!token) throw new Error('No se obtuvo token de autenticacion.');
  const credential = GoogleAuthProvider.credential(null, token);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export function observeAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}
