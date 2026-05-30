# SPEC — Feature 50: Security Hardening pre-beta v0.5.0

> **Estado:** Pendiente — no implementado.
> **Fuente:** `Spec/audits/AUDIT-auth-keys-v0.5.md` (auditoría READ-ONLY 2026-05-29). Scope CERRADO: solo los 6 ítems de abajo. No re-abrir discovery.
> **Alcance:** Cierra los hallazgos de seguridad que condicionan abrir la beta privada de ~100 usuarios. Suma un gate de **allowlist de emails** (beta cerrada por invitación) como control de acceso real.
> **Dependencias:** F47 (login/capacity), F48 (BYOK keys) — ambas en prod.
> **Alimenta:** release v0.5.0.

---

## Objetivo

Tras esta fase: (1) los callables BYOK/search exigen `email_verified` server-side (consistencia con C1), (2) solo emails en una allowlist pueden usar la app — enforced en Firestore rules **y** en los callables, no solo en la UI, (3) el cifrado de las keys BYOK queda atado al `uid` (AAD) y versionado (`keyVersion`) para habilitar rotación futura, y (4) se acotan el abuso de costo de los callables y la enumeración de cuentas en el login. La beta queda con un control de acceso defendible end-to-end.

---

## Features

### F1 — `requireVerified` en los callables (A-1 · BLOQUEANTE)

**Qué:** Helper compartido que exige autenticación **y** email verificado al inicio de `saveApiKey`, `deleteApiKey` y `embedQuery`. Criterio idéntico a C1 en `firestore.rules:10-14`: `email_verified === true || firebase.sign_in_provider === 'google.com'`. Hoy los tres callables solo chequean `if (!request.auth)` (`saveApiKey.ts:31-34`, `deleteApiKey.ts:22-25`, `embedQuery.ts:27-31`) y, como usan Admin SDK, **bypassan las rules** → un usuario no verificado evade el gating de C1 por endpoint directo.

**Criterio de done:**

- [ ] Existe `src/functions/src/lib/requireVerified.ts` con `requireVerified(request): string` (retorna el `uid`, o lanza `HttpsError`).
- [ ] Lanza `HttpsError('unauthenticated', ...)` si `!request.auth`.
- [ ] Lanza `HttpsError('permission-denied', ...)` si NO (`token.email_verified === true || token.firebase.sign_in_provider === 'google.com'`).
- [ ] `saveApiKey`, `deleteApiKey` y `embedQuery` lo invocan como primera línea del handler, reemplazando el `if (!request.auth)` actual.
- [ ] Verificable: un callable invocado con un token de usuario email/password **no verificado** responde `permission-denied`; con Google o email verificado, procede normal.

**Archivos a crear/modificar:**

- `src/functions/src/lib/requireVerified.ts` — nuevo helper.
- `src/functions/src/settings/saveApiKey.ts` — reemplazar guard `:31-34`.
- `src/functions/src/settings/deleteApiKey.ts` — reemplazar guard `:22-25`.
- `src/functions/src/search/embedQuery.ts` — reemplazar guard `:27-31`.

**Notas:** Helper sync, sin lectura Firestore (lee del token). El claim `firebase.sign_in_provider` y `email_verified` ya viajan en `request.auth.token` (mismo origen que las rules). No tocar el `request.auth.uid` server-derived que ya usan (no hay IDOR).

---

### F2 — `maxInstances` en `embedQuery` y `saveApiKey` (A-4)

**Qué:** Acotar instancias concurrentes de los callables con `fetch` externo, para bounded-cost ante abuso. `embedQuery` es el de mayor riesgo (usa la `OPENAI_API_KEY` **compartida del operador**, no BYOK); `saveApiKey` hace un `fetch` a Anthropic por invocación (`validateProviderKey`).

**Criterio de done:**

- [ ] `embedQuery` declara `maxInstances: 5` en las opts del `onCall` (`embedQuery.ts:20-25`).
- [ ] `saveApiKey` declara `maxInstances: 3` (`saveApiKey.ts:24-29`).
- [ ] Verificable: `firebase deploy --only functions` aplica el cap (visible en la config de la función en consola/CLI).

