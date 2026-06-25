# SPEC — Feature 68: Consentimiento server-authoritative (ack-proof no forjable)

> **Estado:** ✅ Implementado y mergeado a `main` (`--no-ff`, 2026-06-24). **NO deployado** — parte del release coordinado futuro (junto con las CFs de SPEC-66, también en main sin deployar). **Registro de implementación** (no archivado: tiene un cabo vivo, ver § Cabos).
> **Tipo:** "SPEC-chico" — hardening sobre SPEC-66. Nació de research/plan cerrados (no tuvo SPEC prescriptivo propio en el repo).
> **Por qué existe:** el gate de egreso a OpenAI de SPEC-66 derivaba el ack-proof (`acknowledgedAt`) del doc vivo `users/{uid}/settings/semanticSearch`, que es **client-writable** (catch-all `users/**`). Un cliente podía escribir `{ enabled:true, acknowledgedAt: Date.now() }` sin cruzar el modal → **forjar el consentimiento** y burlar el invariante legal de §7.1. Opción 3 mueve la prueba a un store server-only.

---

## Invariante (lo que el SPEC blinda)

> **Sin reconocimiento afirmativo REGISTRADO server-side → cero egreso de texto a OpenAI.** El gate ya no confía en NADA client-writable: el ack-proof se deriva de un doc resumen **deny-all server-only** que solo una Cloud Function mintea.

---

## Modelo de datos (Opción 3)

| Doc                                                                                   | Quién escribe                                                                                               | Quién lee                               | Rol                                                                                                              |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Vivo** `users/{uid}/settings/semanticSearch` = `{ enabled, acknowledgedAt:number }` | `enabled`: cliente (toggle on/off). `acknowledgedAt`: el callable `markSemanticConsent` (Date.now() number) | cliente (UX/D6) + gate (solo `enabled`) | Intención del usuario. `acknowledgedAt` = señal UX/D6, **forjable pero INOCUA** (el gate no la usa como prueba). |
| **Resumen** `consentLog/{uid}` (deny-all)                                             | solo `markSemanticConsent` (Admin SDK)                                                                      | solo el gate server-side                | **El ack-proof NO forjable.** El gate deriva de acá `acknowledgedAt:number`.                                     |
| **Eventos** `consentLog/{uid}/events/{autoId}` (deny-all, append-only)                | `markSemanticConsent` (reconocimiento) + trigger `onSemanticConsentChanged` (transiciones on/off)           | — (evidencia)                           | Log inmutable: activó/desactivó/reactivó + el reconocimiento. serverTimestamp canónico.                          |

`acknowledgedAt` en el doc vivo es **number (Date.now())**, NO `serverTimestamp()`: el modelo cliente es `number|null` y serverTimestamp resolvería a null en el snapshot optimista → rompería D6/banner. En el resumen + eventos sí va `serverTimestamp()` (es evidencia, nada lo type-checkea).

**Gate (`readSemanticConsent`):** lee el resumen PRIMERO → fail-closed inmediato sin tocar el doc vivo si no hay ack (ahorra el read en el caso común "sin consentimiento"). Si hay ack, lee `enabled` del doc vivo. Predicado `isSemanticConsentGranted = enabled===true && typeof acknowledgedAt==='number'` **sin cambios** — solo cambió DE DÓNDE viene `acknowledgedAt`.

---

## Sub-features (implementadas)

