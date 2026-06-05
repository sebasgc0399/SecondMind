# SPEC — Feature 55: Harness E2E de callables (testing infra)

> **Estado:** ✅ **Completado y mergeado a `main`** (`feat/harness-e2e-callables` + `fix/ci-functions-deps`, merges `--no-ff`). Testing-infra, **sin bump de versión** (no toca artefactos de usuario). Generado desde `Spec/drafts/DRAFT-harness-e2e-callables.md` (draft eliminado).
> **Verificación:** `npm run test:functions` **26/26 verdes** (local Windows + **CI Linux**, run verde). `typecheck:e2e` probado **no vacuo** (un type error deliberado en `e2e/` lo rompe). `npm test` default sigue **sin** correr el harness (252 tests, sin cambio). `lint` + `tsc -b` verdes. El gate de auth real se ejerce (logs `auth: VALID`/`MISSING`). **Cero cambios al comportamiento de las CFs.** > **Hallazgo (resuelto en esta feature):** el CI venía **rojo desde SPEC-52/53** — el `npm ci` del root no instalaba las deps de `src/functions`, así que los unit de functions fallaban en CI con `ERR_MODULE_NOT_FOUND` (pasaban solo local). Arreglado con un step `working-directory: src/functions` (`fix/ci-functions-deps`).
> **Correcciones del plan incorporadas:** (1) F7 (canario) antes de F4; (2) `test:rules` en CI = D8 (PR aparte); (3) `emailVerified` fuera de F5 (ninguna callable lo lee); (4) `ADMIN_EMAIL` = `.secret.local` **generado en runtime** (D5, ver F4); (5) type-check de `e2e/` vía `tsconfig.e2e.json` dedicado (el `tsc --noEmit` de CI es no-op → D9, PR aparte).
> **Pendientes (PRs aparte):** D8 (`test:rules` en CI), D9 (`tsc --noEmit` → `tsc -b`), batch 2 (BYOK `saveApiKey`/`deleteApiKey`).
> **Tipo:** testing-infra. **NO toca el comportamiento de ninguna CF** (D4). El único artefacto de runtime que podría agregarse es un `.secret.local` de _test_ (F4) — nunca código de producción.
> **Alcance (batch 1):** las **5 callables de access** — `checkMyAccess`, `listAllowlistMembers`, `revokeAccess`, `processAccessRequest`, `submitAccessRequest`. **BYOK (`saveApiKey`/`deleteApiKey`) + su migración a imports modulares quedan FUERA → batch 2** (D2).
> **Versión:** sin bump de producto (no toca hosting/desktop/mobile ni datos de usuario). Un solo merge `--no-ff` a `main` al cerrar.
> **Depende de:** SPEC-50 F4 (patrón `firestore.rules.test.ts` + `vitest.rules.config.ts` + `@firebase/rules-unit-testing`, que se espejan acá), SPEC-51/52/53 (las callables de access que se ejercen — **no se modifican**).
> **Disparador (del draft):** se construye **antes de abrir la beta a escala (`0.5.0`)** o **si entra un 2º dev**. Hoy, con un solo admin que corre el smoke a mano, el valor incremental es bajo; este SPEC deja el harness listo para activar cuando suba el costo de un error.
> **Branch:** `feat/harness-e2e-callables` (creada desde `main` esta sesión).
> **Origen / causa-raíz:** el "E2E emulador 18/18" del registro de SPEC-52 era **smoke manual**, no código commiteado. No existe suite automatizada que invoque las callables reales contra el emulador. Este SPEC cierra ese hueco para las callables de access.

## Objetivo

Construir el **primer harness E2E de callables** del repo: una suite (`npm run test:functions`) que levanta los emuladores de **functions + auth + firestore**, invoca las 5 callables de access **reales** vía **client SDK con tokens de verdad** (`httpsCallable` + `connectFunctionsEmulator` + `connectAuthEmulator`), y afirma su comportamiento de punta a punta — **cliente → gate de auth real (`request.auth`) → I/O Firestore → respuesta**. Cubre lo que el unit no puede: que el `requireAdmin`, el capacity transaccional, la idempotencia, el no-oráculo y el rate-limit se comporten con un token real atravesando el runtime de la CF.