**Archivos a modificar:**

- `src/functions/src/search/embedQuery.ts` — opts `onCall`.
- `src/functions/src/settings/saveApiKey.ts` — opts `onCall`.

**Notas:** Números conservadores para beta de 100; subir si la latencia por cold-start molesta. `deleteApiKey` no lo necesita (no hace fetch externo) — opcional `maxInstances: 2` por consistencia, fuera de criterio.

---

### F3 — Colapsar enumeración de cuentas en el login (A-5)

**Qué:** En `authErrors.ts:18-19`, en contexto `signin`, `auth/user-not-found` devuelve hoy `'No existe una cuenta con ese email.'` — diferenciable de `'Email o contraseña incorrectos.'` (`wrong-password`/`invalid-credential`, `:16-17`) → oráculo de enumeración latente si EEP estuviera off. Colapsar ambos al mismo mensaje genérico en `signin`. El contexto `reset` mantiene `RESET_GENERIC`.

**Criterio de done:**

- [ ] En `signin`, `auth/user-not-found` retorna el mismo string que `wrong-password`/`invalid-credential` (`'Email o contraseña incorrectos.'`).
- [ ] En `reset`, `auth/user-not-found` sigue colapsado al genérico de reset (sin regresión).
- [ ] `authErrors.test.ts` cubre el nuevo mapeo (signin user-not-found === wrong-password).
- [ ] **Acción manual del operador (NO código):** confirmar **Email Enumeration Protection** activado en Firebase Console → Authentication → Settings. Anotar como done-criterion verificado manualmente.

**Archivos a modificar:**

- `src/lib/authErrors.ts` — case `auth/user-not-found` en `signin`.
- `src/lib/authErrors.test.ts` — assertion del colapso.

---

### F4 — Allowlist: storage + Firestore rules (A-2 · backstop real)

**Qué:** Colección top-level `allowlist/{email}` con **deny-all** read/write desde cliente (las rules la leen server-side aunque el cliente no pueda, igual que `userSecrets/`). El `match /users/{userId}/{document=**}` suma, **en AND con C1**, que el email del token exista en la allowlist. Gestión manual (consola/script), sin UI de admin.

**Criterio de done:**

- [ ] `firestore.rules` tiene `match /allowlist/{email} { allow read, write: if false; }` (top-level, deny-all).
- [ ] El `match /users/{userId}/{document=**}` agrega `&& exists(/databases/$(database)/documents/allowlist/$(request.auth.token.email))` al final de la condición existente (AND, nunca OR).
- [ ] `config/app` NO se toca (no se exponen los emails como PII pública).
- [ ] Verificable con el simulador de rules / `firebase emulators`: un usuario verificado **no** allowlisted recibe `permission-denied` al leer/escribir `users/{suUid}/**`; uno allowlisted lee/escribe normal.
- [ ] Documentado el procedimiento de seed manual (doc IDs en lowercase+trim).

**Archivos a modificar:**

- `firestore.rules` — bloque `allowlist/` nuevo + AND en `users/**` (`:10-14`).

**Notas:** Los doc de allowlist no guardan payload (la existencia del doc ES el flag); opcionalmente `{ addedAt }` para auditoría. `exists()` añade un read por evaluación de rule (costo/latencia) — aceptable para beta. Ver § "Normalización de email" y § "Gotchas".

---

### F5 — Allowlist en Cloud Functions (A-2 · guards + pre-check)

**Qué:** Dos piezas server-side: (a) guard `assertAllowlisted(email)` aplicado a `saveApiKey` y `deleteApiKey` en AND con `requireVerified` (F1) — **NO** a `embedQuery` (ver Notas); (b) callable `checkAllowlist({ email })` para el pre-check del cliente (el cliente no puede leer `allowlist/` directo — F4 deny-all). **`onUserCreated` NO se modifica** (ver D4): las cuentas no-allowlisted quedan inertes, neutralizadas por las rules de F4.

