# SPEC — Feature 53: Gestión de miembros de la allowlist (ver/revocar) + capacity sobre allowlisted

> **Estado:** ✅ **Aprobado — listo para implementar** (D5/D7 cerrados con Sebastián esta sesión). Las secciones F1–F11 son **prescriptivas** (qué construir), no un registro de implementación.
> **Versión objetivo:** `0.4.3`. **NO abre la beta**: `checkMyAccess` + rules `users/**` + `allowlist/` deny-all no cambian. Esto **arregla el capacity** (prerequisito real de `0.5.0`) y agrega gestión de miembros.
> **Rama:** `feat/gestion-miembros` → merge `--no-ff` a `main`.
> **Depende de:** F47 (capacity gate `config/app`, `useSignupCapacity`, `SignupCapacityGate`), F50 (`allowlist/` deny-all, `isAllowlisted`, normalización email), F51 (`checkMyAccess`, `rateLimit.ts`), **F52** (`requireAdmin`/`adminEmail`, `/admin`, `listAccessRequests`/`processAccessRequest` como molde, patrón callable cliente).
> **Origen:** SPEC-52 § Hardening futuro + `ESTADO-ACTUAL.md` § Candidatos próximos (las dos piezas que se dejaron FUERA de SPEC-52 a propósito).

## Objetivo

Dos piezas acopladas:

1. **Gestión de miembros desde `/admin`** — el admin puede **ver** quiénes están hoy en la beta (`allowlist/`) y **revocar** acceso. Listar pasa por CF admin-only (los ~100 emails son PII — A-3: nunca read directo del cliente). Revocar es el **primer writer de borrado** a `allowlist/`.
2. **Reframe del capacity (el centro)** — el límite de la beta deja de medirse por **cuentas Auth** (`config/app.userCount`, inflado por huérfanas no-allowlisted, corregido a mano hasta hoy) y pasa a enforcearse sobre el **tamaño real de la `allowlist/`**, **en el momento de la aprobación**, con `count()` transaccional (race-free). Se elimina el counter y todo su aparato: triggers Auth + gate de capacity en el signup.

**Reframe en una línea:** la capacidad no se gatea en el signup (async, racy — por eso D4/F50 la dejaron aproximada) sino en la **aprobación** (acción admin síncrona). Con `count()` dentro de transacción no hay race, y se disuelve la deuda del "flag persistido" de F50/F51.

## Contexto / punto de partida (verificado en código esta sesión)

- **`count()` aggregation** está en `firebase-admin` (repo: `^13.8.0`) y es **válido dentro de una transacción** (`transaction.get(collection.count())` — el server SDK usa pessimistic locking). Permite **"contar `< maxUsers` Y escribir" atómico**. Costo ~**1 read** para ~100 docs; latencia 50–200 ms. _(Soporte del **emulador** para aggregation en tx: validar temprano — si falta, el fallback es indoloro, ver Riesgos.)_
- **`onUserCreated`/`onUserDeleted`** (`src/functions/src/auth/userCountTriggers.ts`, v1) hacen **exclusivamente** `config/app.userCount += / -= 1` (incondicional, cuenta cualquier Auth user). **No leen ni hacen nada más** → en Modelo C quedan vacíos.
- **El counter se consume en DOS sitios cliente**, no uno:
  1. `SignupCapacityGate.tsx` (display "Beta llena X/Y") → `useSignupCapacity` → `readSignupCapacity()` lee `config/app`.
  2. **`useAuth.signUpWithEmail`** (`src/hooks/useAuth.ts:96-111`, defense-in-depth D7): re-lee `readSignupCapacity()` pre-create, `throw 'capacity-full'`/`'capacity-unavailable'`.
