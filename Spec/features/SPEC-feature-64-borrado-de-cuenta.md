# SPEC — Feature 64: Borrado de cuenta in-app (web v1 + Android; Tauri diferido)

> **Estado:** 🟡 **Prescriptivo — pendiente de implementación** (draft generado 2026-06-20). Las secciones F1–Fn describen lo que se VA a construir; el siguiente paso es el **step 2 del SDD (Plan mode)** antes de codear.
> **Versión objetivo:** `0.5.4` (tentativa) — client (web) + functions (CF nueva). **Sin cambios en `firestore.rules`.** Rebuild **solo Android** para la entrada nativa (F5); **Tauri NO se rebuildea en v1** (el botón se oculta vía `isTauri()` y el binario actual ni siquiera trae el código nuevo). Confirmar al cerrar.
> **Rama:** `feat/borrado-de-cuenta` → merge `--no-ff` a `main` (al cierre).
> **Depende de:** F48 (BYOK `userSecrets/` deny-all), F50/F51 (`allowlist/`, `isAllowlisted`, normalización email, `rateLimits/`, `checkMyAccess`, `sanitizeError`), F52/F53 (molde callable admin + `revokeAccess` como **molde de borrado de `allowlist/`**, `accessRequests/`), F55 (harness E2E de callables — para testear `deleteAccount`), F47 (auth web Google + email/password).
> **Origen:** `Spec/drafts/privacy-data-inventory.md` (gap GDPR/CCPA: NO existe borrado de cuenta in-app, NI CF de wipe total, NI export) + Privacy Policy §9 + requisito de **Data deletion** de Google Play.
> **Desbloquea (parcial):** SPEC-64 entrega el **flujo de borrado in-app** (web + Android) — el _destino_ del borrado. La **URL pública** `getsecondmind.co/eliminar-cuenta` y su **registro en el form Data Safety** de Play **NO los construye este SPEC**: se cierran en el **paquete de publicación de privacy** (landing + deploy, posterior). SPEC-64 es pre-requisito para cerrar el pendiente #3, no lo cierra por sí solo.

## Objetivo

Tras esta fase, un usuario puede **borrar su cuenta y TODOS sus datos personales de forma irreversible** desde la propia app: se reautentica, confirma, y un callable server-side arrasa todo su contenido + secretos + rastro de PII + el usuario de Auth. En **web** el flujo es completo in-app. En **Android (Capacitor)** el botón **abre la URL web de borrado** en el navegador del sistema (entrada in-app que Play exige). En **desktop (Tauri)** el botón se **oculta** en v1 (sin romper nada): Tauri no se distribuye por Play ni está en el critical path, así que entra al **fast-follow** junto con el reauth nativo. Cierra el gap GDPR/CCPA de borrado y satisface el requisito de Play.

## Contexto / punto de partida (verificado en código — ver `privacy-data-inventory.md`)

- **La CF es obligatoria, no opcional.** `userSecrets/{uid}/**` es **deny-all al cliente** (`firestore.rules:42-44`): el cliente **no puede** borrar el ciphertext de la key BYOK. El borrado completo EXIGE Admin SDK desde una Cloud Function (el Admin SDK bypassa las rules).
- **`recursiveDelete` del Admin SDK** (`firebase-admin`, ya en uso, repo `^13.x`) borra un doc y **todos** sus descendientes (subcolecciones) en bulk. Dispara los triggers `onDocumentDeleted` por cada doc borrado (ver D7).
- **`onNoteDeleted`** (`src/functions/src/notes/onNoteDeleted.ts`) hace cascada embeddings + links por nota borrada (2 queries + batch). **El soft-delete NO lo dispara** (solo el delete real del doc) → en un wipe masivo SÍ se dispara N veces (D7).
- **Reauth = gate de identidad, no requisito técnico del Admin SDK.** `admin.auth().deleteUser(uid)` **NO** exige login reciente (eso solo aplica al `deleteUser()` _del cliente_). Reforzamos reauth verificando `request.auth.token.auth_time` reciente **dentro de la CF** (gate server-side real, no solo UX).
- **Auth:** Google (todas las plataformas) + email/password (**solo web**). No existe doc `users/{uid}` raíz (identidad solo en Firebase Auth) → `users/{uid}` es un **doc fantasma**: no existe como documento, solo cuelga subcolecciones; el wipe (F1) debe borrarlas igual (aserción explícita en el criterio de done). En shells nativos (Android Capacitor `signInWithCapacitor`, desktop `signInWithTauri` OAuth PKCE) **no aplica el reauth por popup** → de ahí el patrón "abrir URL web" para **Android** en v1. **Tauri se difiere en v1** (se oculta el botón): no pasa por Play, no es critical path (YAGNI).
- **Settings:** `src/app/settings/page.tsx` renderiza secciones (`ApiKeysSection`, `TrashAutoPurgeSelector`, `AppInfoSection`, etc.). Auth en `src/hooks/useAuth.ts` (expone `signOut`, no hay `deleteUser`). Helpers de runtime: `isCapacitor()` / `isTauri()` (usados en `useAuth`/`capacitorAuth`/`tauriAuth`).
- **Molde de callable + borrado de allowlist:** `revokeAccess` (`src/functions/src/access/revokeAccess.ts`) ya borra `allowlist/{email}` idempotentemente — molde directo. Wrappers cliente en `src/lib/accessRequests.ts` (`httpsCallable(functions, …)`).
- **`rateLimits/`** (`firestore.rules:60-62`, deny-all): docId = `{uid}__{key}__{window}__{slot}`, sin campo `uid` → borrar por **range query sobre `documentId()`** (`>= uid+'__'`, `< uid+'__'`). Tienen TTL (`expireAt`) pero se incluyen por completitud (PII = el uid embebido en el id).