**Criterio de done:**

- [ ] `src/functions/src/lib/assertAllowlisted.ts`: `assertAllowlisted(email): Promise<void>` normaliza `email.trim().toLowerCase()`, lee `allowlist/{normalized}` (Admin SDK) y lanza `HttpsError('permission-denied', ...)` si no existe.
- [ ] `saveApiKey` y `deleteApiKey` llaman `requireVerified(request)` y luego `await assertAllowlisted(request.auth.token.email)`. `embedQuery` usa **solo** `requireVerified` (F1) — sin allowlist (ver Notas).
- [ ] Callable `checkAllowlist` (en `src/functions/src/auth/checkAllowlist.ts`, exportado en `index.ts`): recibe `{ email }`, normaliza, retorna `{ allowed: boolean }`. **Sin** `request.auth` requerido (corre pre-cuenta para email/pw).
- [ ] `userCountTriggers.ts` **NO se modifica** (queda como F47: `increment(±1)` incondicional). Las cuentas no-allowlisted quedan inertes vía rules (F4), no se borran (ver D4).
- [ ] Verificable: `saveApiKey`/`deleteApiKey` con email allowlisted+verificado proceden; con email no-allowlisted responden `permission-denied`. `embedQuery` procede con cualquier usuario verificado (allowlist no aplica). `checkAllowlist({email})` retorna `{allowed:true/false}` correcto.

**Archivos a crear/modificar:**

- `src/functions/src/lib/assertAllowlisted.ts` — nuevo guard.
- `src/functions/src/auth/checkAllowlist.ts` — nuevo callable.
- `src/functions/src/settings/saveApiKey.ts`, `deleteApiKey.ts` — sumar `assertAllowlisted` (NO `embedQuery`).
- `src/functions/src/index.ts` — exportar `checkAllowlist`.

**Notas:** `embedQuery` NO lleva `assertAllowlisted`: para abusarlo ya hay que estar verificado + logueado, y `requireVerified` (F1) + `maxInstances` (F2) cubren el riesgo de costo (A-4); un read de allowlist por cada búsqueda semántica es overhead recurrente injustificado (riesgo residual acotado: una cuenta verificada no-allowlisted creada por bypass del cliente podría gastar la key OpenAI, limitado por `maxInstances`). Las cuentas no-allowlisted quedan **inertes** (neutralizadas por las rules de F4); no se borran y `onUserCreated` no se modifica (ver D4). `checkAllowlist` es un endpoint **público** (corre pre-cuenta, sin `request.auth`) que revela membresía → **oráculo de enumeración uno-a-uno**, aceptado para la beta (el daño —revelar quién está invitado— es bajo). El booleano `{allowed}` ES la fuga: un mensaje genérico NO lo mitiga; la única mitigación real (App Check / rate-limit) va como **fast-follow** con A-3, no en este SPEC. `maxInstances` chico en `checkAllowlist` (p. ej. 5) es solo límite de costo/concurrencia.

---

### F6 — Allowlist UX cliente + normalización de email (A-2)

**Qué:** El usuario allowlisted entra sin fricción; el no-allowlisted recibe un mensaje claro y **no** queda con cuenta usable. Email/password: pre-check vía `checkAllowlist` ANTES de crear la cuenta. Google: check POST-auth (el email solo existe tras autenticar) → `signOut` inmediato + mensaje. El backstop real son las rules (F4); esto es solo UX. Normalización de email consistente en todos los puntos cliente.

**Criterio de done:**