## Contexto / punto de partida (verificado en código esta sesión)

- **Emulador hoy:** `firebase.json` solo declara `emulators.firestore` (puerto 8080) + `singleProjectMode`. **No hay `functions` ni `auth`.**
- **Patrón a espejar (rules):** `vitest.rules.config.ts` (`environment: node`, `globals`, `include: ['firestore.rules.test.ts']`, timeouts 15s/30s) + `npm run test:rules` = `firebase emulators:exec --project=demo-secondmind --only firestore "vitest run --config vitest.rules.config.ts"`. `vite.config.ts` excluye `**/firestore.rules.test.ts` del `npm test` default. `firestore.rules.test.ts` usa `initializeTestEnvironment` + `beforeEach(clearFirestore)` + `withSecurityRulesDisabled` para seed. **`@firebase/rules-unit-testing` ya es devDep.**
- **Las 5 callables de access son emulator-safe:** todas importan `getFirestore`/`FieldValue`/`Timestamp` de **`firebase-admin/firestore` modular** (no el namespaced `admin.firestore.*` que es `undefined` en el emulador). Por eso batch 1 **no requiere migración** — al revés de `saveApiKey.ts` (batch 2).
- **Gate admin (`src/functions/src/lib/requireAdmin.ts`):** `export const adminEmail = defineSecret('ADMIN_EMAIL')`. `requireAdmin(request, expectedEmail)` lanza `unauthenticated` si no hay `request.auth`, y `permission-denied` si `token.email` (normalizado) ≠ `expectedEmail`. **Fail-closed si el secret viene vacío.** Lo consumen `processAccessRequest`, `revokeAccess`, `listAllowlistMembers` (cada una con `secrets: [adminEmail]`, `region: 'us-central1'`, `maxInstances: 2`). `checkMyAccess`/`submitAccessRequest` NO usan el secret.
- **Build de functions:** `src/functions/package.json` → `main: lib/index.js`, `build: tsc` (outDir `lib`, excluye `**/*.test.ts`). El emulador de functions sirve **`lib/index.js`** → hay que **compilar antes**. `emulators:exec` **no** corre el `predeploy` de `firebase.json`.
- **CI (`.github/workflows/ci.yml`):** trigger push/PR a `main`. Job único: `npm ci --legacy-peer-deps` → `npm run lint` → `npx tsc --noEmit` → `npm test`. **⚠️ Hallazgo: hoy NO corre `npm run test:rules`** (el draft asumía que sí). No hay precedente de emulador en CI → traerlo es un cambio propio. **Decisión (D8): `test:rules` en CI va como PR aparte y PREVIO** — de-risquea el emulador-en-CI antes de que dependa el harness.
- **Gitignore (verificado con `git check-ignore`):** `.secret.local` **SÍ está ignorado** por la regla raíz `.gitignore:13:*.local` (recursiva); `.env.local`/`.env.*` también (`src/functions/.gitignore:4`). → ningún archivo de secret/env del emulador es commiteable sin negaciones frágiles. Define el mecanismo de F4 (`.secret.local` **generado en runtime**, ver D5/F4).

## Decisiones