- **`processAccessRequest` approve** (`src/functions/src/access/processAccessRequest.ts:47-56`) hoy usa **`db.batch()`** (WriteBatch), **NO chequea capacidad**, y es el **único writer** a `allowlist/`. **No existe ningún writer de borrado** a `allowlist/` en el código.
- **Molde admin (SPEC-52):** `requireAdmin(request, adminEmail.value())` (email-céntrico, case-insensitive vs secret `ADMIN_EMAIL`); `listAccessRequests` = molde de "leer colección con Admin SDK → DTOs"; `isAllowlisted` normaliza `email.trim().toLowerCase()` (misma key que `allowlist/`).
- **`checkMyAccess` corre solo en login/signup** (`useAuth.enforceAccessGate`), **nunca periódico** → revocar a alguien con **sesión activa NO lo expulsa** hasta el próximo gate; las rules `users/**` (`exists(allowlist/{email})`) frenan toda I/O nueva. Backstop real = rules.
- **`/admin`** (`src/app/admin/page.tsx`): sección única, sin tabs; gate cosmético `VITE_ADMIN_UID` con guard `isLoading` (fix d42c03a). Callables vía `src/lib/accessRequests.ts` (`httpsCallable(functions, '…')`, `functions` de `src/lib/firebase.ts` región `us-central1`); hook one-shot `{ requests, isLoading, error, refetch }`; render skeleton/error/empty/list; `refetch()` post-acción.

## Decisiones cerradas (con Sebastián, esta sesión)

| #      | Decisión                                                                                                         | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Modelo C — capacity enforced en la APROBACIÓN, no en el signup**                                               | `config/app` pierde `userCount`; queda `{ signupsEnabled, maxUsers }`. Se **elimina** el display "Beta llena X/Y" del registro y **todo el aparato de conteo cliente**. Razón: con enforcement en approve el display es vestigial (al aprobado ya le diste slot; el no-aprobado crea una huérfana inerte esté llena o no). Si algún día se quiere mostrar escasez por marketing, va en `/solicitar-acceso`, no en el registro. El conteo real lo ve el admin donde lo gestiona: `/admin`.                                                                                                                                                                                                                                                                                        |
| **D2** | **Enforcement race-free vía `count()` en transacción**                                                           | `processAccessRequest` approve pasa de `db.batch()` a `db.runTransaction()`: leer `maxUsers` (`config/app`) + `count(allowlist)` + existencia del email; si **no es miembro ya** y `count >= maxUsers` → `resource-exhausted`; si no, upsert `allowlist/{email}` + marca `approved`. **El valor real acá es la atomicidad** (check + write `allowlist/` + marca `approved` = todo-o-nada), no la concurrencia: hay **un solo admin** aprobando secuencialmente, así que dos aprobaciones solapadas en server son prácticamente imposibles. Disuelve la deuda del flag persistido de F50/F51; por eso el fallback sin `count()` en tx es aceptable (ver Riesgos).                                                                                                                 |
| **D3** | **Soft revoke**                                                                                                  | `revokeAccess` (CF admin-only) **solo borra** `allowlist/{email}`. No desloguea ni borra cuenta/datos. La sesión activa cae al próximo gate (rules deniegan I/O; `checkMyAccess` falla en el próximo login). Consistente con el modelo (rules = backstop). **Hard revoke** (disable Auth) descartado: over-scope para beta (concepto nuevo "cuenta deshabilitada", beneficio solo ante abusador activo — no es el caso de invitados que vos aprobaste).                                                                                                                                                                                                                                                                                                                          |
| **D4** | **Triggers Auth eliminados**                                                                                     | `onUserCreated`/`onUserDeleted` se borran (su única función era el counter). **Borrado seguro de CF** (memoria `firebase_rename_callable_deploy`): `firebase functions:delete onUserCreated onUserDeleted` **aparte**, porque `deploy:functions` aborta en no-interactivo por la fn vieja. La trampa de binarios nativos **NO aplica** (son triggers backend, el cliente no los empaqueta ni invoca).                                                                                                                                                                                                                                                                                                                                                                            |
| **D5** | **`signupsEnabled` se conserva como kill-switch del registro, degradado a gate booleano simple** — ✅ confirmado | El gate del signup deja de mostrar capacity; solo respeta `signupsEnabled` (form abierto / "registro deshabilitado temporalmente"). El defense-in-depth de capacity en `signUpWithEmail` **se elimina** (ya no hay counter; la race que lo motivaba desaparece). Gate **cliente-only** (explícito): esconde el form en la UI y frena el caso común, pero alguien que llame `createUserWithEmailAndPassword` por API directa crea una **huérfana inerte** igual (sin acceso por rules + `checkMyAccess`). Es una **palanca de pánico/UX, no seguridad fuerte** — nunca hubo enforcement server-side en la creación de Auth (requeriría Identity Platform pago). Conservar el flag cuesta ~10 líneas y **simplifica** (reemplaza el gate con números por un condicional booleano). |
| **D6** | **Listar miembros vía CF admin-only**                                                                            | `listAllowlistMembers` (molde `listAccessRequests`). **Nunca** read directo del cliente: los ~100 emails son PII (A-3). El admin **sí** debe verlos — es server-gated (`requireAdmin`), no es el oráculo de enumeración.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **D7** | **Versión `0.4.3`, sigue sin abrir la beta** — ✅ confirmado                                                     | Fija el capacity correcto (prerequisito real de `0.5.0`). No es apertura: `0.5.0` se reserva para repo privado + signups de desconocidos a escala. `0.5.0` es un hito de **producto** (apertura), no técnico: feature nueva + cambio arquitectural no lo justifican mientras la beta siga cerrada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## Sub-features