## Decisiones cerradas (con Sebastián, esta sesión)

| #      | Decisión                                                                   | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Borrado TOTAL, hard-delete irreversible**                                | No anonimizar: anonimizar texto libre de una PKM es re-identificable e inviable; cero analítica que preservar; menos superficie de riesgo (P7 + YAGNI).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **D2** | **Arquitectura = callable Cloud Function v2 con Admin SDK**                | Obligatoria (`userSecrets` deny-all). Un solo callable `deleteAccount` orquesta todo el wipe + `auth().deleteUser`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **D3** | **Reauth = gate de identidad, server-enforced**                            | El cliente reautentica (web: popup Google / credential password) ANTES de invocar; **inmediatamente después fuerza `getIdToken(true)` (force refresh del ID token) para que el nuevo `auth_time` propague al token que viaja al callable** — sin esto el token cacheado conserva el `auth_time` viejo y la CF rechaza con `reauth-required` pese a un reauth exitoso (silent failure). La CF **verifica `auth_time` reciente** (p. ej. ≤ 5 min) y rechaza si no → defensa anti-sesión-secuestrada real, no solo UX.                                                                                                                                                                                                                                                                                                                                               |
| **D4** | **Scope de borrado = TODA la PII (explícito)**                             | (a) `users/{uid}/**` completo (notes, tasks, projects, objectives, inbox, habits, embeddings, links, settings/preferences, settings/aiKeys); (b) `userSecrets/{uid}/**`; (c) `allowlist/{email}`; (d) `accessRequests/{email}`; (e) `rateLimits/` del uid; (f) usuario de Firebase Auth. _Nota: areas y tags NO son colecciones (areas = constantes hardcodeadas; tags = IDs dentro de notes), no requieren borrado propio; `recursiveDelete` barre cualquier subcolección que llegue a existir bajo `users/{uid}`._                                                                                                                                                                                                                                                                                                                                              |
| **D5** | **`allowlist/{email}` se borra — obligatorio, no abierto**                 | Libera el asiento de la beta (la capacidad se cuenta sobre `allowlist` desde F53) **y** no retiene PII de quien pidió borrarse. Efecto: re-registrarse requiere re-solicitar acceso (correcto).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **D6** | **Plataforma v1: web completo + Android; Tauri diferido**                  | Web (navegador): flujo in-app completo. **Android (Capacitor): el botón NO se oculta — abre la URL web canónica de borrado en el navegador del sistema** (un link al recurso web cuenta como in-app path para Play; es la plataforma que Play exige). **Desktop (Tauri): el botón se OCULTA en v1** (no se rompe) — no se distribuye por Play, no está en el critical path (YAGNI). Tauri + reauth nativo 100% in-app (Android + Tauri) = **fast-follow**, fuera de v1. _(El recorte de Tauri implica CERO rebuild Tauri en v1: el binario actual no trae el código nuevo y el guard `isTauri()` lo ocultará cuando Tauri se rebuildee en el fast-follow.)_                                                                                                                                                                                                       |
| **D7** | **Tormenta de triggers `onNoteDeleted`: dejar correr (idempotente) en v1** | El `recursiveDelete` de `users/{uid}` dispara `onNoteDeleted` por nota; su trabajo (borrar embedding+links) es **redundante** con el wipe pero **idempotente** (queries por noteId devuelven sets vacíos = no-op). **Inofensivo porque los triggers son asíncronos y fuera del path crítico** del callable (que retorna apenas `recursiveDelete` completa, sin esperarlos), NO por un tope de concurrencia: **`onNoteDeleted` NO declara `maxInstances`** (`onNoteDeleted.ts:19-28`), escala con el default de plataforma; el `maxInstances` del callable solo limita borrados de cuenta concurrentes. Costo **bajo, no nulo**: Firestore factura ≥1 read por query/get aunque devuelva 0 docs (~3 reads/nota → ~3N reads), trivial a escala beta. **Supresión por marker** = optimización para después, NO v1. **Validado en step 2; medir reads reales en F4.** |