| #      | Decisión                                                                                                                                             | Estado                                                                                                                                                                                                                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1** | **Invocación = client SDK** (`httpsCallable` + `connectFunctionsEmulator` + `connectAuthEmulator`, tokens reales). **NO `firebase-functions-test`.** | **Cerrada (Sebastián).** El objetivo es ejercer el gate de auth real (token → `request.auth`) — justo lo que el unit de `requireAdmin` no puede.                                                                                                                                                                               |
| **D2** | **Batch 1 = 5 callables de access.** BYOK (`saveApiKey`/`deleteApiKey`) + su migración a imports modulares = **batch 2**.                            | **Cerrada (Sebastián).** No se mete la migración de `saveApiKey` en esta tanda.                                                                                                                                                                                                                                                |
| **D3** | **`test:functions` corre en CI, NO en el pre-commit hook.**                                                                                          | **Cerrada (Sebastián).** El boot del emulador es lento; no debe penalizar cada commit.                                                                                                                                                                                                                                         |
| **D4** | **Testing-infra puro: no se toca el comportamiento de ninguna CF.**                                                                                  | **Cerrada (Sebastián).** Si un test revela un bug, se reporta — no se "arregla de paso" en este SPEC.                                                                                                                                                                                                                          |
| **D5** | **Inyección de `ADMIN_EMAIL` = `src/functions/.secret.local` GENERADO EN RUNTIME** por `scripts/emu-secret.mjs` antes de `emulators:exec`.           | **Cerrada (corrección de Sebastián).** `defineSecret` resuelve de Secret Manager (prod) o `.secret.local` (emulador), NO de `process.env` → env-var inline no es confiable. El archivo se regenera cada corrida (gitignoreado, cero secret commiteado, reproducible local+CI). F4 mantiene el assert empírico de que resuelve. |
| **D6** | **Ubicación del harness = carpeta `e2e/` en la raíz, archivos `*.e2e.test.ts`.**                                                                     | **Decisión del SPEC.** Espeja el rules test (raíz). Corre con la toolchain del repo raíz (vitest + `firebase` client SDK del `package.json` raíz), no la de `src/functions`.                                                                                                                                                   |
| **D7** | **Seed/clear de Firestore = `@firebase/rules-unit-testing`** (`clearFirestore` + `withSecurityRulesDisabled`), reusando el patrón del rules test.    | **Decisión del SPEC.** Ya es devDep y está probado en el repo; evita un segundo mecanismo de seed (Admin SDK paralelo).                                                                                                                                                                                                        |
| **D8** | **`test:rules` en CI = PR aparte y PREVIO a este SPEC** (no plegado en SPEC-55, 1 commit).                                                           | **Cerrada (recomendación de Sebastián aceptada).** Es sobre las rules tests existentes (borde de seguridad), concern distinto al harness. Va primero: de-risquea el emulador-en-CI (timing/JDK) sin frenar el cierre del harness. F12 luego solo suma la línea `test:functions`.                                               |
| **D9** | **Arreglar el no-op del type-check de CI (`npx tsc --noEmit` → `tsc -b`) = PR aparte, NO en SPEC-55.**                                               | **Cerrada (hallazgo del audit).** `tsc --noEmit` sobre el root (`files:[]` + `references`) chequea 0 archivos → el type-check de CI no protege ni `src/` hoy. Fix de CI pre-existente, concern distinto (análogo a D8). SPEC-55 cubre `e2e/` con un step dedicado (`typecheck:e2e`), independiente de este fix.                |

---

## Sub-features

### Frente A — Infra del emulador y harness

#### F1 — Declarar emuladores `functions` + `auth` en `firebase.json`

- **Qué:** agregar a `emulators` los bloques `functions` (puerto `5001`) y `auth` (puerto `9099`), junto al `firestore: { port: 8080 }` y `singleProjectMode` existentes.
- **Criterio de done:**
  - [ ] `firebase emulators:start --project=demo-secondmind --only functions,auth,firestore` levanta los **tres** sin conflicto de puertos ni error de config.
  - [ ] El emulador de functions descubre las callables exportadas en `src/functions/src/index.ts` (aparecen en el log de boot).
- **Archivos:** `firebase.json`.

#### F2 — `vitest.functions.config.ts` + exclusión del `npm test` default