### Frente A — Backend: capacity + CRUD de miembros

#### F1 — `processAccessRequest` approve: capacity enforcement con `count()` transaccional

- **Qué:** reemplazar el `db.batch()` del path `approve` por `db.runTransaction()`. **Todas las lecturas antes de toda escritura** (regla de tx Firestore):
  1. `tx.get(reqRef)` → existe? (si no → `not-found`); tomar `email` (== doc id).
  2. `tx.get(db.doc('config/app'))` → `maxUsers` (fail-closed: ausente/no-number → tratar como `0` → bloquea).
  3. `tx.get(db.collection('allowlist').count())` → `current`.
  4. `tx.get(allowRef)` → `alreadyMember` (idempotencia: re-aprobar a un miembro no consume slot).
  5. Si `!alreadyMember && current >= maxUsers` → `throw new HttpsError('resource-exhausted', 'Beta llena')`.
  6. `tx.set(allowRef, { addedAt: serverTimestamp() }, { merge: true })` + `tx.set(reqRef, { status: 'approved', processedAt }, { merge: true })`.
  - El path `reject` no toca capacity (solo marca `rejected`); puede ir dentro de la misma tx por consistencia o quedar como set simple.
- **Criterio de done (verificable, emulador):**
  - `count < maxUsers` → aprobar escribe `allowlist/` + marca `approved`.
  - `count >= maxUsers` + email **nuevo** → `resource-exhausted`, **no** escribe `allowlist/` **ni** marca `approved` (tx aborta entera).
  - Aprobar un email **ya en `allowlist/`** → **idempotente**: ok, no consume slot, no rompe (incluso con `count == maxUsers`).
  - Doble-click sobre la **misma** solicitud → se serializa (lock sobre `reqRef` + check `alreadyMember`); el emulador lo maneja sin problema. _(Aprobaciones concurrentes de solicitudes **distintas** no ocurren en la práctica: un solo admin, clicks secuenciales. El `count()` en tx las cubriría igual, pero su valor real acá es la **atomicidad** del all-or-nothing, no esa concurrencia.)_
- **Archivos:** `src/functions/src/access/processAccessRequest.ts`. Tests: extender el E2E emulador de SPEC-52.

#### F2 — `listAllowlistMembers` (callable **admin-only**)

