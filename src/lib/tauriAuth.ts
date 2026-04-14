import { GoogleAuthProvider, signInWithCredential, type Auth } from 'firebase/auth';

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const SCOPES = 'openid email profile';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

export async function signInWithTauri(auth: Auth): Promise<void> {
  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined;
  const clientSecret = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_SECRET as string | undefined;
  if (!clientId || !clientSecret) {
    throw new Error(
      'VITE_GOOGLE_OAUTH_CLIENT_ID o VITE_GOOGLE_OAUTH_CLIENT_SECRET no están configurados',
    );
  }

  const { invoke } = await import('@tauri-apps/api/core');
  const { listen } = await import('@tauri-apps/api/event');
  const { open } = await import('@tauri-apps/plugin-shell');

  const port = await invoke<number>('start_oauth_listener');
  const redirectUri = `http://127.0.0.1:${port}`;

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();

  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'select_account',
    }).toString();

  const codePromise = new Promise<string>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      unlistenPromise.then((fn) => fn());
      reject(new Error('Timeout esperando callback OAuth'));
    }, AUTH_TIMEOUT_MS);

    const unlistenPromise = listen<string>('oauth://callback', (event) => {
      window.clearTimeout(timeoutId);
      unlistenPromise.then((fn) => fn());
      try {
        const url = new URL(event.payload);
        const receivedState = url.searchParams.get('state');
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        if (error) {
          reject(new Error(`OAuth error: ${error}`));
        } else if (receivedState !== state) {
          reject(new Error('OAuth state mismatch (posible CSRF)'));
        } else if (code) {
          resolve(code);
        } else {
          reject(new Error('OAuth callback sin code ni error'));
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });

  await open(authUrl);

  const code = await codePromise;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }).toString(),
  });

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!tokenResponse.ok || !tokens.id_token) {
    throw new Error(
      `Token exchange falló: ${tokens.error_description ?? tokens.error ?? 'sin id_token'}`,
    );
  }

  const credential = GoogleAuthProvider.credential(tokens.id_token, tokens.access_token);
  await signInWithCredential(auth, credential);
}
