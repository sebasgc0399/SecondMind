// SPEC-69 T4 — smoke del modo emulador de la app. Pensado para correr DENTRO de
// `firebase emulators:exec --project demo-secondmind --only auth,firestore "node scripts/smoke-emu-app.mjs"`.
// Comprueba que :5180 esté libre (si no, falla sin arrancar nada), levanta
// `vite --mode emulator` en :5180, espera a que responda, comprueba que sirve la app y que
// el módulo de Firebase servido corre en modo emulator con la config falsa demo-secondmind
// (E0-T4-f), y cierra el dev server. Exit 0 = OK, 1 = falla.
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5180;
const BASE = `http://localhost:${PORT}`;
const TIMEOUT_MS = 60_000;

// true si algo acepta conexiones en host:port (un dev server previo, otro proceso…). Sin este
// chequeo, `--strictPort` haría salir a vite y el smoke podría hablar con el proceso ajeno.
function isPortInUse(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(false));
  });
}

for (const host of ['127.0.0.1', '::1']) {
  if (await isPortInUse(host, PORT)) {
    console.log(
      `[smoke-emu] FAIL — el puerto ${PORT} ya está en uso en ${host}. Cerrá el proceso que ` +
        'lo ocupa (otro dev:emu:app o smoke) y volvé a correr el smoke.',
    );
    process.exit(1);
  }
}

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

    const main = await fetch(`${BASE}/src/main.tsx`);
    check('GET /src/main.tsx transforma sin error', main.ok, `HTTP ${main.status}`);

    const fb = await (await fetch(`${BASE}/src/lib/firebase.ts`)).text();
    // Vite inyecta `import.meta.env` en el módulo servido: MODE y DEV son los que ve la app.
    check('módulo servido corre con MODE "emulator"', /"MODE":\s*"emulator"/.test(fb));
    check('módulo servido corre con DEV true', /"DEV":\s*true/.test(fb));
    check(
      'firebase.ts usa la config falsa en modo emulador',
      /isEmulatorMode\s*\?\s*EMULATOR_FIREBASE_CONFIG/.test(fb),
    );
    check('firebase.ts servido conecta Auth al emulador', fb.includes('connectAuthEmulator(auth'));

    const emu = await (await fetch(`${BASE}/src/lib/firebaseEmulator.ts`)).text();
    check(
      'config falsa con projectId demo-secondmind',
      /projectId:\s*["']demo-secondmind["']/.test(emu),
    );
    check('config falsa con apiKey fake-api-key', /apiKey:\s*["']fake-api-key["']/.test(emu));
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