- [ ] `SignUpForm` (`:54`): tras `validate()` y antes de `signUpWithEmail`, llama `checkAllowlist({ email: normalized })`; si `!allowed`, muestra el mensaje de rechazo y **no** crea cuenta.
- [ ] Email normalizado `.trim().toLowerCase()` antes del pre-check y antes de `signUpWithEmail`/`signInWithEmail` (`SignUpForm:54`, `SignInForm:25`, o centralizado en `useAuth`).
- [ ] Google: tras `signIn()` exitoso, si el `user.email` (normalizado) no está allowlisted → `signOut()` inmediato + mensaje. Lógica en `useAuth.signIn` o en el handler de `GoogleSignInButton` (`:18`).
- [ ] `authErrors.ts` mapea un código/estado de "email no autorizado" a un mensaje claro en español (p. ej. `'Este email no está en la lista de la beta. Escribinos para sumarte.'`), usado por `SignUpForm` (`:58`) y el flujo Google (`GoogleSignInButton:21`).
- [ ] Verificable manual: signup email/pw con email fuera de allowlist → no se crea cuenta, mensaje claro. Login Google con cuenta fuera de allowlist → sesión cerrada de inmediato, mensaje claro, sin acceso a la app.

**Archivos a crear/modificar:**

- `src/lib/apiKeys.ts`/nuevo `src/lib/allowlist.ts` — wrapper `httpsCallable('checkAllowlist')` (módulo cliente).
- `src/components/auth/SignUpForm.tsx` — pre-check + normalización (`:54`, `:75`).
- `src/components/auth/SignInForm.tsx` — normalización (`:25`, `:46`).
- `src/hooks/useAuth.ts` — normalización en `signInWithEmail`/`signUpWithEmail` (`:60-90`) y post-auth check en `signIn` (`:50-58`).
- `src/components/auth/GoogleSignInButton.tsx` — manejo del rechazo post-auth (`:18-22`).
- `src/lib/authErrors.ts` — mensaje "email no autorizado".

**Notas:** Helper de normalización reusable (`normalizeEmail(email) => email.trim().toLowerCase()`) — candidato a función pura testeable. El pre-check email/pw evita crear la cuenta; el path Google no puede (Firebase crea el user en `signInWithCredential`), así que esa cuenta queda **inerte** (las rules de F4 la neutralizan), no se borra (ver D4) — el `signOut` solo cierra la sesión local. Mantener el `SignupCapacityGate` donde está (envuelve solo `SignUpForm`, `LoginCard:72-74`); el allowlist es ortogonal al capacity.

---

### F7 — BYOK crypto: AAD=uid + `keyVersion` (K-2 + K-3)

**Qué:** Atar el ciphertext al `uid` con AAD (un ciphertext deja de ser portable entre usuarios bajo la misma master key) y agregar un discriminador `keyVersion`/`scheme` al doc cifrado, leído por `decryptSecret`, para habilitar rotación/KMS futuras. Aplicar en la **misma pasada** que F1.

**Criterio de done:**

- [ ] `encryptSecret(plaintext, masterKeyB64, aad)` llama `cipher.setAAD(Buffer.from(aad))`; `decryptSecret(payload, masterKeyB64, aad)` llama `decipher.setAAD(Buffer.from(aad))` (`crypto.ts:25-49`).
- [ ] `saveApiKey` pasa `request.auth.uid` como AAD al cifrar (`:58`); `getUserAnthropicKey`/`invalidateUserAnthropicKey` pasan `userId` al descifrar (`getUserAnthropicKey.ts:15-18`).
- [ ] El doc en `userSecrets/{uid}/keys/{provider}` persiste `keyVersion: 1` (o `scheme: 'aes-256-gcm-aad-v1'`); `decryptSecret` lo exige (sin fallback v0 — ver backward-compat).
- [ ] `crypto.test.ts` suma: round-trip con AAD correcto; **falla** (lanza) al descifrar con AAD de otro uid; **falla** con `keyVersion` ausente/desconocido.
- [ ] **Pre-release:** borrar todos los docs de `userSecrets/` (no hay keys de prod aún — beta sin abrir; cuentas `secondmindtest` se borran igual). El dev re-ingresa su key Anthropic una vez post-deploy.

**Archivos a modificar:**