- **F1 — `SEMANTIC_NOTICE_VERSION` + test de paridad.** Constante de la versión del aviso §7.1, **duplicada** cliente ([`src/types/semanticConsent.ts`](../../src/types/semanticConsent.ts)) + functions ([`semanticNoticeVersion.ts`](../../src/functions/src/lib/semanticNoticeVersion.ts)) — functions compila aislado, no importa app src en build. Parity test cross-boundary ([`semanticNoticeVersion.parity.test.ts`](../../src/lib/semanticNoticeVersion.parity.test.ts)) + sentinel anti-bump. La paridad es load-bearing: si driftan, el server sella una versión y el cliente muestra otra → la evidencia mentiría.
- **F2 — Callable `markSemanticConsent`.** Server-side, molde `deleteApiKey` (Firestore-only, sin secret) + guard HttpsError de `saveApiKey`. `requireVerified` + `assertAllowlisted` + WriteBatch atómico (doc vivo + resumen + evento). Request `{ locale, appVersion? }` (evidencia). Refactorizado a `markSemanticConsentHandler` testeable + wrapper `onCall`. ([`markSemanticConsent.ts`](../../src/functions/src/settings/markSemanticConsent.ts)). Helper de evidencia compartido [`consentLog.ts`](../../src/functions/src/lib/consentLog.ts).
- **F3 — Rule deny-all `consentLog` + gate desde el resumen.** Regla `match /consentLog/{document=**} { allow read, write: if false; }` (forma rateLimits, cubre resumen + eventos). [`readSemanticConsent.ts`](../../src/functions/src/lib/readSemanticConsent.ts) deriva el ack-proof del resumen. Gate e2e de los 3 consumidores (`generateEmbedding`/`embedQuery`/`backfillEmbeddings`) siembra el ack en `consentLog/{uid}`.
- **F4 — Cliente vía callable.** `markSemanticConsentAcknowledged` pasa de `setDoc` client-side a `httpsCallable('markSemanticConsent')` con `locale` (i18n) + `appVersion` (`getRunningVersion`). **Update optimista de cache** tras resolver: el callable es un RPC (el onSnapshot del doc vivo tarda ~100-500ms vs el reflejo instantáneo del viejo setDoc local) → sin esto un toggle rápido reabriría el modal (rompería D6). ([`semanticConsent.ts`](../../src/lib/semanticConsent.ts), [`useSemanticSearchToggle.ts`](../../src/hooks/useSemanticSearchToggle.ts)).
- **F5 — Lectura cliente.** El doc resumen es deny-all → el cliente **no puede leerlo**. La lectura cliente sigue sobre el doc vivo (`acknowledgedAt` = señal UX/D6). El ack-proof server-only lo lee solo el gate. (Coherente con la decisión: doc vivo forjable pero inocuo.)
- **F+ — Trigger loggea transiciones on/off.** `onSemanticConsentChanged` (único observador server-side del toggle client-side) appendea un evento por transición `enabled` (activó/desactivó/reactivó) al log de evidencia. **Best-effort:** un fallo del log no bloquea ni dispara el retry de la purga legal. ([`deleteUserEmbeddings.ts`](../../src/functions/src/embeddings/deleteUserEmbeddings.ts)).

---

## QA (emulador — GO/NO-GO de Sebastián, verde)

- **Functions e2e:** 62/62 (los 3 `.gate.e2e.test.ts` de SPEC-66 verdes + nuevo `markSemanticConsent.e2e.test.ts` que ejerce el write path REAL: 3 docs atómicos + serverTimestamp resuelto + gate concede después).
- **Invariante validado:** forjar `enabled` en el doc vivo SIN ack-proof en `consentLog` → **denegado** (gate e2e control).
- **Rules:** 12/12 (+3 de `consentLog`: el cliente no puede leer ni **forjar** el ack-proof).
- **Unit root:** 425/425 (incluye parity test). **Lint + build (tsc+vite):** limpios.

---

## Decisiones cerradas (confirmadas por Sebastián en el checkpoint)

1. **Loggear transiciones on/off al evidence log** (más allá de los pasos literales) — el evidence field "log append-only de cambios de estado (activó/desactivó/reactivó)" lo pedía. Best-effort.
2. **Step 5 "cliente deriva el ack del resumen" es imposible** (resumen deny-all) → cliente lee el doc vivo (UX/D6), gate lee el resumen.
3. **`consentLog` sobrevive a `deleteAccount` con uid crudo** → aceptado como follow-up del GATE legal (ver Cabos).

---

## Gotchas

- **`admin.firestore.FieldValue` undefined en triggers — REINCIDENTE.** Ya era canon (post-SPEC-52, [`gotchas/cloud-functions-guards.md`](../gotchas/cloud-functions-guards.md#adminfirestorefieldvaluetimestamp-quedan-undefined-en-el-emulador-de-functions-post-spec-52)). Volvió a morder: `serverTimestamp()` con `admin.firestore.FieldValue` tiraba `TypeError` en el runtime del trigger desplegado, **oculto por `sanitizeError` + un spy en el test** (la función real nunca corría → 62/62 falso-verde). El mismo bug latente vivía en el callable y habría roto **todo el batch del ack en prod**. Fix: import modular `{ FieldValue } from 'firebase-admin/firestore'`. Lección de QA escalada al gotcha: ejercer el efecto crítico con la función REAL contra el emulador, no via spy.

---

## Cabos vivos (por qué NO se archiva este registro)

- **⚖ Derecho al olvido vs. evidencia de consentimiento.** `deleteAccount` **no** purga `consentLog/{uid}` → el registro sobrevive al borrado de cuenta con **`uid` CRUDO**. El diseño preveía "uid seudonimizado que sobrevive al borrado"; la seudonimización post-borrado **quedó pendiente**. Es parte de lo que el abogado real debe revisar en el **gate pre-monetización** (junto a §12 del ToS y consentimiento de datos sensibles Ley 1581). Anotado en la nota **ESTADO LEGAL** de [`Spec/ESTADO-ACTUAL.md`](../ESTADO-ACTUAL.md).
- **Deploy pendiente.** Las CFs nuevas (`markSemanticConsent` + las de SPEC-66) están en `main` sin deployar — salen en el release coordinado futuro.
