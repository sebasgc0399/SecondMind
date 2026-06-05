// SPEC-55 F3/F4 — genera src/functions/.secret.local antes de `firebase emulators:exec`.
// `defineSecret('ADMIN_EMAIL').value()` resuelve de Secret Manager (prod) o de
// `.secret.local` (emulador), NO de `process.env` → por eso el valor de test va en este
// archivo, no en una env var inline (que el runtime forkeado del emulador no vería).
// Gitignoreado (`*.local` raíz) → se regenera cada corrida: cero secret commiteado,
// reproducible local + CI. Es un email de TEST, nunca el ADMIN_EMAIL real de prod.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'src', 'functions', '.secret.local');

writeFileSync(target, 'ADMIN_EMAIL=admin-e2e@secondmind.test\n');
console.log(`[emu-secret] wrote ${target}`);