- `src/functions/src/lib/crypto.ts` — AAD en encrypt/decrypt, `keyVersion` en el tipo `EncryptedSecret` (`:11-15`).
- `src/functions/src/settings/saveApiKey.ts` — pasar uid como AAD + escribir `keyVersion` (`:58`, `:64-68`).
- `src/functions/src/lib/getUserAnthropicKey.ts` — pasar uid como AAD en ambas funciones (`:15-18`, `:25-35`).
- `src/functions/src/lib/crypto.test.ts` — tests de AAD + keyVersion.

**Notas:** Backward-compat resuelta vía **wipe** (no se mantiene un decrypt v0 sin AAD): más limpio, sin doble-path cripto, y honesto dado que no hay keys de producción. AAD reduce portabilidad pero NO el blast-radius de un leak de la master key — eso es KMS (K-1, diferido).

---

## Orden de implementación

1. **F1 + F7** → fundación server-side, misma pasada (instrucción del audit). F1 es bloqueante; F7 no depende de nada.
2. **F2** y **F3** → triviales e independientes; en paralelo con lo anterior.
3. **F4** → storage + rules del allowlist; fundación del gate.
4. **F5** → CFs del allowlist; depende de **F4** (storage) y **F1** (los guards de callable componen `requireVerified` + `assertAllowlisted`).
5. **F6** → UX cliente; depende de **F5** (callable `checkAllowlist`) y **F4** (rules como backstop).

> Deploy (orden crítico): **seedear la allowlist** (email del dev + toda cuenta activa que deba sobrevivir) **ANTES del `deploy:rules` (F4)** — el `&& exists(allowlist/...)` bloquea a TODA cuenta existente no-allowlisted apenas se deploya (ver Gotchas: auto-lockout). Luego `deploy:functions` (F1/F2/F5/F7) + `deploy:rules` (F4); hosting (F3/F6) al final. El wipe de `userSecrets/` (F7) va inmediatamente antes del `deploy:functions`.

---

## Normalización de email (resuelto)

Punto crítico: **las Firestore rules no tienen `toLowerCase()`**. Estrategia:

- **Seed (manual):** los doc ID de `allowlist/{email}` se guardan **lowercase + trim** siempre.
- **Server (JS):** `assertAllowlisted`, `checkAllowlist` y `onUserCreated` normalizan con `email.trim().toLowerCase()` antes del lookup → robusto.
- **Cliente (JS):** `normalizeEmail()` antes del pre-check y antes de `createUser`/`signIn` → robusto.
- **Rules:** `exists(/databases/$(database)/documents/allowlist/$(request.auth.token.email))` asume que `request.auth.token.email` ya viene **lowercase** (Firebase normaliza el email de cuentas email/password; Google entrega lowercase). Si un provider entregara mixed-case, el `exists()` falla → **fail-closed** (deny). Es la dirección segura: un usuario legítimo denegado es recuperable (re-seed con el casing exacto); un ilegítimo admitido no.

**`onUserCreated` con cuentas no-allowlisted (resuelto):** **no se modifica** — sigue como F47 (`increment(±1)` incondicional). Las cuentas no-allowlisted quedan **inertes**: las rules de F4 las neutralizan (no leen ni escriben) y el path Google las expulsa de la sesión con `signOut`; **no se borran**. `config/app.userCount` queda como **métrica aproximada** (cuenta cuentas creadas, incluidas inertes; con allowlist ≤100 el ruido es bajo) — la allowlist es el control de acceso real. No se rediseña ni se gatea el counter (el clamp de A-6 es opcional, fuera de scope). Razón: borrar el orphan dispararía `onUserDeleted` → `increment(-1)` sobre un user nunca contado → counter desincronizado/negativo; al no borrar, ese bug no existe.

---

## Decisiones clave