---

## Sub-features

### Frente A — Backend: el callable de borrado

#### F1 — `deleteAccount` (callable v2, Admin SDK) — el corazón

- **Qué:** nuevo callable autenticado. Pasos, **idempotente y re-ejecutable** (puede fallar a mitad y re-correrse):
  1. `requireAuth` — **self-service: auth simple, NO `requireAdmin`, NO secret de admin; el único gate de autorización es auth + reauth reciente (paso 2). ⚠️ No copiar `requireAdmin`/`adminEmail` del molde `revokeAccess.ts`** (inyectarlos rechazaría a todo usuario normal). → `uid`, `email` (del token, normalizado `trim().toLowerCase()` para las keys `allowlist`/`accessRequests`).
  2. **Gate de reauth (D3):** si `now - request.auth.token.auth_time > REAUTH_MAX_AGE` (p. ej. 5 min) → `HttpsError('failed-precondition', 'reauth-required')`.
  3. `recursiveDelete(db.doc('users/'+uid))` — todo el árbol (D4a).
  4. `recursiveDelete(db.doc('userSecrets/'+uid))` — ciphertext de la key (D4b).
  5. `db.doc('allowlist/'+email).delete()` (D4c/D5, idempotente). **Guard defensivo: si el token NO trae `email`, saltar los pasos 5-6** (evita borrar `allowlist/undefined` / `accessRequests/undefined`; teórico para Google/email-pw que siempre lo traen, pero barato).
  6. `db.doc('accessRequests/'+email).delete()` (D4d, idempotente).
  7. `rateLimits/` del uid: range query sobre `documentId()` (`>= uid+'__'`, `< uid+'__'`) → borrar en batch (D4e).
  8. `admin.auth().deleteUser(uid)` **ÚLTIMO** (D4f): así, si un paso previo falla, el token sigue válido para reintentar; y borrar Auth revoca el token (cierra sesión de facto).
- **Config:** `secrets: []` (no necesita BYOK/OpenAI), `timeoutSeconds: 300` (el `recursiveDelete` de cuentas grandes puede tardar), `region: 'us-central1'`, `maxInstances: 3`. Logs con `sanitizeError()` — **nunca** email/uid crudos más allá de lo mínimo, jamás contenido.
- **Criterio de done (verificable, emulador — harness F55):**
  - Seed de un usuario con ≥1 doc en CADA colección (notes con embedding+links, tasks, projects, objectives, inbox, habits, settings/{preferences,aiKeys}, userSecrets, allowlist/{email}, accessRequests/{email}, rateLimits) + usuario Auth, **SIN crear el doc raíz `users/{uid}` (no existe en prod — es un doc fantasma con solo subcolecciones)** → `deleteAccount` → **todo** ausente server-side (cada colección vacía) **y** `auth().getUser(uid)` lanza `user-not-found`. **Aserción explícita (ajuste 4): `recursiveDelete(db.doc('users/'+uid))` borra TODAS las subcolecciones aunque el doc padre nunca haya existido** — si no las borrara, el wipe dejaría toda la PII viva.
  - Sin sesión → `unauthenticated`. `auth_time` viejo → `failed-precondition` (`reauth-required`), **sin borrar nada**.
  - Re-ejecución tras éxito parcial (p. ej. matar tras paso 4) → completa el resto sin error (idempotencia).