- **Qué:** nueva callable. `requireAdmin(request, adminEmail.value())`. Lee `allowlist/` con Admin SDK (Admin SDK bypassa el deny-all), mapea a DTOs, ordena por `addedAt` desc in-memory (sin índice). Config: `secrets: [adminEmail]`, `timeoutSeconds: 10`, `region: 'us-central1'`, `maxInstances: 2`.
- **DTO** (`AllowlistMember`): `{ email: string /* == doc id */, addedAt: number | null /* epoch ms */ }`. `limit(500)` defensivo.
- **Criterio de done:** sin sesión → `unauthenticated`; sesión no-admin → `permission-denied`; admin → `{ members: AllowlistMember[] }`. `sanitizeError` en el catch (no loguear emails crudos).
- **Archivos:** `src/functions/src/access/listAllowlistMembers.ts`, `src/functions/src/index.ts` (export), `src/types/allowlistMember.ts`.

#### F3 — `revokeAccess` (callable **admin-only**) — primer writer de borrado a `allowlist/`

- **Qué:** nueva callable. `requireAdmin`. Valida `email` string no-vacío → normaliza `trim().toLowerCase()` → `db.collection('allowlist').doc(email).delete()`. **Idempotente** (borrar inexistente = ok). Config igual a F2 (`maxInstances: 2`).
- **Criterio de done:** admin revoca email existente → doc `allowlist/{email}` borrado, `{ ok: true }`. Revocar inexistente → `{ ok: true }` (idempotente). No-admin → `permission-denied`. Tras revoke, `checkMyAccess()` de ese email → `false` (verificable en emulador).
- **Archivos:** `src/functions/src/access/revokeAccess.ts`, `src/functions/src/index.ts` (export).

#### F4 — Eliminar triggers Auth del counter

- **Qué:** borrar `src/functions/src/auth/userCountTriggers.ts` + quitar `export { onUserCreated, onUserDeleted }` de `src/functions/src/index.ts:17`. Deploy: borrado seguro (D4) — `firebase functions:delete onUserCreated onUserDeleted --force` **aparte** del `deploy:functions`.
- **Criterio de done:** `tsc -b` + ESLint verdes sin referencias colgantes; las 2 funciones ya no figuran en `firebase functions:list` tras el delete.
- **Archivos:** borrar `userCountTriggers.ts`, editar `index.ts`.

### Frente B — Frontend: gestión de miembros en `/admin`

#### F5 — Lib + hook de miembros

- **Qué:** `src/lib/allowlistMembers.ts` con wrappers tipados `listAllowlistMembers(): Promise<AllowlistMember[]>` y `revokeAccess(email: string): Promise<void>` (molde `src/lib/accessRequests.ts`, `functions` de `@/lib/firebase`). `src/hooks/useAllowlistMembers.ts` one-shot → `{ members, isLoading, error, refetch }` (molde `useAccessRequestsQueue`).
- **Archivos:** `src/lib/allowlistMembers.ts`, `src/hooks/useAllowlistMembers.ts`.

#### F6 — Componentes `AllowlistMembers` + `AllowlistMemberRow`

- **Qué:** contenedor `AllowlistMembers.tsx` (skeleton 3-items / error+reintentar / empty / list — molde `AccessRequestQueue`). Row `AllowlistMemberRow.tsx`: email + `addedAt` formateado (`es-AR`) + botón **Revocar** con **confirmación** (revoke es destructivo) y estado `busy` (deshabilita durante la llamada). `refetch()` post-revoke. Error genérico (o `not-found` → "Ya no existe").
- **Criterio de done:** lista miembros; revocar pide confirmación → llama CF → quita el row tras refetch; loading = skeleton (nunca spinner); empty diferenciado.
- **Archivos:** `src/components/admin/AllowlistMembers.tsx`, `src/components/admin/AllowlistMemberRow.tsx`.

#### F7 — `/admin`: segunda sección "Miembros de la beta"

- **Qué:** agregar bajo `<AccessRequestQueue />` una segunda `section` (mismo patrón minimal: `h2` + `p` descriptiva + `<AllowlistMembers />`). **Stack vertical, sin tabs** (consistente con la página actual; evita abstracción prematura).
- **Archivos:** `src/app/admin/page.tsx`.