- **Qué:** nuevo `vitest.functions.config.ts`, espejo de `vitest.rules.config.ts` (`environment: node`, `globals`, `include: ['e2e/**/*.e2e.test.ts']`, `testTimeout: 20000`/`hookTimeout: 40000` — el boot + login suman latencia). Agregar `'**/*.e2e.test.ts'` al `test.exclude` de `vite.config.ts` (donde ya se excluye `firestore.rules.test.ts`), para que `npm test` no corra el harness sin emulador. **Type-check de `e2e/`:** crear `tsconfig.e2e.json` standalone (`include: ['e2e']`, `types: ['node', 'vitest/globals']`, `moduleResolution: bundler`, sin DOM) + script `typecheck:e2e` = `tsc -p tsconfig.e2e.json --noEmit`. **NO** vía `references` del root: el `tsc --noEmit` de CI no sigue references (es no-op total, ver D9) → un step dedicado es la única cobertura real.
- **Criterio de done:**
  - [ ] `vitest run --config vitest.functions.config.ts` selecciona **solo** los `e2e/**/*.e2e.test.ts`.
  - [ ] `npm test` (default) **no** ejecuta ningún archivo del harness (el conteo de tests del default no cambia).
  - [ ] **`npm run typecheck:e2e` type-checkea `e2e/` de verdad:** un error de tipo deliberado en un `e2e/*.ts` lo hace fallar con exit ≠ 0 (no vacuo).
- **Archivos:** `vitest.functions.config.ts` (**nuevo**), `tsconfig.e2e.json` (**nuevo**), `vite.config.ts`, `package.json`.

#### F3 — Script `npm run test:functions`

- **Qué:** script en `package.json`: `node scripts/emu-secret.mjs && npm --prefix src/functions run build && firebase emulators:exec --project=demo-secondmind --only functions,auth,firestore "vitest run --config vitest.functions.config.ts"`. (1) `emu-secret.mjs` (nuevo) genera `src/functions/.secret.local` con `ADMIN_EMAIL=admin-e2e@secondmind.test` (ver F4); (2) compila functions (el emulador sirve `lib/index.js` y `emulators:exec` no corre el `predeploy`); (3) levanta los 3 emuladores y corre la suite.
- **Criterio de done:**
  - [ ] `npm run test:functions` (con `lib/` borrado de antemano) **genera el secret, compila, levanta los 3 emuladores, corre la suite y propaga el exit code de vitest** (verde = 0, rojo ≠ 0).
  - [ ] Re-correr el script no requiere pasos manuales intermedios.
- **Archivos:** `package.json`, `scripts/emu-secret.mjs` (**nuevo**).
- **Notas:** confirmar que las opciones de las callables (`secrets`, `maxInstances`) **no rompen el boot** del emulador. Si emiten warnings benignos, documentarlos; si rompen, es bloqueante de F3.

#### F4 — Inyección del secret `ADMIN_EMAIL` en el emulador (`.secret.local` generado en runtime · D5)

- **Qué:** las 3 callables admin resuelven `adminEmail.value()` vía `defineSecret('ADMIN_EMAIL')`. `defineSecret` resuelve de Secret Manager (prod) o de `src/functions/.secret.local` (emulador), **no** de `process.env` → una env var inline NO es confiable. Mecanismo: `scripts/emu-secret.mjs` (F3) **genera** `src/functions/.secret.local` con `ADMIN_EMAIL=admin-e2e@secondmind.test` antes de `emulators:exec`. El archivo está gitignoreado (`*.local` raíz) → se regenera cada corrida (cero secret commiteado, cero `!`, reproducible local+CI). El valor es de test, **nunca** el `ADMIN_EMAIL` real; debe coincidir con el email del usuario admin de F5 (`admin-e2e@secondmind.test`).
- **Criterio de done:**
  - [ ] **Assert E2E del mecanismo:** invocar `listAllowlistMembers` autenticado como el admin de test devuelve `{ members: [...] }` (no `permission-denied`) — prueba que `.secret.local` se cargó y `adminEmail.value()` resuelve al valor de test.
  - [ ] El no-admin recibe `permission-denied` en la misma callable (confirma que el gate compara contra el valor inyectado, no contra vacío fail-closed).
  - [ ] `.secret.local` queda gitignoreado (no aparece en `git status`).