| #   | Decisión                                                                         | Razón                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Allowlist en colección top-level deny-all, no en `config/app`                    | `config/app` es read-público (capacity) → expondría los ~100 emails como PII. Top-level con regla propia, leída solo server-side (patrón `userSecrets/` de F48 D5).                                                                                                                                                                                                     |
| D2  | Enforcement AND (rules + guard de callable), nunca OR                            | Las rules son aditivas: un OR abriría de más. El allowlist se concatena con AND a la condición C1 existente.                                                                                                                                                                                                                                                            |
| D3  | Pre-check email/pw vía callable `checkAllowlist`; Google post-auth + signOut     | El cliente no puede leer `allowlist/` (deny-all) → un callable es el único canal. Email/pw permite pre-check (no crea cuenta); Google entrega el email solo post-`signInWithCredential` → check + signOut (la cuenta queda inerte, no se borra). `checkAllowlist` es público → oráculo de enumeración aceptado para la beta (mitigación real = App Check, fast-follow). |
| D4  | `onUserCreated` NO se toca; cuentas no-allowlisted quedan inertes                | Borrar el orphan dispararía `onUserDeleted` → `increment(-1)` sobre un user nunca contado → counter desincronizado/negativo. Al no borrar, ese bug no existe. Las rules de F4 neutralizan a las inertes; el counter queda como métrica aproximada (no es el control de acceso).                                                                                         |
| D5  | Crypto backward-compat vía wipe de `userSecrets/`, sin decrypt v0                | No hay keys de prod (beta sin abrir); las de testing se borran igual. Evita un doble-path cripto frágil. El dev re-ingresa su key una vez.                                                                                                                                                                                                                              |
| D6  | `requireVerified` sync (token) + `assertAllowlisted` async (Firestore) separados | Traza A-1 y A-2 como unidades distintas; el guard de callable las compone. `requireVerified` no paga un read; `assertAllowlisted` sí (un `exists` por invocación).                                                                                                                                                                                                      |

---

## Plan de testing

- **`tsc --noEmit`** por área: `cd src/functions && npx tsc --noEmit` (F1/F2/F5/F7) y `npm run build` raíz (F3/F6).
- **`npm run lint`** completo antes de cerrar (el hook `--fix` no cubre reglas no-auto-fixables).
- **Tests de función pura (Vitest)** donde lo amerita:
  - `crypto.test.ts`: AAD round-trip OK, decrypt con AAD de otro uid lanza, `keyVersion` ausente lanza (F7).
  - `authErrors.test.ts`: `user-not-found` en `signin` === `wrong-password` (F3); mensaje "email no autorizado" (F6).
  - `normalizeEmail()` si se extrae como helper: trim + lowercase + idempotencia (F6).
- **Validación manual (sin E2E automation — single-dev, YAGNI):**
  - [ ] Callable con token no-verificado → `permission-denied` (F1).
  - [ ] Rules: usuario verificado no-allowlisted no puede leer/escribir `users/**` (simulador) (F4).
  - [ ] Signup email/pw fuera de allowlist → no crea cuenta + mensaje (F6).
  - [ ] `saveApiKey`/`deleteApiKey` con email no-allowlisted → `permission-denied`; `embedQuery` procede con verificado (sin allowlist) (F5).
  - [ ] Login Google fuera de allowlist → signOut inmediato + mensaje; la cuenta queda sin acceso vía rules (inerte, no borrada) y el counter no se rompe (F4/F6).
  - [ ] Usuario allowlisted: flujo completo email/pw y Google sin fricción.
  - [ ] Tras wipe + deploy: re-ingreso de key Anthropic funciona, generación IA opera (F7).
  - [ ] EEP confirmado activo en consola (F3).

---

## Fuera de scope (diferido post-beta)

Listado explícito de lo que **NO** entra en v0.5.0 (del audit, severidad ≤ Media o esfuerzo alto):

- **A-3** — App Check completo (Tauri/extension requieren providers custom), **incluyendo App Check en `checkAllowlist`** (cierra el oráculo de enumeración de la allowlist) y en el resto de callables. Fast-follow; `maxInstances` (F2) es solo límite de costo interino, no cierra el oráculo.
- **K-1** — Envelope encryption con Cloud KMS (blast-radius de la master key). AAD (F7) no lo resuelve; KMS sí.
- **A-7** (C4) — Idempotencia del counter ante doble-evento. **A-6** — clamp del counter a 0 (opcional).
- **X-3** — CSP + `X-Frame-Options` en hosting web (anti-XSS/clickjacking).
- **A-8** password policy en código, **A-9** persistencia `indexedDBLocalPersistence`, **A-10/A-11** rate-limit propio resend/brute-force, **A-12** validación de shape en `users/**`, **A-13a/b/c** hardening OAuth (loopback path, client_secret type, nonce), **K-5** try interno en invalidación, **K-6** cap de longitud en `saveApiKey`, **X-1** `MAX_CONTENT_CHARS` en `generateEmbedding`, **X-2** re-validación server-side del `tool_use.input`.

