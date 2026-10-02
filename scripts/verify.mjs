// Suite segura de verificación (SPEC-69 T3). Uso:
//   node scripts/verify.mjs [--quick] [--only a,b] [--fail-fast]
// Corre cada paso, guarda su salida en .verify/<paso>.log y resume al final.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_DIR = join(ROOT, '.verify');
const TAIL_LINES = 40;

const STEPS = [
  { name: 'lint', cmd: 'npm run lint' },
  { name: 'typecheck', cmd: 'npx tsc -b' },
  { name: 'typecheck:e2e', cmd: 'npm run typecheck:e2e' },
  { name: 'unit', cmd: 'npx vitest run' },
  { name: 'guard', cmd: 'npm run test:guard' },
  { name: 'agents', cmd: 'node scripts/check-agents.mjs' },
  { name: 'rules', cmd: 'npm run test:rules', slow: true, java: true },
  { name: 'functions', cmd: 'npm run test:functions', slow: true, java: true },
  { name: 'build', cmd: 'npx vite build', slow: true },
];

const args = process.argv.slice(2);
const quick = args.includes('--quick');
const failFast = args.includes('--fail-fast');
const onlyIdx = args.indexOf('--only');
const only = onlyIdx >= 0 ? (args[onlyIdx + 1] ?? '').split(',').filter(Boolean) : null;

if (only) {
  const unknown = only.filter((n) => !STEPS.some((s) => s.name === n));
  if (unknown.length > 0) {
    console.error(
      'verify: pasos desconocidos: ' +
        unknown.join(', ') +
        ' (válidos: ' +
        STEPS.map((s) => s.name).join(', ') +
        ')',
    );
    process.exit(2);
  }
}

function run(cmd, logPath) {
  return new Promise((resolve) => {
    const log = createWriteStream(logPath);
    log.write('$ ' + cmd + '\n');
    const child = spawn(cmd, {
      cwd: ROOT,
      shell: true,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('error', (err) => {
      log.end('\nerror al lanzar: ' + err.message + '\n', () => resolve(1));
    });
    child.on('close', (code) => {
      log.end('\n[exit ' + code + ']\n', () => resolve(code ?? 1));
    });
  });
}

async function hasJava() {
  const code = await run('java -version', join(LOG_DIR, 'java.log'));
  return code === 0;
}

function tail(logPath) {
  const lines = readFileSync(logPath, 'utf8').split(/\r?\n/);
  return lines.slice(-TAIL_LINES).join('\n');
}

mkdirSync(LOG_DIR, { recursive: true });

const selected = STEPS.map((s) => ({
  ...s,
  skip: only ? !only.includes(s.name) : quick && s.slow,
}));

let javaOk = null;
const results = [];
let stop = false;

for (const step of selected) {
  if (step.skip || stop) {
    results.push({ name: step.name, status: 'SKIP', secs: 0 });
    continue;
  }
  const logPath = join(LOG_DIR, step.name.replace(':', '-') + '.log');
  console.log('\n=== ' + step.name + ': ' + step.cmd + ' ===');
  const t0 = Date.now();
  if (step.java) {
    javaOk ??= await hasJava();
    if (!javaOk) {
      console.log(
        'Java no está disponible (java -version falló): este paso necesita JDK para el emulador. Instalá JDK o usá --quick.',
      );
      results.push({ name: step.name, status: 'FAIL', secs: 0, note: 'sin Java' });
      if (failFast) stop = true;
      continue;
    }
  }
  const code = await run(step.cmd, logPath);
  const secs = (Date.now() - t0) / 1000;
  const ok = code === 0;
  if (!ok) {
    console.log('--- últimas ' + TAIL_LINES + ' líneas (' + logPath + ') ---\n' + tail(logPath));
  }
  results.push({ name: step.name, status: ok ? 'PASS' : 'FAIL', secs });
  if (!ok && failFast) stop = true;
}

console.log('\n=== resumen ===');
for (const r of results) {
  console.log(
    r.name + ': ' + r.status + ' (' + r.secs.toFixed(1) + 's)' + (r.note ? ' - ' + r.note : ''),
  );
}
const failed = results.filter((r) => r.status === 'FAIL').length;
const ran = results.filter((r) => r.status !== 'SKIP').length;
if (failed > 0) {
  console.log('VERIFY: FAIL (' + failed + ' steps)');
  process.exit(1);
}
if (ran === 0) {
  console.log('VERIFY: FAIL (ningún paso ejecutado)');
  process.exit(1);
}
console.log('VERIFY: PASS');
