// SPEC consent server-authoritative — versión + metadata canónica del aviso de
// §7.1 que sella la evidencia de consentimiento. Vive del lado FUNCTIONS (el que
// firma la evidencia y gatea el egreso). Su gemelo cliente está en
// src/types/semanticConsent.ts (SEMANTIC_NOTICE_VERSION) y un test de paridad
// (src/lib/semanticNoticeVersion.parity.test.ts) los obliga a moverse en lockstep.
//
// Por qué DUPLICADO y no importado: el paquete de functions compila aislado
// (tsconfig propio, rootDir 'src', include ['src']) y NUNCA importa del app src en
// el bundle desplegado. La paridad la garantiza el test (lo resuelve Vitest en
// test-time; el tsc de functions ignora **/*.test.ts), no un import cross-boundary.
//
// IMPORTANTE: bumpear ESTA constante (y su gemela cliente, lockstep) SOLO cuando
// el texto del aviso §7.1 cambie materialmente — es la versión que el server sella
// en la evidencia, la prueba de QUÉ aviso reconoció el usuario.

// Módulo SIN dependencias (ni firebase-admin) — seguro de cross-importar desde el
// test de paridad del app src.
export const SEMANTIC_NOTICE_VERSION = 2;

// Alcance/acción consentida — qué autoriza el reconocimiento (evidencia legal).
export const SEMANTIC_CONSENT_SCOPE = 'semantic-search-activation — egress a OpenAI';

// Mecanismo del consentimiento — cómo se obtuvo (reconocimiento afirmativo al
// primer uso, D5).
export const SEMANTIC_CONSENT_MECHANISM = 'affirmative-acknowledgment-first-use';
