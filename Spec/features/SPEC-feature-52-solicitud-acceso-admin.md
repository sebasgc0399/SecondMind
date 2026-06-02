# SPEC — Feature 52: Formulario público de solicitud de acceso + gestión de allowlist (`/admin`)

> **Estado:** 📝 Planificado — pendiente de revisión e implementación. Sin código todavía.
> **Versión objetivo:** `0.4.2` — **feature independiente, NO abre la beta** (ver "Por qué 0.4.2").
> **Rama:** `feat/solicitud-acceso` → merge `--no-ff` a `main`.
> **Depende de:** F50 (allowlist `deny-all`, `isAllowlisted`, `assertAllowlisted`, patrón anti-enumeración), F51 (`checkMyAccess`, `BETA_NO_ACCESS_MESSAGE`, `rateLimit.ts` + colección `rateLimits/` + TTL), F47 (auth + capacity gate `config/app`).
> **Origen:** ítem "Formulario público de solicitud de acceso — feature aparte" anotado en SPEC-51 § Hardening futuro.

## Por qué 0.4.2 (y no 0.5.0)

Esto es **infraestructura de acceso**, no la apertura de la beta. Tras desplegarlo, la beta **sigue cerrada**: `checkMyAccess` + las rules `users/**` + `allowlist/` no cambian en absoluto. Lo único que se habilita es el ciclo **solicitar → aprobar uno a uno** sin tocar la Firebase Console. `0.5.0` se reserva para la **apertura real** (repo privado + checklist completo + signups de desconocidos a escala). Solo sería `0.5.0` si confirmáramos que no falta nada más para abrir — no es el caso.

## Objetivo

Reemplazar la gestión 100% manual de la allowlist (seedear `allowlist/{email}` a mano en la Console) por: (1) un **formulario público** donde quien quiere entrar deja su email → cae en una cola estructurada `accessRequests/`; y (2) una ruta **`/admin`** dentro de la app, gateada por uid, donde Sebastián ve la cola y **aprueba/rechaza** sin abrir la Console. El backstop de seguridad (rules `users/**`, `allowlist/` deny-all, `checkMyAccess`) **no cambia** — recolectar solicitudes ≠ consultar membresía.

## Contexto / punto de partida (verificado en código esta sesión)

- **`enforceRateLimit(uid, key, limits)`** (`src/functions/src/lib/rateLimit.ts`) **no está acoplado a uid**: el primer arg es un string arbitrario. Reutilizable pre-auth pasando un hash de IP como clave. Doc por ventana en `rateLimits/{clave}__{key}__min__{slot}` con `count` + `expireAt`; TTL ya configurada (F51).
- **App Check no existe** y fue descartado en F51, pero **ese precedente no aplica acá**: dos de las tres razones (rompe Tauri `tauri://localhost` y la extensión por CSP) son irrelevantes para un **formulario web público**. Queda como escalación documentada, **no** en el MVP (decisión D2).
- **`allowlist/{email}`** es `deny-all` write client-side (`firestore.rules:45-52`); la existencia del doc ES el flag, `{ addedAt }` opcional para auditoría. **Solo el Admin SDK escribe** → la aprobación obliga a una CF (no negociable sin debilitar A-2/A-3).
- **No existe concepto de "admin"** en el código. El modelo es **email-céntrico** (allowlist keyada por email, el gate lee `token.email`). Gate real del admin = comparar `token.email` server-side; gate de la ruta en cliente = uid (cosmético).
- **Router** (`src/app/router.tsx`, React Router v7 `createBrowserRouter`): **todo import estático, sin `lazy` hoy**. Rutas públicas (fuera del `Layout` que gatea anónimos a `/login`): `/login`, `/capture`, `/verify-email`. `/admin` será el **primer `React.lazy`**.
- **`BETA_NO_ACCESS_MESSAGE`** (`src/lib/authErrors.ts:12`) se muestra vía un store module-level (`loginError.ts`) que sobrevive el bounce `/login→/→/login` del `signOut` (F51). Gancho natural para linkear el formulario.

## Decisiones cerradas (con Sebastián, esta sesión)

