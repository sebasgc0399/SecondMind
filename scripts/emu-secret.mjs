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

writeFileSync(
  target,
  'ADMIN_EMAIL=admin-e2e@secondmind.test\n' +
    // SPEC-65 F1.5 — key dummy para que defineSecret('RESEND_API_KEY').value() resuelva en el
    // runtime emulado. El envío de aprobación FALLA a propósito (key inválida) y el handler lo
    // traga (best-effort): el e2e prueba que el approve no se rompe ni marca approvalEmailSentAt.
    'RESEND_API_KEY=re_dummy_emulator_key\n',
);
console.log(`[emu-secret] wrote ${target}`);