- **Archivos:** `src/functions/src/account/deleteAccount.ts` (nuevo), `src/functions/src/index.ts` (export → pasa a **15 CFs**).

### Frente B — Frontend web: el flujo de borrado

#### F2 — Lib cliente + helper de reauth

- **Qué:** `src/lib/account.ts` con `deleteAccount(): Promise<void>` (wrapper `httpsCallable(functions, 'deleteAccount')`, molde `src/lib/accessRequests.ts`) y un helper `reauthenticate()` que ramifica por provider del `currentUser`: Google → `reauthenticateWithPopup(user, googleProvider)`; email/password → `reauthenticateWithCredential(user, EmailAuthProvider.credential(email, password))` (pide password en el modal). **Tras un reauth exitoso, ANTES de devolver, llama `await user.getIdToken(true)` (force refresh) para que el nuevo `auth_time` viaje en el token al callable (ajuste 3 / D3) — omitirlo = `reauth-required` espurio.** Propaga errores tipados (`wrong-password`, `popup-closed-by-user`, `requires-recent-login`).
- **Archivos:** `src/lib/account.ts`.

#### F3 — `DeleteAccountSection` (danger zone) — flujo web completo

- **Qué:** componente en Settings con estética "danger zone" (separada, acento destructivo). Flujo: botón "Borrar mi cuenta" → modal de **confirmación destructiva fuerte** (escribir el **email de la cuenta** para habilitar el botón) → reauth (F2) → `deleteAccount()` → en éxito `signOut()` + redirect a `/login` con toast/copy de confirmación. Estados: idle / reautenticando / borrando (skeleton/disabled, **nunca spinner**) / error (copy específico para `reauth-required`/`wrong-password` vs genérico). Copy **i18n es/en** (claves nuevas bajo `settings.deleteAccount.*` — patrón F58; campo aditivo, **no** bumpear `PREFERENCES_SCHEMA_VERSION`).
- **Criterio de done:** en web, un usuario reautentica y borra; tras el borrado queda deslogueado en `/login`; el botón solo se habilita con el email exacto tipeado; reauth fallido muestra error y NO llama a la CF; loading = skeleton.
- **Archivos:** `src/components/settings/DeleteAccountSection.tsx` (nuevo), `src/locales/es/translation.json` + `src/locales/en/translation.json` (claves nuevas).

#### F4 — Montar la danger zone en Settings

- **Qué:** renderizar `<DeleteAccountSection />` al final de `src/app/settings/page.tsx`, visualmente separada (hairline + título "Zona de peligro" o equivalente).
- **Criterio de done:** la sección aparece en `/settings` en web; orden y separación visual correctos.
- **Archivos:** `src/app/settings/page.tsx`.

### Frente C — Shells nativos (entrada in-app que abre la URL web)

#### F5 — Android (Capacitor): el botón abre la URL web · Tauri: botón oculto

- **Qué:** `DeleteAccountSection` detecta el runtime. En **navegador web** → flujo inline (F3). En **Capacitor (Android)** → el botón (NO oculto) abre la **URL de borrado** en el navegador del sistema (no en el WebView, para que el reauth web funcione). URL que abre el botón: **`https://app.getsecondmind.co/settings`** (la misma danger zone; requiere login, lo cual Play permite para el _path in-app_). En **Tauri** → el botón se **oculta** (guard `isTauri()`; no se rompe nada). Mecanismo de apertura externa Android: `@capacitor/browser` (`Browser.open`) **[nueva dep + rebuild Android]**. _(El mecanismo exacto y si conviene una ruta dedicada se afina en step 2.)_
- **⚠️ Dos URLs distintas (ajuste 2):** la URL que **abre el botón** (`app.getsecondmind.co/settings`, requiere login) **NO** es la URL que se **registra en el form Data Safety de Play**. Esa debe ser una **página PÚBLICA sin login** (propuesta: `getsecondmind.co/eliminar-cuenta` en la **landing Astro**) que explique el proceso, para que el revisor de Google no quede atascado en el login. **Esa página y su registro en Data Safety quedan FUERA de SPEC-64** — se cierran en el **paquete de publicación de privacy** (landing + deploy, posterior). Este SPEC solo entrega el flujo de borrado in-app (el destino).
- **Criterio de done:** en el APK (Android), tocar "Borrar mi cuenta" abre `app.getsecondmind.co/settings` en el navegador del sistema (no rompe ni queda inerte). En Tauri, el botón **no aparece** (oculto, sin error). El flujo no se rompe en ninguna plataforma.
- **Archivos:** `src/components/settings/DeleteAccountSection.tsx` (rama por runtime: web inline / Android abre URL / Tauri oculto), `src/lib/account.ts` (helper `openWebDeletion()`), posible `capacitor.config.ts` / deps (`@capacitor/browser`) — **acotado a la entrada Android, sin tocar `src-tauri/`**.