---

## Gotchas / riesgos consolidados

- **⚠️ Auto-lockout en el deploy de rules (crítico)** → apenas se deploya F4 con `&& exists(allowlist/...)`, TODA cuenta existente no-allowlisted queda bloqueada (no lee ni escribe nada) — **incluidas la del dev y las de prueba**. Seedear la allowlist con el email del dev + toda cuenta activa que deba sobrevivir **ANTES** del `deploy:rules` (no "antes del login": antes de las rules). Ver § Orden de implementación.
- **Rules sin `toLowerCase`** → seed lowercased + normalización JS en todos los puntos server/cliente + asunción de `token.email` lowercase con fail-closed (ver § Normalización).
- **Aditividad OR de las rules** → el allowlist va en **AND**, nunca OR (D2). Revisar que el `exists()` se concatene a la condición existente, no en un `match` separado permisivo.
- **`exists()` en rules** = un read extra por evaluación (costo + latencia). Aceptable a escala beta.
- **Backward-compat de decrypt** → wipe de `userSecrets/` pre-release (D5); el dev re-ingresa su key una vez. Sin este wipe, los docs viejos (sin AAD/keyVersion) fallarían al descifrar.
- **Asimetría Google vs email/pw** → email/pw pre-check (no crea cuenta); Google crea el user antes del check → queda **inerte** (rules de F4 lo neutralizan) + `signOut` local; **no se borra** (`onUserCreated` sin cambios — ver D4). El counter cuenta esa cuenta inerte (métrica aproximada).
- **`checkAllowlist` = oráculo de enumeración** público (sin `request.auth`): devuelve `{allowed:bool}` → el booleano ES la fuga; un mensaje genérico NO mitiga. **Aceptado para la beta** (revelar quién está invitado es daño bajo). Mitigación real = App Check / rate-limit, **fast-follow con A-3** (no en este SPEC). `maxInstances` solo acota costo.
- **EEP debe estar ON** (manual) para que F3 y el mensaje cross-provider de F47 se sostengan.

---

## Checklist de completado

Al terminar v0.5.0, TODAS deben ser verdaderas:

- [ ] `npm run build` y `cd src/functions && npx tsc --noEmit` sin errores; `npm run lint` limpio.
- [ ] Los 3 callables rechazan tokens no-verificados (`permission-denied`) — F1.
- [ ] `embedQuery`/`saveApiKey` con `maxInstances` aplicado — F2.
- [ ] Login no distingue `user-not-found` de password incorrecto + EEP confirmado — F3.
- [ ] Rules deniegan `users/**` a usuarios verificados no-allowlisted (simulador) — F4.
- [ ] `checkAllowlist` + `assertAllowlisted` (en `saveApiKey`/`deleteApiKey`) desplegados y verificados; `userCountTriggers.ts` sin cambios — F5.
- [ ] Signup/login fuera de allowlist rechazado con mensaje claro y sin cuenta usable — F6.
- [ ] `decryptSecret` exige `keyVersion` + AAD; tests de AAD cross-uid y keyVersion en verde; `userSecrets/` wipeado pre-release — F7.
- [ ] Allowlist seedeada (lowercase) con el email del dev + cuentas activas **ANTES** del `deploy:rules` de F4, más los emails de la beta.

---

## Siguiente fase

Habilita la apertura de la beta de 100 usuarios. Fast-follow recomendado: A-3 (App Check, empezando por web) sobre los callables ya guardados, y luego K-1 (KMS) cuando el volumen lo justifique.