| #      | Decisión                                                   | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Cola `accessRequests/` deny-all total + 3 callables**    | Submit, list y process pasan por CF (Admin SDK). `accessRequests/` queda `read, write: if false` igual que `allowlist/`/`userSecrets/`. La colección guarda emails = PII → merece el mismo trato. Modelo uniforme: **ninguna colección con PII es legible desde el cliente**. (Variante rules-first con read condicional por `token.email` descartada: hace PII client-readable + regla frágil ante la aditividad de rules — el gotcha del deny-all top-level.) |
| **D2** | **Anti-spam = rate-limit por IP**, sin captcha             | `submitAccessRequest` reusa `enforceRateLimit(ipHash, …)`. Frena el spam de **fuente única** (el realista para una beta de ~100). Turnstile/reCAPTCHA = escalación documentada si aparece abuso real; YAGNI para un vector que hoy no existe. Escritura directa cliente→Firestore **descartada** (sin freno real al spam, indefendible pre-auth público).                                                                                                       |
| **D3** | **El formulario NO puede ser un oráculo**                  | Respuesta **uniforme siempre**, pase lo que pase (email nuevo / duplicado / ya-allowlisted). Si deduplica, lee **`accessRequests/`, nunca `allowlist/`**, y **nunca** decide el mensaje según membresía. Es A-3 en otra piel.                                                                                                                                                                                                                                   |
| **D4** | **email normalizado = doc id** de `accessRequests/{email}` | `trim().toLowerCase()` (misma convención que `allowlist/`). Dedup natural sin segundo read y sin enumeración. La aprobación escribe `allowlist/{email}` donde `email === id`.                                                                                                                                                                                                                                                                                   |
| **D5** | **`/admin` = solo procesar la cola**                       | Ver pendientes, aprobar (→ allowlist) o rechazar. **Revocar acceso a alguien ya dentro se sigue haciendo a mano en Console** (borrar el doc — raro en beta). Listar `allowlist/` se descarta: re-expondría los ~100 emails que A-3 protegió.                                                                                                                                                                                                                    |
| **D6** | **Sin notificaciones por email**                           | Cero infra de envío. El operador revisa `/admin` cuando quiere; el solicitante reintenta el login y entra cuando fue aprobado. Copy del form **truthful** (no promete email — lección del fix `verify-email` de F51).                                                                                                                                                                                                                                           |
| **D7** | **`ADMIN_EMAIL` vía `defineSecret`**                       | No hardcodear el email admin (repo público; no señalar el target). Mismo patrón que `BYOK_MASTER_KEY`/`OPENAI_API_KEY`. Gate de ruta en cliente vía `VITE_ADMIN_UID` (env, cosmético).                                                                                                                                                                                                                                                                          |

---

## Sub-features

### Frente A — Backend (cola + callables)

#### F1 — Colección `accessRequests/` + regla `deny-all`

- **Qué:** agregar a `firestore.rules` el bloque `match /accessRequests/{id} { allow read, write: if false; }` (idéntico a `allowlist/`/`userSecrets/`/`rateLimits/`; comentario que referencie este SPEC y aclare que submit/list/process van por Admin SDK). **Sin tocar** `allowlist/` ni `users/**`.
- **Shape del doc** (`accessRequests/{emailNormalizado}`): `email: string` (== doc id), `motivo?: string`, `status: 'pending' | 'approved' | 'rejected'`, `createdAt: Timestamp` (`serverTimestamp()`), `processedAt?: Timestamp`. **Sin IP** en el doc (la IP solo vive hasheada en `rateLimits/`).
- **Sin índice compuesto:** la cola se consulta `where('status','==','pending')` (índice de campo único automático) y se ordena por `createdAt` **en memoria** en la CF. Escala de sobra para una beta de ~100. Evita `firestore.indexes.json`.
- **Criterio de done (verificable):**
  - `firestore.rules.test.ts`: read **y** write a `accessRequests/{x}` denegados para **todo** contexto cliente, incluida una sesión autenticada (el admin también lee vía CF, nunca directo).
  - `npm run test:rules` verde.
- **Archivos:** `firestore.rules`, `firestore.rules.test.ts`, `src/types/accessRequest.ts` (interface `AccessRequest`).

#### F2 — `submitAccessRequest` (callable **pública**, anti-spam + no-oráculo)

