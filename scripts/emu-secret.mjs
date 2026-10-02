// SPEC-55 F3/F4 — genera src/functions/.secret.local antes de `firebase emulators:exec`.
// `defineSecret('ADMIN_EMAIL').value()` resuelve de Secret Manager (prod) o de
// `.secret.local` (emulador), NO de `process.env` → por eso el valor de test va en este
// archivo, no en una env var inline (que el runtime forkeado del emulador no vería).
// Gitignoreado (`*.local` raíz) → se regenera cada corrida: cero secret commiteado,
// reproducible local + CI. Es un email de TEST, nunca el ADMIN_EMAIL real de prod.
//
// SPEC-69 T4 — el emulador inyecta TODAS las claves de este archivo como variables de
// entorno del runtime de functions (firebase-tools `resolveSecretEnvs`), y una clave
// presente acá evita que el emulador intente leerla de Secret Manager.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'src', 'functions', '.secret.local');

// Master key BYOK dummy con el formato que exige `lib/crypto.ts` (base64 de 32 bytes
// exactos, AES-256). Constante y legible: solo cifra keys de prueba dentro del emulador.
const DUMMY_BYOK_MASTER_KEY_RAW = 'emulator-dummy-byok-master-key!!';
const dummyByokMasterKey = Buffer.from(DUMMY_BYOK_MASTER_KEY_RAW, 'utf8');
if (dummyByokMasterKey.length !== 32) {
  throw new Error(
    `[emu-secret] la master key dummy debe tener 32 bytes (${dummyByokMasterKey.length})`,
  );
}

// Destino sin servicio (puerto 9 "discard" en loopback): los SDKs de OpenAI/Anthropic leen
// OPENAI_BASE_URL / ANTHROPIC_BASE_URL del entorno cuando el código no pasa `baseURL`, así
// que las llamadas de IA fallan con conexión rechazada sin salir de la máquina.
const NO_EGRESS_BASE_URL = 'http://127.0.0.1:9';

writeFileSync(
  target,
  'ADMIN_EMAIL=admin-e2e@secondmind.test\n' +
    // SPEC-65 F1.5 — key dummy para que defineSecret('RESEND_API_KEY').value() resuelva en el
    // runtime emulado. El envío de aprobación FALLA a propósito (key inválida) y el handler lo
    // traga (best-effort): el e2e prueba que el approve no se rompe ni marca approvalEmailSentAt.
    'RESEND_API_KEY=re_dummy_emulator_key\n' +
    // SPEC-69 T4 — secretos dummy para que carguen las functions que hacen defineSecret de
    // ellos (embeddings/embedQuery y las BYOK). Ninguno es real.
    'OPENAI_API_KEY=sk-dummy-emulator-key\n' +
    `BYOK_MASTER_KEY=${dummyByokMasterKey.toString('base64')}\n` +
    `OPENAI_BASE_URL=${NO_EGRESS_BASE_URL}/v1\n` +
    `ANTHROPIC_BASE_URL=${NO_EGRESS_BASE_URL}\n` +
    // Resend (SDK 6.x) lee RESEND_BASE_URL del entorno: el envío falla por conexión
    // rechazada en vez de llegar a la API real con la key dummy.
    `RESEND_BASE_URL=${NO_EGRESS_BASE_URL}\n`,
);
console.log(`[emu-secret] wrote ${target}`);