- **Archivos:** `scripts/emu-secret.mjs` (creado en F3), `src/functions/.secret.local` (generado, NO commiteado).
- **Nota de orden:** el assert de cierre (`listAllowlistMembers` como admin) necesita el bootstrap de F5 + el seed de F6, y conviene tener el canario F7 verde primero → **F4 va después de F5/F6/F7**. Sigue bloqueando F8/F9/F10.

### Frente B — Setup de prueba

#### F5 — Bootstrap cliente↔emulador + usuarios de prueba

- **Qué:** helpers en `e2e/helpers/`:
  - `emulator.ts`: inicializa una Firebase **app cliente** apuntando a los emuladores (`connectFunctionsEmulator(getFunctions(app, 'us-central1'), '127.0.0.1', 5001)` + `connectAuthEmulator(getAuth(app), 'http://127.0.0.1:9099')`). Región **`us-central1`** (la que declaran las callables). `projectId: 'demo-secondmind'`.
  - `users.ts`: `createTestUser({ email, password, allowlisted })` y un login que devuelve una instancia de `Functions` **autenticada** (token real con `email`). Tres perfiles: **admin** (`email === ADMIN_EMAIL` de test), **no-admin** (allowlisted), **sin-sesión** (cliente sin login). **`emailVerified` NO se setea** (YAGNI verificado en código): ninguna de las 5 callables lee `token.email_verified` — `requireAdmin` compara solo `token.email`; `checkMyAccess`/`isAllowlisted` no exigen verificación (D2 de SPEC-51); `submitAccessRequest` es pública. El gate de `email_verified` vive en las _security rules_, que el harness de callables **no atraviesa** (Admin SDK las bypassa). Si batch 2 lo necesitara, se agrega el flag ahí.
- **Criterio de done:**
  - [ ] El helper devuelve una `Functions` conectada al emulador (una `httpsCallable` **no** pega a producción — verificable por la URL/host del request).
  - [ ] Un usuario de prueba se loguea y obtiene un ID token real; `httpsCallable(checkMyAccess)()` responde sin colgarse.
  - [ ] El perfil **sin-sesión** produce `request.auth` ausente en la CF (se verifica vía el caso `unauthenticated` de F7).
- **Archivos:** `e2e/helpers/emulator.ts` (**nuevo**), `e2e/helpers/users.ts` (**nuevo**).

#### F6 — Seed + cleanup de Firestore entre casos

- **Qué:** `e2e/helpers/firestore.ts` reusando `@firebase/rules-unit-testing` (D7): `beforeEach(clearFirestore)` + seed vía `withSecurityRulesDisabled`. Helpers de seed para `accessRequests/{email}` (`status: 'pending'`), `allowlist/{email}` (`addedAt`), y `config/app` (`maxUsers`). Mismo `projectId: 'demo-secondmind'` que el runtime de functions (singleProjectMode) para que ambos vean el mismo Firestore.
- **Criterio de done:**
  - [ ] `beforeEach` deja Firestore vacío (un caso no contamina al siguiente — verificable corriendo dos casos que escriben el mismo doc id).
  - [ ] Tras `seedAllowlist(email)`, una callable admin que lista la allowlist ve ese doc; tras `seedConfig({ maxUsers })`, `processAccessRequest` lee ese límite.
- **Archivos:** `e2e/helpers/firestore.ts` (**nuevo**).

### Frente C — Casos por callable (afirmaciones reales, no la lógica pura ya cubierta por unit)

#### F7 — `checkMyAccess` (canario del bootstrap)

- **Qué:** el más simple — valida que el bootstrap de F5/F6 funciona end-to-end antes de los casos pesados.
- **Criterio de done:**
  - [ ] Autenticado **allowlisted** → `{ authorized: true }`.
  - [ ] Autenticado **NO allowlisted** → `{ authorized: false }`.
  - [ ] **Sin sesión** → error `functions/unauthenticated`.
  - [ ] **No-oráculo:** pasar un `email` de tercero en el `data` lo **ignora** (responde sobre el propio token, no enumera) — verificable: allowlistear un tercero y pasar su email como input desde un no-allowlisted devuelve `false`.
