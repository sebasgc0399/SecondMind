# SPEC — Feature 51: Cerrar el oráculo de allowlist + hardening de `embedQuery`

> **Estado:** 📋 Planificado — pendiente de revisión e implementación.
> **Rama:** `feat/cerrar-oraculo-allowlist` > **Depende de:** F50 (security hardening — allowlist, `requireVerified`, `assertAllowlisted`, anti-enumeración), F47 (auth Google + capacity gate), F48 (BYOK crypto).
> **Origen:** ítem **A-3** de la auditoría `AUDIT-auth-keys-v0.5` (`Spec/audits/AUDIT-auth-keys-v0.5.md`). A-3 estaba anotado como "App Check (fast-follow)"; tras el discovery de App Check (esta sesión) se **reformula**: App Check queda **descartado para la beta** y A-3 pasa a "cerrar el oráculo post-auth + hardening de `embedQuery`".

## Por qué NO App Check (resumen del discovery)

App Check resolvería el oráculo solo de forma **probabilística** (reCAPTCHA es score-based) y **no cubre el vector real de `embedQuery`** (un usuario logueado abusando desde la app genuina). Además **rompe Tauri y la Chrome extension**: ninguno tiene provider nativo (origin `tauri://localhost` no registrable en reCAPTCHA; CSP de Manifest V3 bloquea los scripts remotos de reCAPTCHA) → requerirían un _custom provider_ con backend propio y attestation débil. Y en web introduce ~5% de falsos bloqueos a usuarios legítimos. **Reevaluar post-beta** si el tráfico se vuelve mayoritariamente web/móvil.

## Objetivo

Eliminar el **oráculo de enumeración de emails** (la callable pública `checkAllowlist`, que revela membresía a cualquiera con un email arbitrario) sin debilitar el control de acceso, y **acotar el abuso de costo** de `embedQuery` (callable que consume la OpenAI key compartida del operador). El backstop de seguridad real —las security rules `users/**` que exigen `owner + verified + exists(allowlist/{email})`— **no cambia**; este SPEC cierra las superficies que lo rodean.

## Contexto / punto de partida (verificado en código esta sesión)

- **El oráculo es `checkAllowlist`** (`src/functions/src/auth/checkAllowlist.ts`): callable **pública** (sin `request.auth`) que recibe un `email` arbitrario y devuelve `{ allowed: boolean }`. `maxInstances:5` acota costo, **no** el oráculo. Dos call-sites:
  - `SignUpForm.tsx:60` — pre-check email/pw **antes** de crear la cuenta.
  - `useAuth.signIn:66` — gate Google **post-auth** (`signOut` si no autorizado).
- **El path Google ya es post-auth** y **la Chrome extension ya opera con el modelo destino** (`extension/src/lib/auth.ts` nunca llama a `checkAllowlist`; su única protección es que `saveToInbox` falla por rules si el email no está en allowlist). Es decir: **solo email/pw tiene el pre-check pre-auth**; cerrarlo es hacer que email/pw converja al patrón que Google y la extension ya usan.
- **El counter del capacity gate es aproximado por diseño (D4 de F50):** `onUserCreated` (`userCountTriggers.ts`) incrementa `config/app.userCount` **incondicionalmente**; las cuentas no-allowlisted quedan **inertes** (neutralizadas por rules) y no se borran.
- **`embedQuery`** (`src/functions/src/search/embedQuery.ts`): hoy tiene `requireVerified` + `maxInstances:5` + input `≤500 chars` + trim/type-check. **NO** tiene `assertAllowlisted` (omitido a propósito en F50 para ahorrar un read por búsqueda) → un usuario _verificado pero no-allowlisted_ puede gastar la OpenAI compartida por endpoint directo. Sin rate-limit por usuario.
- **Degradado de búsqueda YA existe (verificado):** `useHybridSearch.ts:65-97` corre el embedding en un `try/catch` con debounce; `keywordResults` (Orama vía `useNoteSearch`) es la base independiente y siempre presente. Cualquier throw de `embedQueryText` cae en el `catch` (`:92`) → keyword-only sin romper UI. `embedQueryText` lo consume **solo** `useHybridSearch`.

## Decisiones cerradas (con Sebastián, esta sesión)

