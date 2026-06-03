# DRAFT — Harness E2E de callables (testing infra)

> **Tipo:** brief pre-SPEC (`Spec/drafts/`). **Temporal** — se elimina al convertirse en SPEC formal.
> **Origen:** candidato anotado al cerrar **SPEC-53** (`ESTADO-ACTUAL.md` § Candidatos próximos).
> **Estado:** NO programado. Disparador de activación abajo. Esto es discovery, no un compromiso de scope.

## Problema

Las Cloud Functions del proyecto se prueban hoy en **tres capas que dejan un hueco**:

| Capa                                                                                                                           | Qué cubre                                    | Qué NO cubre                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------- |
| **Unit** (`decideApproval`, `requireAdmin`, validaciones de `submitAccessRequest`)                                             | Lógica **pura**, sin I/O                     | Que la CF real lea/escriba Firestore bien                       |
| **Rules test** (`firestore.rules.test.ts`, `@firebase/rules-unit-testing` + `vitest.rules.config.ts`, emulador solo Firestore) | Las **security rules** (allow/deny por path) | El **código** de las callables — no las invoca                  |
| **Smoke manual** (operador en `/admin` + verificación por Firebase MCP)                                                        | El recorrido real, **una vez, a mano**       | No es repetible ni automático; nadie lo re-corre en cada cambio |

**No existe** una suite automatizada que **invoque las callables reales** contra el emulador y afirme su comportamiento de punta a punta (cliente → gate de auth → I/O Firestore → respuesta). El código crítico —la transacción de capacity en `processAccessRequest`, el `requireAdmin`, la idempotencia, el borrado de `revokeAccess`, el no-oráculo + rate-limit de `submitAccessRequest`— solo está cubierto por piezas unit sueltas + un smoke manual de una vez.

**Causa-raíz del candidato:** el registro de SPEC-52 decía "E2E emulador 18/18", que SPEC-53 (y su SPEC) leyó como "hay una suite automatizada para extender". El discovery de step-2 descubrió que ese "18/18" había sido **smoke manual**, no código commiteado → desvío de planificación. ESTADO-ACTUAL ya corrigió el registro ("testing de CFs = unit + rules + smoke manual, NO hay E2E de callables"); este draft captura la feature que cerraría el hueco.

## Disparador de activación (NO antes)

Hoy, con un **solo admin** (el operador) que corre el smoke a mano en 2 minutos, el valor incremental es bajo. El harness paga cuando sube el costo de un error:

- **Antes de abrir la beta a escala (`0.5.0`):** más usuarios = más riesgo = red de seguridad automática contra regresiones.
- **O si entra un segundo dev:** no puede depender del conocimiento tácito del smoke manual; el test automatizado **documenta y protege** el comportamiento.

## Alcance propuesto (a refinar en el SPEC)

Construir el **primer** harness E2E de callables del repo:

1. **Infra de emulador:** declarar `functions` + `auth` en `firebase.json` (hoy solo `firestore` puerto 8080). Config `vitest.functions.config.ts` (espejo de `vitest.rules.config.ts`).
2. **Conexión cliente↔emulador:** `connectFunctionsEmulator` + `connectAuthEmulator` desde el SDK web, para ejercer el **gate de auth real** (tokens de verdad, no mocks).
3. **Usuarios de prueba:** admin (`email == ADMIN_EMAIL`), no-admin (allowlisted/verificado), y sin-sesión (anónimo). Creados contra el Auth emulator.
4. **Casos por callable** (afirmaciones reales, no la lógica pura ya cubierta):
   - `processAccessRequest`: approve bajo/sobre límite (`resource-exhausted`), idempotencia (re-aprobar miembro no consume slot), gating admin/no-admin/sin-sesión.
   - `revokeAccess`: borra `allowlist/{email}`, idempotente, gating.
   - `listAllowlistMembers`: devuelve DTOs, gating.
   - `submitAccessRequest`: no-oráculo (respuesta uniforme), dedup, rate-limit por IP.
   - `checkMyAccess`: lee el token, no enumera terceros.
   - (Después) `saveApiKey`/`deleteApiKey`: validación + cifrado + WriteBatch.
5. **CI:** integrar al gate (hoy `npm test` + `npm run test:rules`) como `npm run test:functions` o similar.

## Decisiones técnicas a resolver en el SPEC (lo que conviene no re-descubrir)

- **Inyección del secret `ADMIN_EMAIL`:** `firebase emulators:exec` **no** inyecta secrets de Secret Manager. Opciones a evaluar: (a) env var inline al comando; (b) archivo `.secret.local` / `.env` que el emulador de functions lea para resolver `defineSecret('ADMIN_EMAIL').value()`. Verificar cómo resuelve `defineSecret` en el runtime del emulador. **Sin esto, `requireAdmin` no tiene contra qué comparar.**
- **Cómo invocar las callables:** (a) **client SDK** (`httpsCallable` + Auth emulator, tokens reales) — más realista, prueba el gate de verdad; (b) `firebase-functions-test` (mockea el `CallableRequest`) — más rápido, menos fiel. Recomendación tentativa: **(a)** para que el E2E valide el gating real; eso es justamente lo que el unit de `requireAdmin` no puede.
- **Estado entre tests:** limpiar Firestore entre casos (`clearFirestore` del emulador, como ya hace `firestore.rules.test.ts` en `beforeEach`) + seed con Admin SDK / `withSecurityRulesDisabled`.
- **Imports modulares (gotcha conocido):** las CFs de access ya usan `firebase-admin/firestore` modular (emulator-safe). **`saveApiKey.ts` quedó con el patrón viejo** (`admin.firestore.FieldValue.*`, que es `undefined` en el emulador) → si el harness cubre `saveApiKey`, **migrarla primero** (ver gotcha "`admin.firestore.FieldValue`/`Timestamp` undefined en el emulador").
- **`maxInstances` / `defineSecret` en el emulador:** confirmar que las opciones de las callables (secrets, `maxInstances`) no rompen el boot del emulador.
- **Cobertura inicial vs total:** arrancar por las callables de **access** (las más nuevas y críticas — capacity, gating, no-oráculo) y dejar BYOK (`saveApiKey`/`deleteApiKey`) para una segunda tanda.

## Qué NO entra (scope guards)

- NO reemplaza el smoke manual de prod (sigue siendo el último check pre-release).
- NO toca el comportamiento de las CFs — es **solo testing infra** (salvo migrar `saveApiKey` a imports modulares si se la cubre).
- NO cubre los triggers Firestore (`autoTagNote`, `generateEmbedding`, etc.) en esta tanda — el foco es **callables** (las que el cliente invoca y tienen gates de auth). Los triggers son otra historia (LLM mocking, etc.).

## Al promover a SPEC formal

El SPEC convertiría el "alcance propuesto" en F1–Fn con criterio de done verificable (ej. "F1: `npm run test:functions` levanta functions+auth+firestore y corre verde"; "F2: un no-admin recibe `permission-denied` de `revokeAccess`"). Mover este draft a `Spec/features/SPEC-feature-N-harness-e2e-callables.md` y **borrar este archivo** (convención de drafts).
