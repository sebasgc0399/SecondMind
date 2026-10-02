// SPEC-69 T4 — smoke del modo emulador de la app. Pensado para correr DENTRO de
// `firebase emulators:exec --project demo-secondmind --only auth,firestore "node scripts/smoke-emu-app.mjs"`.
// Levanta `vite --mode emulator` en :5180, espera a que responda, comprueba que sirve la app
// y que el módulo de Firebase servido trae la config demo (projectId demo-*, flag activo,
// conexión a los emuladores), y cierra el dev server. Exit 0 = OK, 1 = falla.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5180;
const BASE = `http://localhost:${PORT}`;
const TIMEOUT_MS = 60_000;

const vite = spawn(
  process.execPath,
  [
    join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--mode',
    'emulator',
    '--port',
    String(PORT),
    '--strictPort',
  ],
  { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
);
let viteOutput = '';
vite.stdout.on('data', (d) => (viteOutput += d));
vite.stderr.on('data', (d) => (viteOutput += d));
let viteExited = false;
vite.on('exit', () => (viteExited = true));

const failures = [];
function check(name, ok, detail = '') {
  console.log(`[smoke-emu] ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
}

async function waitForServer() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (viteExited) return false;
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return true;
    } catch {
      // todavía no escucha
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

try {
  const up = await waitForServer();
  check('vite --mode emulator responde en :5180', up);
  if (up) {
    const html = await (await fetch(`${BASE}/`)).text();
    check('GET / sirve el index de la app', html.includes('<div id="root">'));

    const fb = await (await fetch(`${BASE}/src/lib/firebase.ts`)).text();
    const projectId = /"VITE_FIREBASE_PROJECT_ID":\s*"([^"]*)"/.exec(fb)?.[1] ?? '';
    check(
      'projectId servido es demo-*',
      projectId.startsWith('demo-'),
      projectId || '(no encontrado)',
    );
    check('flag VITE_USE_EMULATOR servido = "true"', /"VITE_USE_EMULATOR":\s*"true"/.test(fb));
    check('firebase.ts servido conecta Auth al emulador', fb.includes('connectAuthEmulator(auth'));

    const emu = await (await fetch(`${BASE}/src/lib/firebaseEmulator.ts`)).text();
    check('helper servido apunta a 127.0.0.1:9099', emu.includes('127.0.0.1:9099'));
  }
} finally {
  if (!viteExited) vite.kill();
}

if (failures.length > 0) {
  console.log(viteOutput.split('\n').slice(-30).join('\n'));
  console.log(`[smoke-emu] FAIL (${failures.length})`);
  process.exit(1);
}
console.log('[smoke-emu] PASS');