| #      | Decisión                                                                                                  | Detalle                                                                                                                                                                                                                                                                                                                                                             |
| ------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Variante B** — callable **autenticada** `checkMyAccess`                                                 | Lee el email del propio token (`request.auth.token.email`), **ignora cualquier input**. Gate post-auth **unificado** para email/pw y Google. Mata el oráculo: solo podés preguntar "¿yo tengo acceso?", no enumerar terceros. (Variante D —solo rules, sin callable— descartada: peor UX email/pw + más scope, retorno marginal.)                                   |
| **D2** | `checkMyAccess` **NO exige `email_verified`**                                                             | Best-effort UX (funciona para email/pw recién creado, aún sin verificar → mensaje inmediato). El backstop real son las rules, que **sí** exigen verified + allowlist para todo dato. Vector residual aceptado: crear una cuenta Auth para consultar un email es caro/ruidoso vs. el oráculo público actual.                                                         |
| **D3** | **Counter: (i) D4 as-is**                                                                                 | `onUserCreated`/`userCountTriggers.ts` **no se tocan**. El counter sigue siendo métrica aproximada; las huérfanas (ahora también de email/pw) quedan inertes por rules. **Anotado como hardening futuro (ii):** endurecer `onUserCreated` a contar solo allowlisted **si se abren signups públicos** (reintroduce la race que D4 evitó → requiere flag persistido). |
| **D4** | **Copy genérico** que NO confirma membresía                                                               | "Tu cuenta todavía no tiene acceso a la beta." **Sin canal de contacto por ahora** (Sebastián define; probablemente sin email hasta que exista el **formulario público de solicitud**, feature aparte). El copy vive en la constante exportada `BETA_NO_ACCESS_MESSAGE`, fácil de editar para ese cambio futuro.                                                    |
| **D5** | **`embedQuery`**: rate-limit `60/min + 1000/día` por uid (tunable) + `assertAllowlisted` + reforzar input | Helper `rateLimit.ts` + colección top-level `rateLimits/` deny-all + TTL para auto-purga. Límites como punto de partida, ajustables.                                                                                                                                                                                                                                |

---

## Sub-features

### Frente A — Cerrar el oráculo

#### F1 — `checkAllowlist` (público) → `checkMyAccess` (autenticado)

- **Qué:** reescribir la callable: quitar el parámetro `email`; exigir `request.auth` (lanza `unauthenticated` si falta, **sin** exigir verified — D2); leer `allowlist/{email}` usando `request.auth.token.email` vía `isAllowlisted` (que ya normaliza `.trim().toLowerCase()`); devolver `{ authorized: boolean }`. Renombrar el símbolo y el id de la función a `checkMyAccess`.
- **Criterio de done (verificable):**
  - Invocada **sin sesión** → `HttpsError('unauthenticated')`.
  - Invocada con sesión cuyo `token.email` ∈ allowlist → `{ authorized: true }`.
  - Con sesión cuyo email ∉ allowlist → `{ authorized: false }`.
  - Pasar un `email` ajeno en `data` → **ignorado** (usa `token.email`). No queda **ninguna** callable que acepte un email arbitrario.
- **Archivos:** `src/functions/src/auth/checkAllowlist.ts` → renombrar a `checkMyAccess.ts`; `src/functions/src/index.ts` (export). Reusa `isAllowlisted` de `lib/assertAllowlisted.ts` (sin cambios).
- **Nota de deploy:** la función vieja `checkAllowlist` queda colgada en GCP tras el rename → borrarla con `firebase functions:delete checkAllowlist` **después** del deploy de la nueva (ver Orden de deploy).

#### F2 — Wrapper cliente `checkMyAccess()`

- **Qué:** en `src/lib/allowlist.ts`, reemplazar `checkAllowlist(email)` por `checkMyAccess(): Promise<boolean>` sin args, que invoca la callable `checkMyAccess` y devuelve `result.data.authorized`. **No** atrapar el error acá: dejar que el throw (red/callable) se propague para que F3 lo distinga de `authorized === false`.
- **Criterio de done:** `tsc --noEmit` verde; **cero** referencias a `checkAllowlist(` o a pasar email al callable en todo `src/`. Un fallo de la callable **propaga** (no devuelve `false`).
- **Archivos:** `src/lib/allowlist.ts`.

#### F3 — Gate post-auth unificado en `useAuth` (con manejo de fallo de verificación)