#### F8 — UI del error de capacity en approve

- **Qué:** en el catch de la acción approve (`AccessRequestQueue`/wrapper), **discriminar** el `HttpsError` code `resource-exhausted` → mensaje claro: "Beta llena ({maxUsers}). Subí `maxUsers` o revocá un miembro antes de aprobar." (hoy el catch es genérico). El resto sigue genérico.
- **Criterio de done:** aprobar con la beta llena muestra el mensaje específico, no el genérico; la solicitud queda `pending` (no se pierde).
- **Archivos:** `src/lib/accessRequests.ts` (propagar el code) y/o `src/components/admin/AccessRequestQueue.tsx`.

### Frente C — Remover capacity del signup (Modelo C)

#### F9 — `useAuth.signUpWithEmail`: quitar el defense-in-depth de capacity

- **Qué:** eliminar el bloque `src/hooks/useAuth.ts:96-111` (lectura `readSignupCapacity` + `capacity-full`/`capacity-unavailable`) y el import `readSignupCapacity` (línea 16). `signUpWithEmail` queda: `createUserWithEmailAndPassword` → `enforceAccessGate` → `sendEmailVerification`.
- **Criterio de done:** un allowlisted puede registrarse sin tocar capacity; `tsc`/ESLint verdes sin imports muertos.
- **Archivos:** `src/hooks/useAuth.ts`.

#### F10 — Gate de signup: de capacity a `signupsEnabled` simple (pendiente D5)

- **Qué (si D5 = conservar):** eliminar `SignupCapacityGate.tsx`; introducir gate booleano simple de `signupsEnabled` (hook `useSignupsEnabled` o reescritura de `useSignupCapacity` quitando `userCount`/`maxUsers`/`canSignUp`). En `LoginCard.tsx:77-79` reemplazar el wrapper. Sin números, sin "Beta llena". Estado: form abierto ⟷ "Registro deshabilitado temporalmente".
- **Qué (si D5 = eliminar):** quitar el gate por completo; `SignUpForm` siempre visible; borrar `useSignupCapacity`/`SignupCapacityGate`.
- **Criterio de done:** el registro ya no muestra conteo; respeta `signupsEnabled` (o nada, según D5).
- **Archivos:** `src/components/auth/SignupCapacityGate.tsx` (borrar), `src/hooks/useSignupCapacity.ts` (simplificar/borrar), `src/components/auth/LoginCard.tsx`.

#### F11 — Limpieza de `config/app` + rules

- **Qué:** actualizar el comentario de la rule `config/app` en `firestore.rules:23-25` (ya no hay triggers; writes solo Admin SDK manual). La regla `config/app { read: true; write: false }` y `allowlist/ { read,write: if false }` **no cambian** (revoke pasa por Admin SDK). **Borrar el campo `userCount`** de `config/app` en prod (paso manual del operador, one-time).
- **Criterio de done:** `firestore.rules` deploya; `config/app` en prod queda `{ signupsEnabled, maxUsers }`.
- **Archivos:** `firestore.rules` (solo comentario). Migración de datos = paso manual (abajo).

---

## Orden de implementación

1. **F1** (capacity en approve — el corazón) + E2E emulador. _Validar primero el riesgo del emulador con `count()` en tx._
2. **F2 + F3** (CFs `list`/`revoke`) + **F4** (borrar triggers).
3. **F5 → F8** (frontend miembros + error de capacity en approve).
4. **F9 → F11** (remover capacity del signup + limpieza rules/config).
5. Deploy pipeline + E2E + smoke prod.

## Pasos manuales del operador