- **Archivos:** `e2e/checkMyAccess.e2e.test.ts` (**nuevo**).

#### F8 — `listAllowlistMembers` (gating admin + DTO)

- **Qué:** gating + shape del DTO.
- **Criterio de done:**
  - [ ] **Admin** → `{ members: [...] }` con cada item `{ email, addedAt }`; orden por `addedAt` **desc** (seedear ≥2 con timestamps distintos y verificar el orden).
  - [ ] **No-admin** autenticado → `permission-denied`.
  - [ ] **Sin sesión** → `unauthenticated`.
- **Archivos:** `e2e/listAllowlistMembers.e2e.test.ts` (**nuevo**).

#### F9 — `revokeAccess` (borrado + idempotencia + gating)

- **Qué:** primer writer de borrado a `allowlist/`.
- **Criterio de done:**
  - [ ] **Admin** revoca `allowlist/{email}` existente → `{ ok: true }` y el doc **ya no existe** (verificado leyendo Firestore con el seeder/Admin tras la llamada).
  - [ ] **Idempotente:** revocar un email **inexistente** → `{ ok: true }` (sin error).
  - [ ] **No-admin** → `permission-denied`; **sin sesión** → `unauthenticated`.
  - [ ] `email` vacío/no-string → `invalid-argument`.
- **Archivos:** `e2e/revokeAccess.e2e.test.ts` (**nuevo**).

#### F10 — `processAccessRequest` (capacity transaccional + idempotencia + gating) — **el crítico**

- **Qué:** el núcleo del capacity de la beta. Cada aserción se verifica contra el **estado Firestore post-invocación**.
- **Criterio de done:**
  - [ ] **approve bajo límite** (`current < maxUsers`, request `pending`) → `{ ok: true }`, `allowlist/{email}` **creado**, `accessRequests/{id}.status === 'approved'`.
  - [ ] **approve sobre límite** (`current === maxUsers`, email **nuevo**) → `resource-exhausted`; `allowlist` **no crece**; el request sigue `pending` (tx abortada).
  - [ ] **Idempotencia:** con beta **llena** (`current === maxUsers`) y el email **ya en allowlist**, re-aprobar su request → `{ ok: true }` **sin** `resource-exhausted`; el conteo de `allowlist` **no cambia** (no consume slot).
  - [ ] **reject** → `accessRequests/{id}.status === 'rejected'`; `allowlist` intacta.
  - [ ] **not-found:** approve/reject de un `id` inexistente → `not-found`.
  - [ ] **Gating:** no-admin → `permission-denied`; sin sesión → `unauthenticated`.
  - [ ] **invalid-argument:** `id` vacío o `action` ∉ {`approve`,`reject`}.
- **Archivos:** `e2e/processAccessRequest.e2e.test.ts` (**nuevo**).

#### F11 — `submitAccessRequest` (no-oráculo + dedup + rate-limit + público)

- **Qué:** callable **pública** (sin `request.auth`). Verifica los tres invariantes de seguridad.
- **Criterio de done:**
  - [ ] **Pública:** sin sesión → `{ ok: true }` y crea `accessRequests/{email}` con `status: 'pending'`.
  - [ ] **No-oráculo:** la respuesta es `{ ok: true }` **idéntica** para email nuevo / duplicado / ya-allowlisted (seedear `allowlist/{email}` y verificar que el output no cambia ni se lee la allowlist).
  - [ ] **Dedup:** segunda submit del mismo email **no pisa** `createdAt`/`status` (no-op — verificable comparando el doc antes/después).
  - [ ] **Rate-limit por IP:** N submits consecutivas desde el mismo cliente comparten bucket de IP en el emulador → superar `perMinute` (3) devuelve `resource-exhausted`. **Si el emulador no expone una IP estable/diferenciable que permita afirmar esto de forma fiable, documentar el límite de cobertura** (qué queda al unit de `rateLimit`) en vez de silenciarlo. `beforeEach(clearFirestore)` resetea el bucket entre casos.
  - [ ] **invalid-argument:** email malformado, `motivo` no-string, o `motivo` > 280 chars.