- **Comportamiento HOY (verificado):** en `useAuth.signIn`, `await checkAllowlist(normalizeEmail(email))` se evalúa **dentro** del `if`. Si la callable **lanza** (red / `functions/unavailable` / `internal`), la excepción se propaga **antes** de evaluar el `if` → **NO** corre `firebaseSignOut` ni el `throw 'allowlist-not-authorized'`; el error real sube al caller y cae en el genérico `'Algo salió mal'` de `mapAuthError`, dejando al usuario **autenticado pero sin navegar** (estado ambiguo). O sea: hoy un fallo de red **no** echa al usuario, pero **por accidente del control de flujo, no por diseño**, y con el mensaje equivocado.
- **Qué (nuevo diseño — formaliza la distinción):** en ambos paths, envolver `checkMyAccess()` en `try/catch` y distinguir **tres** resultados:
  1. `authorized === true` → continuar (navegar / enviar verificación).
  2. `authorized === false` → `firebaseSignOut(auth)` + `throw { code: 'allowlist-not-authorized' }` (mensaje genérico de F4).
  3. **`checkMyAccess()` lanza** (red / callable no disponible) → **NO `signOut`** + `throw { code: 'access-check-unavailable' }`. No echamos al usuario: no sabemos si está autorizado y las rules son el backstop de datos. Mensaje distinto, invita a reintentar.
  - `useAuth.signUpWithEmail`: tras `createUserWithEmailAndPassword`, aplicar la distinción **antes** de `sendEmailVerification`. Caso (2): `signOut` + throw, **sin** enviar verificación. Caso (3): **sin** `signOut`, throw `access-check-unavailable` (la cuenta queda; se revalida en el próximo login). Caso (1): enviar verificación + navegar.
  - `useAuth.signIn` (Google): reemplazar `checkAllowlist(normalizeEmail(email))` por la misma estructura `try/catch` sobre `checkMyAccess()`.
  - `SignUpForm.tsx`: **quitar** el pre-check (líneas ~57-64) y el import de `checkAllowlist`. El `catch` del form mapea los códigos vía `mapAuthError` → error inline.
- **Criterio de done (verificable, E2E):**
  - email/pw **no-allowlisted** (red OK): cuenta creada (huérfana inerte), `signOut` inmediato, error inline genérico (F4), **NO** llega email de verificación.
  - email/pw **allowlisted**: flujo normal (verificación enviada, navega a `/`).
  - Google **no-allowlisted**: `signOut` + error inline genérico.
  - **Fallo de red/callable en `checkMyAccess` (ambos paths):** el usuario **NO** es deslogueado; se propaga `access-check-unavailable` → mensaje distinto ("No pudimos verificar tu acceso. Reintentá."), **nunca** el genérico de no-autorizado ni un `signOut`. Verificable simulando la callable caída (offline / emulador apagado).
  - Las 3 plataformas no-extension (web/Tauri/Android) comparten el gate vía `useAuth`. `tsc` + `npm run lint` verdes.
- **Archivos:** `src/hooks/useAuth.ts`, `src/components/auth/SignUpForm.tsx`. (El código `access-check-unavailable` se mapea en `authErrors.ts` — ver F4.)

#### F4 — Copys genéricos en punto único editable

- **Qué:** en `src/lib/authErrors.ts`:
  - Extraer la constante exportada **`BETA_NO_ACCESS_MESSAGE`** (copy genérico de no-autorizado), retornada por el case `allowlist-not-authorized`.
  - Agregar el case **`access-check-unavailable`** (de F3) con un mensaje distinto que invite a reintentar, **sin** echar al usuario **ni** confirmar membresía.
  - Comentario que marque el punto de edición de `BETA_NO_ACCESS_MESSAGE` para cuando exista el formulario público de solicitud.
- **Copys propuestos:**
  - `BETA_NO_ACCESS_MESSAGE` = `Tu cuenta todavía no tiene acceso a la beta.` — **sin email/canal por ahora** (Sebastián define el texto final; probablemente sin canal hasta el formulario público). No menciona "lista"/"allowlist"/"invitado".
  - `access-check-unavailable` = `No pudimos verificar tu acceso. Reintentá en un momento.`
- **Criterio de done:** `BETA_NO_ACCESS_MESSAGE` **no** menciona lista/allowlist/invitado **ni** incluye email/canal; existe **un solo** punto de edición (la constante); el case `access-check-unavailable` está mapeado a un mensaje distinto; `authErrors.test.ts` actualizado para ambos strings.
- **Archivos:** `src/lib/authErrors.ts`, `src/lib/authErrors.test.ts`.