---

## Orden de implementación

1. **F1** (callable `deleteAccount`) + tests de emulador (harness F55). _Es el corazón y el de mayor riesgo (wipe + idempotencia + tormenta de triggers D7) → validar primero._
2. **F2** (lib + reauth) → **F3** (UI danger zone web) → **F4** (montar en Settings). Flujo web end-to-end.
3. **F5** (Android abre la URL web; Tauri oculta el botón). Depende de que el flujo web (F3/F4) exista y sea la URL destino.
4. Deploy pipeline (orden server-side: commit → review → merge → deploy) + E2E + smoke.

## Pasos manuales del operador

- Ninguna migración de datos ni secret nuevo. **Sin cambios en `firestore.rules`** (todo el borrado es Admin SDK, que bypassa rules).
- Deploy: `deploy:functions` (nuevo `deleteAccount`) + hosting web. **Solo Android** (`cap sync` + `gradlew assembleDebug`) **requerido por F5** (entrada nativa). **Tauri NO se rebuildea en v1** (el guard `isTauri()` oculta el botón; el binario actual no trae el código nuevo).
- **Página pública de borrado para Play (FUERA de SPEC-64 — va con el paquete de publicación de privacy):** `getsecondmind.co/eliminar-cuenta` (**landing Astro**), **sin login**, explicando el proceso. **Es la URL que se registra en el form Data Safety**, NO `app.getsecondmind.co/settings` (esa requiere login y el revisor de Google quedaría atascado). Este SPEC NO la construye; se anota acá solo como dependencia del cierre del pendiente #3.
- Tras publicar la privacy policy: registrar la **URL pública de borrado** (`https://getsecondmind.co/eliminar-cuenta`) en el formulario **Data Safety** de Play (cierra pendiente #3).

## Verificación

- **E2E emulador** (functions+firestore+auth, harness F55): F1 happy path (wipe total verificado colección por colección + Auth user borrado), **incluyendo la aserción explícita de que `recursiveDelete` sobre el doc FANTASMA `users/{uid}` —que no existe como documento, solo tiene subcolecciones— borra TODAS las subcolecciones** (ajuste 4); gating (`unauthenticated`, `reauth-required`), idempotencia (re-run tras kill parcial), y comportamiento de `onNoteDeleted` bajo wipe masivo (D7 — **medir reads facturables, no solo invocaciones**: Firestore cobra ≥1 read por query/get aunque devuelva 0 docs → ~3N reads).
- **E2E Playwright (web):** reauth (Google popup / password) → confirmación por email → borrado → redirect a `/login` desligado. Caso reauth fallido (no llama CF).
- **Build/lint/test:** `npm run build` + `npm run lint` completo + `npm test` + `npm run test:rules` verdes.
- **Capa UI (F4) — test de componente** ([DeleteAccountSection.test.tsx](../../src/components/settings/DeleteAccountSection.test.tsx)): gate de control-flow del cliente — **reauth falla → `deleteAccount` NUNCA se invoca** (+ control: reauth ok → deleteAccount+signOut+redirect). Es la ÚNICA defensa del caso "auth_time fresco por login + reauth de re-confirmación falla" (F1 server-side no lo frena). NO se automatiza el wipe real por browser: no hay infra emulador-en-browser y montarla sería YAGNI (F1 ya cubre el wipe).
- **Smoke manual pre-release (política de datos QA, CLAUDE.md step 5) — NUNCA la cuenta real (borra Auth irreversiblemente).** El wipe ya está cubierto por F1 (emulador); esto valida el happy path UI con datos reales una vez. Guion:
  1. **Throwaway:** signup con email descartable → seedear `allowlist/{email}` (Console o /admin) para pasar el gate beta → loguear.
  2. **Poblar:** ≥1 nota/tarea/proyecto + configurar una API key BYOK (siembra `userSecrets/`). Anotar el `uid` (Firebase MCP / Console) ANTES de borrar.
  3. **Borrar:** `/settings#delete-account` → "Borrar mi cuenta" → tipear el email exacto + password (si email/pw) → "Borrar definitivamente" → verificar redirect a `/login` deslogueado.
  4. **Verificar server-side (Firebase MCP):** `users/{uid}/**`, `userSecrets/{uid}`, `allowlist/{email}`, `accessRequests/{email}`, `rateLimits` del uid → todo ausente; `auth_get_users` → el uid NO existe.
  5. **Edge UI (sin borrar, cualquier cuenta QA):** email mal tipeado → botón disabled; password vacío (email/pw) → disabled; reauth cancelado/incorrecto → error sin borrado (ya cubierto por el test de componente F4).
  - Smoke nativo (F5): en el APK (Android), el botón abre `app.getsecondmind.co/settings` en el navegador (Tauri fuera de v1).

## Riesgos / cuestiones abiertas

- **D7 — tormenta de `onNoteDeleted` en wipe masivo:** validado en step 2 (inofensivo: async + idempotente; costo bajo ~3N reads facturables, no nulo). Medir reads reales en F4; si excede cuota, supresión por marker (fuera de v1). No es bloqueante.
- **Reauth en shells nativos (fast-follow explícito):** v1 manda **Android** a la URL web y **oculta el botón en Tauri**; el flujo 100% in-app nativo (reauth Google nativo en Android/Tauri) + el botón nativo de Tauri son fase posterior. Documentar para que no se lea como "borrado roto en la app nativa" (Android tiene el path web; Tauri simplemente no expone la opción aún).
- **`@capacitor/browser` es dependencia nueva** (F5) → reincidencia del gotcha de `resolve.dedupe` de Vite tras `npm install` (CLAUDE.md): revalidar el dev server tras instalar.
- **Irreversibilidad en QA:** prohibido smoke contra la cuenta real. Solo throwaway. (Excede el protocolo normal de QA porque borra Auth, no solo datos.)
- **Gotchas a escalar al cerrar:** (1) `auth_time` del token como gate de reauth server-side en un callable — **incluido el force `getIdToken(true)` en el cliente tras reauth, sin el cual el `auth_time` queda stale y el gate rechaza un reauth válido (silent failure)** (ajuste 3); (2) borrar `rateLimits/` por range query sobre `documentId()` (sin campo uid); (3) patrón "shell nativo abre URL web del sistema" para entradas que requieren contexto de navegador (reauth) → **en v1 aplica a Android**; (4) `recursiveDelete` borra las subcolecciones de un doc **fantasma** (padre inexistente) — verificado por test (ajuste 4); (5) **la URL del form Data Safety de Play debe ser PÚBLICA sin login** (distinta de la que abre el botón nativo), o el revisor queda atascado en el login.

## Checklist

- [ ] F1 — `deleteAccount` callable (wipe total D4 + reauth gate D3 + idempotente) + tests emulador (incl. wipe del doc fantasma `users/{uid}`)
- [ ] F2 — lib `account.ts` (wrapper + reauth por provider)
- [ ] F3 — `DeleteAccountSection` danger zone (confirmación por email, reauth, signout+redirect, i18n es/en)
- [ ] F4 — montar la sección en `/settings`
- [ ] F5 — Android abre la URL web canónica; Tauri oculta el botón (`isTauri()`)
- [ ] E2E emulador (F1) + E2E Playwright web + smoke throwaway con verificación server-side
- [ ] Deploy `0.5.4` (functions + hosting; rebuild **solo Android**, Tauri NO). _(La página pública `getsecondmind.co/eliminar-cuenta` + su registro en Data Safety = paquete de publicación de privacy, FUERA de este SPEC.)_
- [ ] Cierre: registro de implementación + escalación de gotchas + actualizar `privacy-data-inventory.md`/policy si el flujo cambió algún hecho

## Siguiente fase / fast-follow

- **Reauth nativo 100% in-app + botón nativo en Tauri:** en Android, borrar sin salir al navegador (reauth Google nativo); en Tauri, **exponer el botón** (hoy oculto en v1) con su propio reauth/opener (`@tauri-apps/plugin-opener`). Tauri entra acá, no en v1.
- **Opt-out de embeddings** (pendiente de publicación #4, CCPA + P6) y **export de datos** (portabilidad GDPR §8) — features aparte, fuera de este SPEC.