- Verificar que `config/app.maxUsers` esté seteado correctamente en prod **antes** de desplegar F1 (si falta → toda aprobación bloquea por fail-closed).
- Tras desplegar: `firebase functions:delete onUserCreated onUserDeleted --force` (D4).
- Borrar el campo `config/app.userCount` (Console o `firestore_update_document` quitándolo).
- Sin cambios de secrets ni env nuevos (reusa `ADMIN_EMAIL` + `VITE_ADMIN_UID` de SPEC-52).

## Verificación

- **E2E emulador** (functions+firestore+auth): F1 (approve bajo/sobre límite, idempotencia, concurrencia ≤ maxUsers), F2/F3 (gating `unauthenticated`/`permission-denied`/admin; revoke borra; `checkMyAccess` post-revoke = false).
- **Build/lint:** `npm run build` + `npm run lint` completo + `npm test` + `npm run test:rules` verdes.
- **Smoke prod:** `/admin` → ver miembros reales (sin tocar) → aprobar un throwaway **(happy path, < límite)** → revocarlo → confirmar que cae de `allowlist/` (limpiar). Confirmar que el **signup sigue funcionando** sin gate de capacity. **El caso "beta llena" (`resource-exhausted`) NO se gatilla en prod** (con 1 miembro y `maxUsers` alto habría que bajar el límite a mano) — queda cubierto por el E2E del emulador.
- **Deploy:** functions selectivo (`listAllowlistMembers`, `revokeAccess`, `processAccessRequest`) + `functions:delete` aparte + rules + hosting. **Tauri/Android opcionales** (cambio web+CFs; las rutas viven en el dist compartido).

## Riesgos / cuestiones abiertas

- **Emulador + `count()` en transacción — validar temprano, fallback indoloro (NO bloqueante).** En el paso 1 confirmar que el emulador soporta `transaction.get(collection.count())`. Si no: **plan B** = contar **fuera** de la tx (`allowlist.count().get()`) y hacer el check de límite, escribiendo `allowlist/` + marca `approved` **dentro** de la tx (atomicidad preservada). Lo único que se pierde es la prevención de una race concurrente que **no ocurre con un solo admin secuencial** → fallback aceptable sin culpa. La tx con `count()` es lo más limpio si el emulador la soporta; el fallback no condiciona el éxito del SPEC.
- **Huérfanas Auth viejas (fuera de scope):** las cuentas Auth no-allowlisted ya creadas quedan **inertes** con Modelo C (ya no las cuenta nadie; las rules las frenan). Limpiarlas (`admin.auth().deleteUser`) es **mantenimiento opcional futuro**, no entra en este SPEC. Anotado para que no sorprenda verlas en la consola de Auth.
- **Gotchas a escalar al cerrar:** (1) `count()` dentro de tx Firestore (read-before-write; aggregation get válido en tx, firebase-admin ≥ 11.5; comportamiento del emulador) → `cloud-functions-guards.md`. (2) reframe: el enforcement de capacity en la aprobación (admin síncrono + tx) hace **irrelevante** la race del flag persistido de F50/F51 (no hay concurrencia real con un solo admin) — el valor de la tx es la atomicidad.

## Checklist

- [ ] F1 — approve transaccional con `count()` (+ E2E, + riesgo emulador validado)
- [ ] F2 — `listAllowlistMembers` (admin-only)
- [ ] F3 — `revokeAccess` (admin-only, idempotente)
- [ ] F4 — borrar triggers `onUserCreated`/`onUserDeleted` (+ `functions:delete`)
- [ ] F5 — lib + hook de miembros
- [ ] F6 — `AllowlistMembers` + `AllowlistMemberRow` (revoke con confirmación)
- [ ] F7 — segunda sección en `/admin`
- [ ] F8 — error `resource-exhausted` en approve UI
- [ ] F9 — quitar defense-in-depth de capacity en `signUpWithEmail`
- [ ] F10 — gate de signup → `signupsEnabled` simple (D5 = conservar, cliente-only)
- [ ] F11 — limpieza `config/app.userCount` + comentario rules
- [ ] Deploy + E2E + smoke prod + cierre (registro de implementación + escalación de gotchas)