> **Sin cambios (anotado):** `firestore.rules` § `users/**` y § `allowlist/` (backstop intacto) y `userCountTriggers.ts` (D3 = D4 as-is de F50).

### Frente B — Email Enumeration Protection (manual, operador)

#### F5 — Activar EEP en Firebase Console _(MANUAL — sin código)_

- **Qué cubre:** protege los **endpoints nativos de Firebase Auth** (`createAuthUri`/`fetchSignInMethodsForEmail` y mensajes de error de signup/signin/reset) para que no revelen si un email tiene cuenta. **Complementario** a F1-F4 (que cierran nuestra callable custom), no redundante. Refuerza F3 de F50 (anti-enumeración client-side): con EEP el backend colapsa `wrong-password`/`user-not-found` en `invalid-credential`, lo que `authErrors.ts:16` ya hace en cliente → no rompe nada.
- **Pasos:** Firebase Console → **Authentication → Settings → User actions** → activar **Email enumeration protection**. (Opcional: bajar la cuota default de `identitytoolkit.googleapis.com` en GCP.)
- **Criterio de done:** toggle **ON** confirmado en Console. Costo $0.

### Frente C — Hardening de `embedQuery`

#### F6 — `assertAllowlisted` + reforzar input en `embedQuery`

- **Qué:** tras `requireVerified`, agregar `await assertAllowlisted(request.auth.token.email)` (cierra el hueco: verificado-pero-no-allowlisted ya no gasta OpenAI). Reforzar input: bajar `MAX_TEXT_LENGTH` 500 → **300** (es una _query_ de búsqueda, no contenido).
- **Criterio de done (verificable):**
  - Usuario verificado **no-allowlisted** llamando `embedQuery` directo → `permission-denied`.
  - Usuario allowlisted → ok.
  - Texto > 300 chars → `invalid-argument`.
- **Archivos:** `src/functions/src/search/embedQuery.ts`. (Reusa `assertAllowlisted` de `lib/assertAllowlisted.ts`.)

#### F7 — Helper `rateLimit.ts` + colección `rateLimits/` deny-all + TTL

- **Qué:** nuevo `src/functions/src/lib/rateLimit.ts` con `enforceRateLimit(uid, key, { perMinute, perDay })`:
  - Doc por ventana en colección top-level `rateLimits/` (propuesta: `rateLimits/{uid}__{key}__min__{minuteSlot}` y `...__day__{daySlot}`, con `count` + `expireAt`). `minuteSlot = floor(now/60000)`, `daySlot = floor(now/86400000)`.
  - `increment` atómico del `count`; si supera el umbral → `HttpsError('resource-exhausted')`. (Contar también los rechazados es aceptable para rate-limiting.)
  - `expireAt` (timestamp) para que la **TTL policy** de Firestore auto-purgue los slots viejos.
  - Regla en `firestore.rules`: `match /rateLimits/{document=**} { allow read, write: if false; }` (Admin SDK bypassa; patrón `allowlist/`/`userSecrets/`).
  - **TTL policy:** crear policy sobre el campo `expireAt` de la colección `rateLimits` (gcloud/Console — semi-manual, ver Pasos manuales).
- **Criterio de done:** test unit del helper (umbral alcanzado → throw; ventana nueva → reset; min y día independientes); rule deny-all cubierta por `firestore.rules.test.ts`; los docs creados llevan `expireAt`.
- **Archivos:** `src/functions/src/lib/rateLimit.ts`, `src/functions/src/lib/rateLimit.test.ts`, `firestore.rules`, `firestore.rules.test.ts`.

#### F8 — Aplicar rate-limit a `embedQuery` + degradado keyword-only (verificado)