- **Archivos:** `e2e/submitAccessRequest.e2e.test.ts` (**nuevo**).
- **Notas:** el rate-limit (`enforceRateLimit`) hashea la IP de `rawRequest`; bajo el emulador todas las llamadas del cliente caen al mismo bucket → el límite se gatilla con submits consecutivos. Validar empíricamente; si el comportamiento de IP del emulador lo impide, no inventar el caso.

### Frente D — CI

#### F12 — Integrar `test:functions` al gate de CI

- **Qué:** agregar a `.github/workflows/ci.yml` dos steps: `npm run typecheck:e2e` (gate de tipos del harness — el `tsc --noEmit` existente es no-op, ver D9) y `npm run test:functions` (después de `npm test`). El toolchain de emulador (**JDK** vía `actions/setup-java`) lo trae el **PR previo de `test:rules` (D8)**; F12 lo reusa. El secret `ADMIN_EMAIL` lo genera el propio `test:functions` (F4) → sin config extra en CI. **NO** tocar el pre-commit hook (D3).
- **Criterio de done:**
  - [ ] El job de CI corre `lint` → `tsc --noEmit` → `typecheck:e2e` → `npm test` → **`npm run test:functions`** y todo pasa **verde en CI** (no solo local).
  - [ ] El runner tiene Java disponible para el emulador (heredado del PR de D8, o step propio si ese PR no estuviera).
- **Archivos:** `.github/workflows/ci.yml`.
- **Notas (DECIDIDO · D8):** `test:rules` en CI se hace como **PR aparte y PREVIO** a SPEC-55 (1 commit), **no** plegado acá — concern distinto (rules = borde de seguridad) y de-risquea el emulador-en-CI antes de que dependa el harness. **Pre-requisito de F12:** ese PR ya mergeado → CI con `setup-java` + `emulators:exec` operativos. **Fallback:** si no estuviera, F12 trae su propio `setup-java` (self-contained).

---

## Orden de implementación

1. **F1** → sin emuladores declarados, nada corre. Base de todo.
2. **F2** → config de vitest + exclusión del default; necesaria para invocar la suite aislada.
3. **F3** → el script que orquesta build + `emulators:exec`; cierra el lazo "comando único".
4. **F5** → bootstrap cliente↔emulador + usuarios; depende de F1 (auth/functions levantados).
5. **F6** → seed/cleanup; depende de F1 (firestore) y habilita aserciones de estado.
6. **F7** → `checkMyAccess`: canario que valida F5/F6 end-to-end con la callable más simple **antes** de pelear con la inyección del secret. No usa el gate admin → no depende de F4.
7. **F4** → verificar la inyección de `ADMIN_EMAIL` (`.secret.local` generado, D5). Va **después de F5/F6/F7**: su assert de cierre (`listAllowlistMembers` como admin) necesita el bootstrap + el seed, y conviene tener el canario verde primero. Bloquea F8/F9/F10.
8. **F8 → F9 → F10 → F11** → casos por callable; F8/F9/F10 dependen de F4 (gate admin resuelto). F11 es independiente del gate admin (pública) pero se deja al final por el rate-limit.
9. **F12** → CI al final, cuando la suite corre verde en local. **Pre-requisito: el PR previo de `test:rules` en CI (D8) ya mergeado** → CI ya tiene `setup-java` + `emulators:exec`; F12 suma `typecheck:e2e` + `test:functions`.

## Estructura de archivos