- **Qué:** nueva callable `onCall` **sin `request.auth`** (`region: 'us-central1'`, `maxInstances` explícito p.ej. `5`). Flujo:
  1. **Derivar IP del cliente** del header `x-forwarded-for` (primer hop) con fallback a `request.rawRequest.ip`; hashear (sha256) → `ipHash`.
  2. `await enforceRateLimit(ipHash, 'access-request', { perMinute: 3, perDay: 10 })` (tunables; constantes nombradas). Excedido → `resource-exhausted` (error **uniforme**, no revela nada).
  3. **Validar input fail-closed:** `email` string no-vacío, formato email básico, `≤ 254` chars; `motivo` opcional string `≤ 280` chars. Inválido → `invalid-argument` (sobre formato, NO sobre membresía).
  4. Normalizar email `trim().toLowerCase()`.
  5. **Dedup en transacción leyendo `accessRequests/{email}` (NUNCA `allowlist/`):** si no existe → crear `status:'pending'` + `createdAt` + `motivo`. Si existe → **no-op** (no pisa status ni timestamps). _(Re-solicitar tras un `rejected` requiere que el operador borre el doc a mano — raro, aceptado.)_
  6. **Respuesta uniforme `{ ok: true }`** en todos los casos del paso 5. **Nunca** lee `allowlist/`, **nunca** cambia el mensaje por membresía.
- **Logging:** `sanitizeError` en errores; **no** loguear el email crudo (evento sin PII, o hash).
- **Criterio de done (verificable):**
  - Sin sesión, email válido nuevo → `{ ok: true }`, doc `pending` creado.
  - Mismo email 2ª vez → `{ ok: true }`, **un solo** doc (no duplica, no pisa `createdAt`).
  - Email ya en `allowlist/` → `{ ok: true }` **idéntico** (no se distingue de uno nuevo; cero lectura de `allowlist/`).
  - 4ª llamada/min desde misma IP → `resource-exhausted`. Email malformado → `invalid-argument`.
- **Archivos:** `src/functions/src/access/submitAccessRequest.ts`, `src/functions/src/index.ts` (export). Reusa `rateLimit.ts`, `sanitizeError`.

#### F3 — `listAccessRequests` (callable **admin-only**)

- **Qué:** callable autenticada (`maxInstances: 2`, `secrets: [ADMIN_EMAIL]`). `requireAdmin(request, ADMIN_EMAIL.value())` (helper nuevo: exige `request.auth` y `token.email` normalizado === `ADMIN_EMAIL` normalizado, si no → `permission-denied`/`unauthenticated`). Admin SDK: `where('status','==','pending')`, ordenar por `createdAt` asc en memoria, devolver `{ requests: AccessRequest[] }` (limit defensivo p.ej. 200).
- **Criterio de done:** llamada por un uid/email NO admin → `permission-denied`; por el admin → array de pendientes ordenado; sin sesión → `unauthenticated`.
- **Archivos:** `src/functions/src/access/listAccessRequests.ts`, `src/functions/src/lib/requireAdmin.ts`, `index.ts`.

#### F4 — `processAccessRequest` (callable **admin-only**, aprobar/rechazar)

- **Qué:** callable autenticada (`maxInstances: 2`, `secrets: [ADMIN_EMAIL]`). `requireAdmin(...)`. Input `{ id: string, action: 'approve' | 'reject' }` (validar `action`). Admin SDK, en **batch/transacción**:
  - `approve` → `allowlist/{id}` = `{ addedAt: serverTimestamp() }` **+** `accessRequests/{id}` → `status:'approved'`, `processedAt`.
  - `reject` → `accessRequests/{id}` → `status:'rejected'`, `processedAt` (no toca allowlist).
  - Doc inexistente → `not-found`.
- **Nota de seguridad:** es el **único** writer a `allowlist/` desde código de app; el Admin SDK bypassa el `deny-all`. La regla `allowlist/` sigue `if false` (sin cambios).
- **Criterio de done (verificable):**
  - `approve` por el admin → `allowlist/{email}` existe + request `approved`; ese email ahora pasa `checkMyAccess` y puede loguearse.
  - `reject` → request `rejected`, allowlist intacta.
  - No-admin → `permission-denied`, sin efecto.