- **Qué:** en `embedQuery`, tras `assertAllowlisted`, `await enforceRateLimit(userId, 'embedQuery', { perMinute: 60, perDay: 1000 })`. Límites tunables (constantes nombradas).
- **Degradado en cliente — YA EXISTE, sin cambios (verificado):** `useHybridSearch.ts:65-97` corre el embedding semántico dentro de un `try/catch` con debounce; `keywordResults` (Orama vía `useNoteSearch`) es la base **siempre presente** e independiente. Cualquier throw de `embedQueryText` —incluido el nuevo `resource-exhausted`— cae en el `catch` (`:92`): `setSemanticResults([])` + `setIsLoadingSemantic(false)`, **sin** setear error state ni romper la UI → la búsqueda sigue como **keyword-only**. Confirmado además que `embedQueryText` **solo** lo consume `useHybridSearch`. Por lo tanto **NO hay cambio de cliente requerido**; F8 solo verifica este comportamiento con el error real.
- **Criterio de done (verificable):**
  - La 61ª llamada dentro de un minuto → `resource-exhausted`; la 1001ª dentro de un día → `resource-exhausted`; al cambiar de ventana, el contador resetea.
  - Con `embedQuery` devolviendo `resource-exhausted`, la búsqueda **degrada a keyword-only** (resultados Orama presentes, panel semántico vacío) **sin** error visible ni UI rota — verificado contra `useHybridSearch.ts:92-96`, **sin tocar el cliente**.
  - _(Opcional, no requerido):_ convertir el `catch {}` silencioso de `useHybridSearch` en `catch (err) { console.warn(...) }` para trazar `resource-exhausted` en dev.
- **Archivos:** `src/functions/src/search/embedQuery.ts`. **Sin cambios** en `src/hooks/useHybridSearch.ts` / `src/lib/embeddings.ts` (solo verificación; el opcional de log es discrecional).

---

## Alcance de archivos

| Archivo                                                         | Cambio                                                       | Frente     |
| --------------------------------------------------------------- | ------------------------------------------------------------ | ---------- |
| `src/functions/src/auth/checkAllowlist.ts` → `checkMyAccess.ts` | Reescribir: autenticada, lee token, ignora input             | A (F1)     |
| `src/functions/src/index.ts`                                    | Export `checkMyAccess` (quitar `checkAllowlist`)             | A (F1)     |
| `src/lib/allowlist.ts`                                          | Wrapper `checkMyAccess()` sin args; propaga el error         | A (F2)     |
| `src/hooks/useAuth.ts`                                          | Gate post-auth en `signUpWithEmail` + `signIn`, con caso red | A (F3)     |
| `src/components/auth/SignUpForm.tsx`                            | Quitar pre-check pre-auth                                    | A (F3)     |
| `src/lib/authErrors.ts` (+`.test.ts`)                           | `BETA_NO_ACCESS_MESSAGE` + case `access-check-unavailable`   | A (F4)     |
| `src/functions/src/search/embedQuery.ts`                        | `assertAllowlisted` + input 300 + rate-limit                 | C (F6, F8) |
| `src/functions/src/lib/rateLimit.ts` (+`.test.ts`)              | Helper nuevo                                                 | C (F7)     |
| `firestore.rules` (+`.test.ts`)                                 | Regla deny-all `rateLimits/`                                 | C (F7)     |
| `src/hooks/useHybridSearch.ts` / `src/lib/embeddings.ts`        | **Verificar** degradado keyword-only (sin cambios esperados) | C (F8)     |
| — _(sin cambios)_                                               | `userCountTriggers.ts`, rules `users/**` y `allowlist/`      | —          |

**Pasos manuales (operador, fuera de código):** F5 (EEP toggle), F9 (budget alerts), TTL policy de `rateLimits` (F7), y `firebase functions:delete checkAllowlist` post-deploy (F1).

## Orden de implementación

1. **Frente A** (F1 → F2 → F3 → F4) — unidad coherente: cierra el oráculo.
2. **Frente C** (F6 → F7 → F8) — hardening `embedQuery`.
3. **F5 y F9** (manuales) — F5 idealmente junto/antes del deploy; F9 en cualquier momento.

## Orden de deploy (crítico)

1. `npm run deploy:functions` — crea `checkMyAccess`, `embedQuery` (con allowlist+rate-limit), helpers. _(La `checkAllowlist` vieja sigue viva → el hosting actual no se rompe durante la ventana.)_
2. `npm run deploy:rules` — regla deny-all `rateLimits/`.
3. **Crear TTL policy** sobre `rateLimits.expireAt` (gcloud/Console).
4. `npm run build && npm run deploy` — hosting que llama `checkMyAccess`.
5. `firebase functions:delete checkAllowlist` — borrar la función huérfana ya sin call-sites.
6. **F5** (EEP) y **F9** (budget) en Console.