```
e2e/                                    # NUEVO — harness E2E de callables (raíz, fuera de src/)
├── helpers/
│   ├── emulator.ts                     # F5 — app cliente + connectFunctions/AuthEmulator (us-central1, demo-secondmind)
│   ├── users.ts                        # F5 — signInAs{Admin,Member,Outsider} + resetAuth (REST) → Functions autenticada
│   └── firestore.ts                    # F6 — clearFirestore + seed/read (accessRequests/allowlist/config) vía rules-unit-testing
├── checkMyAccess.e2e.test.ts           # F7
├── listAllowlistMembers.e2e.test.ts    # F8
├── revokeAccess.e2e.test.ts            # F9
├── processAccessRequest.e2e.test.ts    # F10
└── submitAccessRequest.e2e.test.ts     # F11
vitest.functions.config.ts              # F2 — espejo de vitest.rules.config.ts
tsconfig.e2e.json                       # F2 — type-check standalone de e2e/ (gate real de CI)
scripts/emu-secret.mjs                  # F3/F4 — genera src/functions/.secret.local en runtime
src/functions/.secret.local             # F4 — GENERADO por emu-secret.mjs, gitignoreado (NO commiteado)
```

**Modificados:** `firebase.json` (F1), `vite.config.ts` (F2), `package.json` (F2/F3 scripts), `tsconfig.json` (F2, opcional reference), `.github/workflows/ci.yml` (F12).

## Definiciones técnicas

### `ADMIN_EMAIL` en el emulador (D5)

- **Por qué no es trivial:** `defineSecret('ADMIN_EMAIL').value()` resuelve de Secret Manager (prod) o de `src/functions/.secret.local` (emulador) — **no** de `process.env`. Por eso una env var inline (con o sin `cross-env`) no es confiable: setea la var en el proceso del script, no en el runtime forkeado del emulador.
- **Mecanismo:** `scripts/emu-secret.mjs` escribe `src/functions/.secret.local` (`ADMIN_EMAIL=admin-e2e@secondmind.test`) antes de `emulators:exec`. Gitignoreado (`*.local` raíz) → se regenera cada corrida: cero secret commiteado, cero `!` frágil, reproducible Windows local + CI Linux. Valor de test, no el real.
- **Verificación (F4):** `listAllowlistMembers` como admin de test devuelve `{members}` (no `permission-denied`) = el secret se inyectó al runtime.

### Por qué client SDK y no `firebase-functions-test` (D1)

`firebase-functions-test` mockea el `CallableRequest` → nunca ejerce el flujo token → `request.auth`. El valor de este harness es **precisamente** validar ese gate con un token real emitido por el Auth emulator. Es más lento, pero es el único que cubre el hueco que el unit de `requireAdmin` deja abierto.

---

## Checklist de completado

Al cerrar la feature, TODAS deben ser verdaderas:

- [ ] `npm run test:functions` levanta functions+auth+firestore, corre la suite y **propaga el exit code** (un fallo del harness rompe el comando).
- [ ] Las **5 callables de access** tienen casos E2E verdes cubriendo gating, I/O Firestore y los invariantes propios de cada una (capacity/idempotencia/no-oráculo/rate-limit según corresponda).
- [ ] `ADMIN_EMAIL` se inyecta al emulador vía `.secret.local` generado en runtime (F4), verificado por un caso admin que pasa.
- [ ] `npm test` (default) **sigue sin** correr el harness; `npm run typecheck:e2e` type-checkea `e2e/` de verdad (un type error deliberado lo rompe).
- [ ] `ci.yml` corre `typecheck:e2e` + `test:functions` y todo pasa **verde en CI**.
- [ ] **Cero cambios al comportamiento de las CFs** (D4) — diff de `src/functions/src/**/*.ts` (excluyendo tests) vacío, salvo que un bug encontrado se haya **reportado** aparte (no parcheado en este SPEC).
- [ ] `lint` + `tsc -b` (build) + `typecheck:e2e` verdes sobre todo el repo.

## Siguiente fase

**Batch 2:** extender el harness a las callables **BYOK** (`saveApiKey`/`deleteApiKey`) — requiere **migrar `saveApiKey.ts` a imports modulares** (`firebase-admin/firestore`) primero, porque hoy usa el patrón namespaced `admin.firestore.FieldValue.*` que es `undefined` en el emulador. La infra de F1–F6 se reusa tal cual; solo se suman archivos de caso. (Triggers Firestore — `autoTagNote`, `generateEmbedding` — son otra historia: requieren mocking de LLM/embeddings, fuera de la línea de callables.)