- **Archivos:** `src/functions/src/access/processAccessRequest.ts`, `index.ts`.

### Frente B — Frontend (formulario + `/admin` + gancho de copy)

#### F5 — Ruta pública `/solicitar-acceso` + formulario

- **Qué:** wrapper cliente en `src/lib/accessRequests.ts` (`submitAccessRequest(email, motivo?)`, `listAccessRequests()`, `processAccessRequest(id, action)` vía `httpsCallable`). Ruta **fuera del `Layout`** (top-level, como `/login`): `{ path: '/solicitar-acceso', Component: AccessRequestPage }`. Form: input email + textarea motivo opcional (con contador/cap). Submit → `submitAccessRequest` → **estado de éxito uniforme**. Loading = skeleton/disabled, nunca spinner.
- **Copy truthful (D6):** éxito = _"Recibimos tu solicitud. Cuando se habilite tu acceso vas a poder iniciar sesión normalmente."_ (no promete email). Error rate-limit (`resource-exhausted`) = _"Demasiados intentos. Probá de nuevo más tarde."_ Email inválido = validación inline. Red = genérico reintentar.
- **Criterio de done (verificable):** ruta accesible **sin sesión**; submit con email válido → estado de éxito; el doc aparece en `accessRequests/` (verificable vía Firebase MCP); rate-limit → mensaje de demasiados intentos; mobile-first (375) sin overflow.
- **Archivos:** `src/lib/accessRequests.ts`, `src/app/solicitar-acceso/page.tsx` (`AccessRequestPage`), `src/components/auth/AccessRequestForm.tsx`, `src/app/router.tsx`.

#### F6 — Ruta `/admin` (lazy, gate por uid) + UI de la cola