> Tauri/Android: el cambio es 100% client-side compartido vía `useAuth` → entran en su próximo release nativo (sin divergencia de datos, igual que A1 de Clean Arch). No requieren build nativo en este SPEC.

## Trade-offs UX explícitos

- **email/pw:** el no-invitado ve el rechazo **después** de crear cuenta (huérfana inerte), no antes. Mismo mensaje para el usuario; deja una cuenta Auth muerta — **idéntico a lo que Google ya hace hoy**.
- **Counter / capacity gate:** se vuelve más aproximado (ahora también huérfanas email/pw). Riesgo de inflado de `userCount` → posible agotamiento del gate. Mitigación: gestión manual de `maxUsers` (beta cerrada); hardening (ii) anotado para signups públicos.
- **Búsqueda (`embedQuery`):** +1 read (allowlist) + 1-2 ops (rate-limit) por query. Imperceptible con el debounce de 500ms a escala ~100 usuarios.
- **Búsqueda degradada (rate-limit alcanzado):** la búsqueda cae a **keyword-only** (Orama) de forma transparente; el usuario no ve error, solo pierde el panel semántico temporalmente.
- **Fallo de verificación de acceso (red/callable caída):** el usuario **no** es echado (fail-open en UX, fail-closed en datos vía rules); ve "Reintentá" en vez del mensaje de no-autorizado.
- **Mensaje genérico:** no confirma membresía y **sin canal de contacto por ahora**; tono opaco. Se enriquecerá cuando exista el formulario público.
- **Límite de input 300 chars:** queries muy largas se rechazan (improbable en búsqueda real).

## Verificación E2E (al implementar)

- **Allowlisted (cuenta real de Sebastián, `gYPP7NIo5JanxIbPqMe6nC3SQfE3`):** login Google + email/pw funcionan; búsqueda semántica funciona. **NUNCA borrar/resetear sus datos.**
- **No-allowlisted:** crear una cuenta email/pw de prueba **descartable** (quedará huérfana inerte — aceptable) con un email **no** seedeado → verificar: cuenta creada, signOut inmediato, mensaje genérico, sin email de verificación, y `embedQuery` directo → `permission-denied`.
- **Fallo de verificación (red):** con la callable `checkMyAccess` caída (offline / emulador apagado), login Google y email/pw → el usuario **NO** es deslogueado, ve "No pudimos verificar tu acceso. Reintentá." (no el mensaje de no-autorizado).
- **Rate-limit + degradado:** disparar >60 `embedQuery`/min con la cuenta allowlisted → confirmar `resource-exhausted` y que la búsqueda sigue devolviendo resultados **keyword-only** sin UI rota.
- Dev server en background (`npm run dev`), `TaskStop` al terminar.

## Checklist de cierre (SDD step 8)

- [ ] F1-F4, F6-F8 implementadas + criterios verificados.
- [ ] F5 (EEP) y F9 (budget) ejecutados en Console; TTL policy creada.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` verdes (CI gate).
- [ ] `npm run test:rules` verde (regla `rateLimits/`).
- [ ] E2E allowlisted + no-allowlisted + fallo-de-red + rate-limit/degradado OK.
- [ ] Deploy ejecutado en el orden crítico; `checkAllowlist` vieja borrada.
- [ ] Commits atómicos Conventional (uno por sub-feature) + merge `--no-ff`.
- [ ] Escalación de gotchas (oráculo cerrado → actualizar/retirar el gotcha "checkAllowlist es oráculo" en `Spec/gotchas/cloud-functions-guards.md`; nuevo gotcha rate-limit si aplica).
- [ ] Convertir este SPEC a registro de implementación.

## Hardening futuro (anotado, fuera de scope)

- **(ii) Counter solo-allowlisted:** si se abren signups públicos, endurecer `onUserCreated` para contar solo cuentas allowlisted (cierra el inflado del capacity gate). Reintroduce la race de D4 (remover de allowlist + borrar cuenta → decrement sobre no-contado) → requiere flag persistido.
- **App Check:** reevaluar post-beta si el tráfico es mayoritariamente web/móvil (built-in providers web + Android; Tauri/extension seguirían necesitando custom provider).
- **Formulario público de solicitud de acceso:** feature aparte; al existir, actualizar `BETA_NO_ACCESS_MESSAGE` (F4) con el canal/enlace correspondiente.