- **Qué:** **primer `React.lazy`** del router (o el `lazy` nativo de RR v7) con `Suspense` fallback skeleton. Ruta **dentro del `Layout`** (hereda el gate anónimo→`/login` + chrome): `{ path: 'admin', ... }`. Dentro de `AdminPage`, gate cosmético: `user?.uid !== import.meta.env.VITE_ADMIN_UID` → `<Navigate to="/" replace />` (la seguridad real son F3/F4 server-side). Fetch one-shot de la cola con `listAccessRequests` (hook `useAccessRequestsQueue`: `useState` + `useEffect`, **fuera de TinyBase/repos** — es tooling admin efímero, no dominio reactivo; análogo a la excepción "lectura MVP one-shot"). Cada fila: email + motivo + fecha + botones **Aprobar**/**Rechazar** → `processAccessRequest` → refetch/optimistic remove. Empty state ("No hay solicitudes pendientes"). Loading skeleton.
- **Criterio de done (verificable):** uid ≠ admin (logueado) → redirect a `/`; admin → ve la cola; **Aprobar** crea `allowlist/{email}` y saca la fila; **Rechazar** marca y saca la fila; refetch refleja el estado. `tsc` + `npm run lint` verdes.
- **Archivos:** `src/app/admin/page.tsx` (`AdminPage`), `src/components/admin/AccessRequestQueue.tsx`, `src/components/admin/AccessRequestRow.tsx`, `src/hooks/useAccessRequestsQueue.ts`, `src/app/router.tsx`.

#### F7 — Gancho de copy: linkear el formulario desde `/login`

- **Qué:** punto de entrada al form **siempre visible** en `LoginCard` (footer): link _"¿No tenés acceso? Solicitá una invitación"_ → `/solicitar-acceso`. Cubre tanto al que nunca se logueó como al rechazado (que rebota a `/login` y ve el link + su error). Ajustar `BETA_NO_ACCESS_MESSAGE` para apuntar al link del footer (p.ej. _"Tu cuenta todavía no tiene acceso a la beta. Podés solicitarlo abajo."_) — evita string-matching frágil sobre el mensaje.
- **Criterio de done:** link visible en `/login` sin error y tras un rechazo; navega a `/solicitar-acceso`; `authErrors.test.ts` actualizado si cambia el copy.
- **Archivos:** `src/components/auth/LoginCard.tsx`, `src/lib/authErrors.ts` (+`.test.ts`).

> **Sin cambios (anotado):** `firestore.rules` § `users/**` y § `allowlist/`, `checkMyAccess`, `userCountTriggers.ts`, capacity gate. El refactor del counter (contar solo allowlisted) sigue siendo hardening futuro de la **apertura** (0.5.0), fuera de scope.

---

## Alcance de archivos

| Archivo                                                                      | Cambio                                                                    | Frente    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| `firestore.rules` (+`.test.ts`)                                              | Regla `deny-all` `accessRequests/`                                        | A (F1)    |
| `src/types/accessRequest.ts`                                                 | Interface `AccessRequest` (nuevo)                                         | A (F1)    |
| `src/functions/src/access/submitAccessRequest.ts`                            | Callable pública: rate-limit IP + validación + dedup + no-oráculo (nuevo) | A (F2)    |
| `src/functions/src/access/listAccessRequests.ts`                             | Callable admin-only: lee la cola (nuevo)                                  | A (F3)    |
| `src/functions/src/access/processAccessRequest.ts`                           | Callable admin-only: approve/reject (nuevo)                               | A (F4)    |
| `src/functions/src/lib/requireAdmin.ts`                                      | Helper gate admin por `ADMIN_EMAIL` (nuevo)                               | A (F3)    |
| `src/functions/src/index.ts`                                                 | Export de las 3 callables                                                 | A         |
| `src/lib/accessRequests.ts`                                                  | Wrappers cliente `httpsCallable` (nuevo)                                  | B (F5/F6) |
| `src/app/solicitar-acceso/page.tsx` + `AccessRequestForm.tsx`                | Form público (nuevo)                                                      | B (F5)    |
| `src/app/admin/page.tsx` + `AccessRequestQueue.tsx` + `AccessRequestRow.tsx` | UI `/admin` (nuevo)                                                       | B (F6)    |
| `src/hooks/useAccessRequestsQueue.ts`                                        | Fetch one-shot de la cola (nuevo)                                         | B (F6)    |
| `src/app/router.tsx`                                                         | Ruta pública `/solicitar-acceso` + `/admin` lazy                          | B (F5/F6) |
| `src/components/auth/LoginCard.tsx`                                          | Link al form en footer                                                    | B (F7)    |
| `src/lib/authErrors.ts` (+`.test.ts`)                                        | Ajustar `BETA_NO_ACCESS_MESSAGE`                                          | B (F7)    |

**Pasos manuales (operador, fuera de código):** setear el secret `ADMIN_EMAIL` (`firebase functions:secrets:set ADMIN_EMAIL`); definir `VITE_ADMIN_UID` en el `.env` de build (gitignored).

## Orden de implementación

1. **F1** → cola + rules + tipo: base de todo. Tests de rules primero (deny-all).
2. **F2** → `submitAccessRequest`: el camino de escritura, con su test unit (rate-limit + dedup + no-oráculo).
3. **F3 → F4** → callables admin (`requireAdmin` lo introduce F3, lo reusa F4).
4. **F5** → form público (depende de F2 vía wrapper).
5. **F6** → `/admin` (depende de F3/F4 vía wrappers).
6. **F7** → gancho de copy (independiente; cierra el funnel hacia F5).

## Orden de deploy

> Toca **CFs + rules + hosting**. No toca `src-tauri/` ni `android/` → builds nativos **opcionales** (las rutas web `/solicitar-acceso` y `/admin` existen en el dist compartido pero son web-first; entran en el próximo release nativo sin divergencia de datos).

1. **Setear el secret** `ADMIN_EMAIL` (manual, antes de desplegar las CFs que lo consumen).
2. `firebase deploy --only functions:submitAccessRequest,functions:listAccessRequests,functions:processAccessRequest` — **selectivo por nombre** (las 3 son nuevas → no hay borrado destructivo; evita el gotcha de F51 donde el deploy global aborta en no-interactivo por funciones colgadas).
3. `npm run deploy:rules` — regla `deny-all` `accessRequests/`. No-destructivo.
4. `npm run build && npm run deploy` — hosting con las rutas nuevas + el wrapper cliente.
5. **Bump `0.4.2`** en los archivos de versión (independiente de la apertura). Tag/release según el flujo del ecosistema (nativos opcionales).

## Trade-offs explícitos

- **`/admin` gateado por uid en cliente = cosmético.** La seguridad real está en `requireAdmin` server-side (F3/F4). El `VITE_ADMIN_UID` queda embebido en el bundle (uid opaco, aceptable; no es el email). No se publicita la ruta en el sidebar.
- **Dedup por email-as-docid:** re-solicitar tras un `rejected` es no-op silencioso (el operador borra el doc a mano si quiere reabrir). Aceptable para beta.
- **Rate-limit por IP** no frena bots distribuidos (NAT/IPv6 también pueden agrupar/rotar). Aceptado para el target; Turnstile documentado como escalación.
- **Sin notificaciones:** el operador debe **mirar `/admin`** proactivamente; el solicitante no recibe aviso, reintenta login. Truthful por diseño.
- **Cola en memoria (sin índice compuesto):** ordenar `pending` en la CF; sano hasta miles de docs, no a escala de apertura masiva (revisar en 0.5.0).

## Verificación E2E (al implementar)

- **Form público (anónimo):** `/solicitar-acceso` sin sesión → submit con email de prueba **descartable** → estado de éxito; doc `pending` en `accessRequests/` (Firebase MCP). Reenvío mismo email → no duplica. Email ya allowlisted (el de Sebastián) → **misma** respuesta de éxito, **sin** que la CF lea `allowlist/` (revisar logs). >3/min misma IP → mensaje de demasiados intentos.
- **`/admin`:** con la cuenta de Sebastián (`gYPP7NIo5JanxIbPqMe6nC3SQfE3`, **NUNCA borrar sus datos**) → ve la cola; **Aprobar** un email de prueba → aparece en `allowlist/`, ese email luego pasa `checkMyAccess`; **Rechazar** otro → `rejected`, allowlist intacta. Con una cuenta NO admin logueada → redirect a `/` y `processAccessRequest` directo → `permission-denied`.
- **Funnel de rechazo:** login con cuenta no-allowlisted → rebota a `/login` con `BETA_NO_ACCESS_MESSAGE` + link "Solicitar acceso" visible → navega al form.
- Dev server en background (`npm run dev`), `TaskStop` al terminar. Gate CI (`lint` + `tsc` + `npm test` + `npm run test:rules`) verde antes de mergear.

## Checklist de completado

- [ ] F1–F7 implementadas + criterios verificados.
- [ ] `npm run lint` + `tsc --noEmit` + `npm test` (incl. unit de `submitAccessRequest`) verdes.
- [ ] `npm run test:rules` verde (deny-all `accessRequests/`).
- [ ] Secret `ADMIN_EMAIL` seteado; `VITE_ADMIN_UID` en `.env` de build.
- [ ] E2E: form público (éxito/dedup/no-oráculo/rate-limit) + `/admin` (approve/reject/gate) + funnel de rechazo OK.
- [ ] Deploy en orden (secret → functions selectivo → rules → hosting) + bump `0.4.2`.
- [ ] Commits atómicos Conventional (uno por sub-feature) + merge `--no-ff`.
- [ ] Escalación de gotchas (SDD step 8): no-oráculo del formulario (leer `accessRequests/`, nunca `allowlist/`; respuesta uniforme) → `Spec/gotchas/cloud-functions-guards.md` si aplica a >1 feature; gotcha de IP-en-callable (`x-forwarded-for` vs `rawRequest.ip`) si resultó no trivial.
- [ ] Convertir este SPEC a registro de implementación.

## Hardening futuro (anotado, fuera de scope)

- **Turnstile/reCAPTCHA** en el form público si aparece spam real (web-only → el blocker de Tauri/extensión de F51 no aplica).
- **Counter solo-allowlisted** + apertura de signups públicos = parte de `0.5.0` (reintroduce la race de D4/F50 → flag persistido).
- **Notificación al operador** (trigger `onCreate` en `accessRequests/` → email) si el chequeo manual de `/admin` se vuelve incómodo. Requiere servicio de envío + `OPERATOR_EMAIL`.
- **Gestión completa de allowlist desde `/admin`** (listar miembros + revocar) si el volumen lo justifica — hoy se revoca a mano en Console.
