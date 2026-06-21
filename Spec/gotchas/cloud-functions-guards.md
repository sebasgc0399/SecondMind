# Cloud Functions — Guards y edge cases

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.
> Origen: sub-sección "Guards y edge cases" del corpus monolítico (D-Plan-1 split de Cloud Functions en 2 archivos).

## `aiProcessed` guard en `autoTagNote`

`if (after.aiProcessed) return` — evita re-procesamiento. Early return sin log (frecuente).

## `onDocumentWritten` en vez de `onDocumentCreated` para notas

Notas desde `/notes` se crean con `contentPlain: ''` y el texto llega en el auto-save (2s después). `onDocumentWritten` detecta el primer write con contenido.

## `convertToNote` setea `aiProcessed: true` cuando hay tags del inbox

Sin esto, `autoTagNote` sobrescribiría tags aceptados. Condición: `aiProcessed: !!(overrides?.tags?.length > 0)`. **Trade-off escalado en F21**: estas notas nacen con `aiSummary: ''` y `autoTagNote` no las re-procesa, así que **nunca tendrán `aiSummary` visible** en `NoteCard` (donde el render del summary se introdujo en F21). Costo de aceptar tags AI manualmente; si en el futuro se quiere generar `aiSummary` aún con tags pre-aceptados, separar el flag en `aiTagsProcessed` + `aiSummaryProcessed`.

## Secret management

`defineSecret('ANTHROPIC_API_KEY')` / `defineSecret('OPENAI_API_KEY')` + `secrets: [...]` en el trigger. `.value()` dentro del handler, no top-level.

## `contentHash` guard en `generateEmbedding`

Compara SHA-256 del `contentPlain` actual con el hash almacenado. A diferencia de `autoTagNote`, embeddings deben regenerarse cuando el contenido cambia.

## Runtime Node.js 22 en functions

Migrado de Node 20 a 22 (`firebase.json.runtime: nodejs22`). `package.json.engines.node: 22` y `@types/node: ^22` coinciden.

## `firebase-functions` v7 obligatorio

v6 fallaba con timeout en el discovery protocol de la CLI.

## `.gitignore` de functions: `/lib/` con anchor

Sin anchor, matchea `src/lib/` (sources) además de `lib/` (compiled).

## `autoTagNote` y `generateEmbedding` se disparan en CADA write a una nota (post-F18)

Incluyendo toggles de flags planos (`isFavorite`, `deletedAt`). Aceptable hoy porque `aiProcessed` y el `contentHash` SHA-256 actúan como guards de reprocesamiento real (la CF arranca pero retorna early sin llamar al modelo). Si en el futuro se agregan más flags toggleables o el body de la nota cambia con frecuencia, considerar guard explícito de "no reprocesar si solo cambió metadata flat" comparando hashes pre/post o flagging la transacción.

## `aiSummary` queda stale tras edición de la nota (post-F21)

`autoTagNote` solo corre si `aiProcessed === false` (early return en [src/functions/src/notes/autoTagNote.ts](../../src/functions/src/notes/autoTagNote.ts)). Una vez que la CF generó tags + summary y marcó `aiProcessed: true`, ediciones posteriores del contenido NO disparan re-síntesis del summary. En F21 `aiSummary` se volvió user-facing como segunda línea de `NoteCard`; el desfase entre snippet (live) y summary (frozen al primer procesamiento) ya es visible al usuario. Trade-off aceptado por costo de tokens y ruido visual si se regenera en cada keystroke. Si se vuelve molesto en uso real, la mitigación canónica es: comparar `contentHash` SHA-256 actual vs hash al momento del summary y regenerar solo si difiere significativamente. Mismo patrón que `generateEmbedding` ya usa para decidir si re-embedear.

## CFs `onDocumentWritten` son no-op-safe ante delete si chequean `if (!event.data?.after?.data()) return` al inicio (post-F19)

Cuando se borra una nota, `autoTagNote` y `generateEmbedding` se disparan junto con `onNoteDeleted` (F3) en la misma transacción Firestore — los primeros salen sin hacer nada porque `after` es `undefined`. Cualquier futura CF `onDocumentWritten` sobre una colección con deletes debe incluir este guard como primera línea del handler. Sin él, la CF intenta leer campos de un doc inexistente y falla con throw.

## `retry: false` es decisión consciente en CFs trigger-based con LLM calls

`processInboxItem`, `autoTagNote`, `generateEmbedding`. Activar retry duplicaría invocaciones en transient failures (timeout Anthropic/OpenAI, throttling eventarc) sin idempotency wrapper → double-cost de tokens + posibles duplicados de tags/embeddings. Recovery path manual: editar cualquier campo de la nota re-dispara `onDocumentWritten`. Validado Apr 2026 con `functions_get_logs` MCP: 0 fallos severity≥WARNING en 90 días — el riesgo de "nota sin tags por crash transitorio" es sub-percentil y la consecuencia es soft (tags faltantes, no data loss). Si se necesita retry automático en el futuro, agregar idempotency key (hash del contenido + run-id) + dedup en handler antes de flippear.

## Cleanup en cascada de deletes via CF `onDocumentDeleted` + WriteBatch chunked (post-F19)

Para limpiar datos relacionados al borrar el principal (embeddings, links bidireccionales, sub-collections), trigger `onDocumentDeleted({ document: 'users/{userId}/X/{id}', region: 'us-central1', timeoutSeconds: 60, retry: true })` (`firebase-functions/v2/firestore`). `retry: true` SOLO porque el cascade es idempotente (queries por ID + deletes re-ejecutables, costo cero) — contraste con el gotcha anterior de LLM calls; sin retry, un fallo transitorio dejaba huérfanos que nada reconcilia. Las queries OR no se pueden combinar nativas en Firestore — ejecutar `Promise.all([querySource, queryTarget])` y mergear IDs en `Set` para idempotencia. Borrar con `WriteBatch` chunked de 500 (límite Firestore por batch). Logging estructurado `{ userId, entityId, deleted: count }`. Patrón vivo en [src/functions/src/notes/onNoteDeleted.ts](../../src/functions/src/notes/onNoteDeleted.ts); replicable para `tasks`/`projects`/`objectives` cuando aparezca demanda de hard delete.

**Ciclo de vida del borrado de notas (verificado 2026-06-09):** el soft-delete (`deletedAt > 0`) deja embedding/links vivos POR DISEÑO (restore coherente); `onNoteDeleted` solo dispara con delete real del documento; la limpieza llega por hard-delete manual (Papelera → "Eliminar para siempre" / "Vaciar papelera") o `autoPurgeTrash` (scheduled, plazo per-user, default 30 días). Huérfanos permanentes solo si `trashAutoPurgeDays = 0` (Nunca) o si falla el cascade. CF de reconciliación de huérfanos: NO-GO por YAGNI (audit 2026-06-09: 0 embeddings sin nota, 0 links muertos en prod) — se reabre solo si aparece un huérfano absoluto en prod.

## CFs scheduled con `onSchedule` v2 (post-F19, primer uso)

Import: `firebase-functions/v2/scheduler`. Schedule cron tradicional `'0 3 * * *'` con `timeZone: 'UTC'` explícito (más portable que sintaxis App Engine `'every day 03:00'`). Memory `256MiB` default, timeout `540s` máx, `retryCount: 0` (idempotente: el próximo run reintenta lo que falló). Habilita la API `cloudscheduler.googleapis.com` automáticamente al desplegar. Verificación post-deploy: `firebase functions:list` muestra trigger `scheduled` (sino el cron no se registró). Vivo en [src/functions/src/notes/autoPurgeTrash.ts](../../src/functions/src/notes/autoPurgeTrash.ts).

## Firestore `firestore.rules` catch-all `match /users/{userId}/{document=**}`

Cubre cualquier sub-colección nueva sin cambios en rules (post-F19, confirmado al agregar `users/{uid}/settings/preferences`). El catch-all funciona también para queries `collectionGroup` desde el client SDK — Firestore enforce la rule por doc-path; un cliente autenticado como uidA solo puede leer sus propias notas en una collection group query. Cualquier PR futuro que toque `firestore.rules` debe re-correr test cross-user (auth como uidA + intentar leer `users/uidB/...` → permission-denied) antes de mergear. Vivo en [firestore.rules](../../firestore.rules).

## Enforce `email_verified` server-side en rules cuando el provider Email/Password está habilitado (post-audit-2026-05)

Banners de verificación client-side (F47.F4) son solo UI nudge — un user puede dismissarlos y operar Firestore normalmente si las rules solo chequean `request.auth.uid == userId`. Para enforcement real, las rules deben exigir `request.auth.token.email_verified == true`. Excepción: providers federados como Google marcan el flag automáticamente al sign-in (D8 F47), por lo cual incluir `request.auth.token.firebase.sign_in_provider == 'google.com'` en un OR evita romper users existentes pre-fix. Patrón canónico de la rule:

```
allow read, write: if
  request.auth != null
  && request.auth.uid == userId
  && (request.auth.token.firebase.sign_in_provider == 'google.com'
      || request.auth.token.email_verified == true);
```

**Grace period requerido si hay users email/password pre-existentes** sin verificar — sin grace period quedan permission-denied de inmediato post-deploy y deben verificar email para recuperar acceso. Decisión de scope: <10 users afectados → comunicación manual + verificación obligatoria; >10 → banner intensificado UX + ventana de 7-14 días con doble check (client + server queries reportando UID si pasa client pero falla server). C1 audit 2026-05 deployó sin grace period (zero users email/password no verificados en prod). Aplica a cualquier proyecto Firebase con Email/Password habilitado + datos user-scoped. Vivo en [firestore.rules](../../firestore.rules).

## Firestore RECHAZA single-field indexes en `firestore.indexes.json` (post-F19)

Con `"this index is not necessary, configure using single field index controls"`. Los single-field indexes están auto-habilitados en COLLECTION + COLLECTION_GROUP scope por default. Solo se declaran composite indexes (multi-field) en JSON. La query `collectionGroup('notes').where('deletedAt', '>', 0)` funciona con el implícito sin declaración. Si se necesita un single-field exemption (ej. desactivar índice para campos grandes), usar `fieldOverrides` con `indexes: []`. La entry `"indexes": "firestore.indexes.json"` en `firebase.json` sigue siendo necesaria para que `firebase deploy --only firestore:indexes` encuentre el archivo (sino falla silencioso, no es opcional).

## Bulk delete masivo: chunkear de 50; sleep 200ms entre chunks SOLO en CFs scheduled (post-F19)

Cuando una operación dispara N deletes paralelos que cascadean a CFs (ej. F3 `onNoteDeleted` con embedding + link queries por cada nota), N>100 puede saturar quotas de Firestore o disparar cold starts masivos. Dos patrones según contexto: (a) **cliente browser** ([src/infra/repos/notesRepo.ts](../../src/infra/repos/notesRepo.ts) `purgeAll`) chunkea de 50 con `Promise.allSettled` SIN sleep — el round-trip al servidor ya espacia los writes lo suficiente; (b) **CF scheduled** ([src/functions/src/notes/autoPurgeTrash.ts](../../src/functions/src/notes/autoPurgeTrash.ts)) sí mete `await sleep(200ms)` entre chunks — sin viaje cliente-servidor, los chunks se ejecutan back-to-back y saturan quotas si no se espacian explícitamente. Aplicable a cualquier futuro bulk-delete (vaciar inbox, purgar tareas viejas).

## `firebase-functions@7.x` mantiene namespace v1 para Auth triggers (post-F47)

> **Histórico:** el caso de uso (counter del capacity gate) se eliminó en SPEC-53; la lección sobre los Auth triggers v1 se conserva.

`firebase-functions/v1` sigue funcional en versión 7.x para Auth triggers (`functions.region('us-central1').auth.user().onCreate(handler)` y `.onDelete(handler)`), aunque NO está documentado en context7 latest ni en docs oficiales — solo aparece v2 `beforeUserCreated` de `firebase-functions/v2/identity` (que es blocking y requiere upgrade a Identity Platform, costo $$$). Para triggers Auth async post-create sin upgrade de plan, v1 sigue siendo la opción viable. Diferencias clave vs v2: (a) `functions.region(...)` se setea como method chain (no como opción del trigger config); (b) handler recibe el `User` directo (no event wrapper como v2); (c) no hay `retry` config (v1 nunca retried Auth triggers); (d) registrado como Gen 1 en Firebase Console (label "1st Gen", visible en `firebase deploy:functions` output). Migrar a v2 blocking solo cuando billing lo justifique — el costo de Identity Platform por user activo mensual no se amortiza para single-user-ish proyectos. Patrón vivo en [src/functions/src/auth/userCountTriggers.ts](../../src/functions/src/auth/userCountTriggers.ts).

## Counter mantenido por Auth triggers vs `listUsers()` paginado en cada check (post-F47)

> **Histórico:** el counter `config/app.userCount` se eliminó en SPEC-53 — el capacity pasó a contar la `allowlist/` real **en la aprobación** (no las cuentas Auth en el signup). La lección sobre el trade-off counter-por-triggers vs `listUsers()` se conserva.

Para features que necesitan saber "cuántos users hay registrados" (ej. capacity gate, feature flag con cohort threshold, billing tier checks), hay dos approaches: (a) llamar `admin.auth().listUsers(1000)` paginado en cada check (O(n) per call, costoso post-1000 users, agrega latencia 200ms-2s por check); (b) mantener un counter en Firestore (ej. `config/app.userCount`) actualizado por triggers `onUserCreated` con `FieldValue.increment(1)` y `onUserDeleted` con `increment(-1)` (O(1) read + O(1) increment per signup). Trade-off del approach (b): los triggers v1 son async post-create → race posible donde 2 signups simultáneos pasan check con counter pre-increment de ambos, beta excedida por 1 puntualmente, eventually consistent. Aceptable para gates UX no críticos; si el cap es legalmente hard (billing tier exact limit), migrar a v2 blocking `beforeUserCreated` con check sync ANTES del create. **Seed inicial obligatorio** (ver siguiente gotcha) sino el counter empieza en 0 ignorando users pre-feature. Patrón vivo en [src/functions/src/auth/userCountTriggers.ts](../../src/functions/src/auth/userCountTriggers.ts) (write) + [src/hooks/useSignupCapacity.ts](../../src/hooks/useSignupCapacity.ts) (read).

## Logs de error en CFs nunca raw — helper `sanitizeError` obligatorio (post-audit-2026-05)

Anthropic/OpenAI SDKs incluyen partes del prompt original en `error.message` en ciertos casos (timeout, rate limit con echo de input, validation errors con dump del request body). Loguear `err.message` o `String(err)` directo persiste contenido del user en Cloud Logging, accesible a cualquiera con `roles/logging.viewer` del proyecto. Usar el helper compartido [src/functions/src/lib/sanitizeError.ts](../../src/functions/src/lib/sanitizeError.ts) en TODOS los catches de CFs que tocan APIs externas (LLMs, OAuth, third-party HTTP). El helper extrae `code` si existe + trunca `message` a 200 chars. Patrón canónico: `const { code, message } = sanitizeError(error); logger.error('handler: failed', { userId, entityId, code, message })`. Aplicable a futuras CFs que loggeen errores de cualquier SDK que pueda incluir input del user en error messages.

## `MAX_CONTENT_CHARS` cap antes de llamadas LLM en CFs con input user (post-audit-2026-05)

CFs trigger sobre documents Firestore (`processInboxItem`, `autoTagNote`) reciben content del user sin límite de tamaño en la rule. Un user puede crear una nota/inbox-item de 5MB → cada save dispara una llamada cara a Anthropic/OpenAI procesando todo el body (o falla con `context_length_exceeded` tras consumir el slot de timeout). Cap obligatorio: constante local `MAX_CONTENT_CHARS = 10_000` (≈2500 tokens input) antes del try del SDK. Skip graceful con `logger.warn('handler: content too long, skipping', { userId, entityId, length })` y `return`. Constante LOCAL por CF (criterio de tamaño puede diferir entre handlers — embeddings tolera más, classification menos), no abstracción compartida prematura. Aplica a cualquier futura CF que pase content user a un LLM o API paga por tokens/length. Patrón vivo en [processInboxItem.ts](../../src/functions/src/inbox/processInboxItem.ts) + [autoTagNote.ts](../../src/functions/src/notes/autoTagNote.ts).

## Seed inicial obligatorio para counters mantenidos por triggers (post-F47)

> **Histórico:** ya no hay counter mantenido por triggers (eliminado en SPEC-53); la lección sobre el seed inicial se conserva para futuros counters incrementales.

Antes de activar triggers que mantienen un counter (`onUserCreated` → `increment(1)`), el doc del counter DEBE inicializarse con el estado actual del sistema. Sino el counter empieza en 0 y los datos pre-feature no se cuentan hasta que se borren y recreen (caso que típicamente NO pasa en producción) → counter queda permanentemente subestimado y el gate UX miente. Tres opciones para el seed: (1) **manual via Firebase Console** — `firebase auth:export users.json` localmente + contar líneas + setear doc desde Console UI (válido para single-user beta, sin overhead de código throwaway); (2) **script local con Admin SDK** — requiere service account JSON con riesgo de leak, evitar; (3) **CF callable temporal `seedXyzCounter`** — `onCall` que solo el dev (UID hardcoded) puede ejecutar, hace `auth.listUsers()` paginado + setea el doc + se elimina post-uso (válido para counters de >100 users donde el manual es tedioso). Decisión por scope: <100 entries → manual; >100 → CF temporal. Aplicable a cualquier counter mantenido por triggers (users registrados, notas creadas, tasks completadas, etc.) o cualquier dato derivado que se mantenga incrementalmente desde un punto del tiempo.

## Datos privados del cliente: colección top-level deny-all, no sub-path bajo el catch-all (post-F48)

Las Firestore rules son **aditivas (OR)**: un `allow read, write: if false` más específico NO bloquea si un `match` padre con wildcard ya concede acceso. El catch-all `match /users/{userId}/{document=**}` (ver gotcha arriba) da read/write al owner sobre TODO su subárbol — conveniente para datos del user, pero significa que **no podés tener un sub-path privado bajo `users/`** que el cliente no pueda leer (un `if false` anidado es no-op contra el catch-all). Para datos que el cliente NUNCA debe leer (secretos cifrados, tokens de terceros), usar una **colección top-level** con su propio bloque deny-all (`match /userSecrets/{userId}/{document=**} { allow read, write: if false }`). El Admin SDK de las CFs bypassa rules siempre, así que las funciones siguen accediendo. F48 lo usó para las API keys cifradas BYOK; la metadata legible no sensible (configured/last4) sí puede vivir bajo `users/`. Vivo en [firestore.rules](../../firestore.rules).

## API keys per-user (BYOK): cifrado en Firestore con factory en runtime, no defineSecret (post-F48)

`defineSecret` solo sirve para secrets **estáticos del proyecto** (inyectados deploy-time vía `secrets: [...]` + `.value()`). Para keys **per-user** (BYOK) el secret es dinámico → patrón: el cliente manda la key en claro UNA vez a una CF callable (TLS), que la valida, la cifra y la persiste en una colección deny-all (`userSecrets/`). Las CFs trigger leen+descifran en runtime con un **factory** (`getUserAnthropicKey(userId, masterKey)`), no con `defineSecret`. Piezas:

- **Cifrado:** AES-256-GCM ([lib/crypto.ts](../../src/functions/src/lib/crypto.ts)) — `decipher.setAuthTag()` DEBE ir antes de `update`/`final` (sino GCM no verifica integridad), master key de 32 bytes validada, IV aleatorio de 12 bytes por escritura. La master key (única del proyecto) sí va por `defineSecret('BYOK_MASTER_KEY')`.
- **Validación al guardar:** ping liviano de solo-lectura al provider (`GET /v1/models`) distinguiendo `invalid` (401/403 → rechazar con `HttpsError`) de `unknown` (429/5xx/network → NO persistir pero NO rechazar — guardar una key no verificada por error transitorio causa fallos posteriores que se ven como bug). Timeout vía `AbortSignal.timeout`.
- **Key revocada en uso:** un 401 en el trigger (key válida al guardar, revocada después) se auto-invalida (borrar ciphertext + `configured:false` vía WriteBatch) para cortar reintentos perpetuos en CFs `onDocumentWritten`.
- **Atomicidad:** ciphertext + metadata se escriben/borran con `WriteBatch` (cross-collection) para evitar estado parcial inconsistente.

Base para F49+ (más providers). Vivo en [saveApiKey.ts](../../src/functions/src/settings/saveApiKey.ts) + [getUserAnthropicKey.ts](../../src/functions/src/lib/getUserAnthropicKey.ts).

## Allowlist en rules no normaliza el email: seed lowercase y fail-closed (post-SPEC-50)

SPEC-50 F4 agregó un gate de beta cerrada: el `match /users/{userId}/{document=**}` exige, en AND con C1, `exists(/databases/$(database)/documents/allowlist/$(request.auth.token.email))`. Las Firestore rules NO tienen función de normalización usable dentro del path de `exists()` → el doc ID de `allowlist/{email}` debe coincidir con `request.auth.token.email` **carácter por carácter**. Estrategia: (a) seed siempre lowercase+trim; (b) normalizar en todos los puntos JS — server (`isAllowlisted`, usado por `checkMyAccess`/`assertAllowlisted`, con `.trim().toLowerCase()`) y cliente (`normalizeEmail`); (c) las rules asumen `token.email` lowercase (Google entrega lowercase; Firebase normaliza email/pw). Si un provider entregara mixed-case, el `exists()` falla → **fail-closed (deny)**, la dirección segura: un legítimo denegado se recupera re-seedeando con el casing exacto; un ilegítimo admitido no. La fuente autoritativa del casing es `firebase auth:export` (el `token.email` = el campo `email` del registro de Auth). Recovery de lockout es **instantáneo**: el `exists()` se evalúa en vivo por request, corregir el doc en Console restaura acceso sin re-deploy. Enforcement siempre en **AND, nunca OR** (las rules son aditivas). Vivo en [firestore.rules](../../firestore.rules) + [assertAllowlisted.ts](../../src/functions/src/lib/assertAllowlisted.ts) + [normalizeEmail.ts](../../src/lib/normalizeEmail.ts).

## Gate por `exists()` en rules: seedear el backstop ANTES del deploy de rules (auto-lockout) (post-SPEC-50)

Cuando una rule nueva condiciona el acceso a la existencia de un doc (ej. el allowlist `exists()` de SPEC-50 F4), apenas se deploya bloquea a TODA cuenta que no tenga su doc — **incluida la del operador y las de prueba**. Orden obligatorio: **seedear el/los doc(s)** (email del dev + toda cuenta que deba sobrevivir) **ANTES** de `deploy:rules` — no "antes del login", antes de las rules. En la sesión de deploy de SPEC-50 el seed se hizo manual en Console (el Firebase MCP no estaba conectado, el CLI `firebase` no escribe docs y el Admin SDK no tenía ADC). Aplica a cualquier futuro gate basado en `exists()`/lookup en rules. Recuperable en vivo (corregir el doc), pero el lockout transitorio es evitable seedeando primero. Vivo en [firestore.rules](../../firestore.rules).

## Cambio de esquema de cifrado sin fallback: wipear el store cifrado ANTES del deploy de functions (post-SPEC-50 F7)

SPEC-50 F7 ató el ciphertext BYOK al uid (AAD) y agregó `keyVersion`, **EXIGIDO** por `decryptSecret` sin fallback v0 (D5). Los docs en formato viejo (sin AAD/`keyVersion`) ya no descifran → throw. Por eso, al cambiar el esquema de cifrado sin doble-path de compat, hay que **wipear `userSecrets/` ANTES del deploy de las functions nuevas** (sino, apenas deployan, cada uso de una key vieja falla). El usuario re-ingresa su key una vez post-deploy. Orden ejecutado: wipe (`firebase firestore:delete userSecrets --recursive --force`) → `deploy:functions`. Decisión consciente (D5): wipe en vez de mantener un decrypt v0 frágil, honesto porque no había keys de prod reales (beta sin abrir). Aplica a cualquier rotación futura de esquema cripto sin versioned-decrypt fallback. Vivo en [crypto.ts](../../src/functions/src/lib/crypto.ts).

## Callable público que revela estado = oráculo de enumeración; cerrarlo es autenticarlo + leer del token (post-SPEC-51, A-3)

Un callable público (sin `request.auth`) que recibe un identificador y devuelve estado sobre él es un **oráculo de enumeración**: el valor de retorno ES la fuga; un mensaje genérico NO lo mitiga, y `maxInstances` solo acota costo/concurrencia, no el oráculo. Caso histórico: `checkAllowlist(email) → { allowed }` (SPEC-50 F5) revelaba 1-a-1 quién estaba invitado a la beta. **App Check se evaluó y se descartó** para esto (probabilístico/score-based, no cubre el vector real de abuso de costo de callables autenticadas como `embedQuery`, y rompe Tauri/Chrome-extension sin custom provider — ver discovery en SPEC-51). **La solución estructural** (SPEC-51 F1): convertir el callable a **autenticado** y que lea el identificador del **propio token** (`request.auth.token.email`) en vez de recibirlo como input → `checkMyAccess()` solo responde "¿yo tengo acceso?", imposible enumerar terceros. El gate de allowlist pasó de pre-auth a **post-auth unificado** (Google + email/pw): se crea la sesión, se consulta `checkMyAccess`, y si no está autorizado → `signOut` + mensaje genérico (las cuentas no-allowlisted quedan inertes vía rules, D4). Regla general: **ningún callable público debe recibir un identificador de tercero y devolver estado sobre él**; si el flujo lo necesita, autenticá y leé del token. Vivo en [checkMyAccess.ts](../../src/functions/src/auth/checkMyAccess.ts) + [useAuth.ts](../../src/hooks/useAuth.ts).

## Allowlist como gestión de acceso: crear el doc da acceso, borrarlo lo revoca al instante (post-SPEC-50)

El gate de allowlist (SPEC-50 F4/F5) NO es solo un control de deploy — es la **gestión de acceso operacional continua** de la beta. Cualquier cuenta nueva necesita su email en `allowlist/{email-lowercase}` (casing exacto de `token.email`) **ANTES** de poder usar la app: sin ese doc, las rules niegan todo `users/**` y los callables `saveApiKey`/`deleteApiKey`/`embedQuery` rechazan con `permission-denied` (`embedQuery` adquirió `assertAllowlisted` en SPEC-51 F6 — antes era el hueco que un verificado-no-allowlisted podía explotar). El ciclo de vida:

- **Alta de un usuario a la beta** = crear el doc `allowlist/{email}` (Console o script). Acceso disponible **al instante** — el `exists()` se evalúa en vivo por request, sin re-deploy.
- **Baja / revocación** = borrar el doc. Desde **SPEC-53** hay una CF admin-only `revokeAccess` (primer writer de borrado; antes era manual en Console). **Soft revoke:** revoca al **próximo gate** — las rules niegan toda I/O nueva y `checkMyAccess` falla en el próximo login, pero NO hay heartbeat: una sesión activa sigue con su cache local hasta tocar Firestore. NO re-deploya rules ni toca Firebase Auth — la cuenta sigue en Auth, inerte. (El counter `config/app.userCount` ya no existe — eliminado en SPEC-53; el capacity se mide contando la allowlist en la aprobación.)

Es la base operacional de la futura rotación de usuarios inactivos. Hoy la única cuenta allowlisted es la del operador. Estado vivo del gate en `Spec/ESTADO-ACTUAL.md`; vivo en [firestore.rules](../../firestore.rules) + [assertAllowlisted.ts](../../src/functions/src/lib/assertAllowlisted.ts).

## `admin.firestore.FieldValue`/`Timestamp` quedan `undefined` en el emulador de Functions (post-SPEC-52)

El runtime del **emulador de Functions** envuelve `admin.firestore()` para apuntarlo al emulador y, al hacerlo, deja los **miembros estáticos** del namespace en `undefined`: `admin.firestore.FieldValue.increment(...)`, `.serverTimestamp()` y `admin.firestore.Timestamp.fromMillis(...)` crashean con `Cannot read properties of undefined`. La **llamada** `admin.firestore()` sí funciona en el emulador; solo se pierden los estáticos colgados de la función. En node plano y en prod desplegado están definidos (firebase-admin 13.8.0) — por eso el patrón `admin.firestore.FieldValue.*` (vivo en `userCountTriggers.ts`, `saveApiKey.ts`) anda en prod pero **no es ejecutable en el emulador** (cualquier E2E de una CF que lo use revienta con `internal`). **Solución (API recomendada v13, behavior-preserving en prod):** imports modulares `import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'` y usar `getFirestore()` / `FieldValue.x` / `Timestamp.x` — esos bindings no pasan por el `admin.firestore` monkeypatcheado, así que funcionan idéntico en emulador y prod. SPEC-52 lo aplicó a `rateLimit.ts` (compartido, en el path de `submitAccessRequest`) + las 3 CFs de access (submit/list/process); `saveApiKey.ts` quedó con el patrón viejo (anda en prod, fuera del path del E2E — migrar a modular si se quiere correr en el emulador). (`userCountTriggers.ts` también lo tenía, pero se **eliminó en SPEC-53**.) Detectado corriendo el E2E de SPEC-52 con `firebase emulators:exec --only functions,firestore`. Vivo en [rateLimit.ts](../../src/functions/src/lib/rateLimit.ts) + [submitAccessRequest.ts](../../src/functions/src/access/submitAccessRequest.ts).

## Capacity enforced en la aprobación con `count()` (Plan B fuera de tx); `count()` en tx no garantizado en emulador (post-SPEC-53)

SPEC-53 movió el límite de la beta del **signup** (counter `config/app.userCount` async por triggers, aproximado por diseño — D4 F47) a la **aprobación** (`processAccessRequest` approve, acción admin síncrona): cuenta la `allowlist/` real con un aggregation `count()`. Tres lecciones:

- **El valor de la tx acá es atomicidad, no concurrencia.** Hay un solo admin aprobando secuencialmente → dos aprobaciones solapadas en el server son prácticamente imposibles. Lo que importa es que `check de capacity + upsert allowlist + marca approved` sean todo-o-nada (sin "marcó approved pero no escribió allowlist"). Eso se logra metiendo los dos `tx.set` DENTRO de `runTransaction`.
- **`count()` va FUERA de la tx (Plan B).** `firebase-admin` permite `transaction.get(collection.count())`, pero el **emulador de Firestore** no garantiza aggregation dentro de transacciones (historial de bugs, firebase-tools #6808) y no había harness E2E de callables para validarlo temprano. Como con un solo admin la race que el count-en-tx prevendría no ocurre, se cuenta antes de abrir la tx (`await allowlist.count().get()`) y se preserva la atomicidad escribiendo los docs dentro. count-en-tx queda como cleanup opcional si algún día hay concurrencia real. La lógica de decisión se extrajo a una función pura `decideApproval({ alreadyMember, current, maxUsers })` (testeable sin I/O, idempotente para ya-miembros, fail-closed con `maxUsers` ausente=0).
- **Read-before-write + normalización de la key.** Dentro de la tx todas las lecturas (`tx.get(reqRef)`, `tx.get(allowRef)`) van ANTES de los `tx.set`. La key de `allowlist/` se normaliza explícito (`(email ?? id).trim().toLowerCase()`) — debe matchear `token.email` lowercase char-por-char (ver gotcha "Allowlist en rules no normaliza el email"), no se confía en que el doc id venga normalizado.

Beta llena → `HttpsError('resource-exhausted', 'Beta llena', { maxUsers, current })`: el 3er arg (details) viaja al cliente como `err.details` para el mensaje con el número. Vivo en [processAccessRequest.ts](../../src/functions/src/access/processAccessRequest.ts) + [capacity.ts](../../src/functions/src/access/capacity.ts).

## Borrado total de cuenta self-service: gate reauth server-side, wipe idempotente, range query de rateLimits, Auth huérfano (post-SPEC-64)

`deleteAccount` (SPEC-64 F1) es el primer callable de **wipe total e irreversible self-service** (no admin-only). Lecciones:

- **Self-service, NO admin-only.** El gate es `auth + reauth reciente`, NO `requireAdmin`/secret de admin. ⚠️ Copiar el molde `revokeAccess.ts` mecánicamente e inyectar `requireAdmin` rechazaría a TODO usuario normal. El callable es obligatorio (no client SDK) porque `userSecrets/` es deny-all al cliente — solo el Admin SDK puede borrar el ciphertext BYOK.
- **Gate de reauth server-enforced ANTES de cualquier I/O.** Leer `request.auth.token.auth_time` (es **number**, Unix seconds, en el `DecodedIdToken` del Admin SDK — el "string" es del `IdTokenResult` del SDK cliente). Si `now/1000 - auth_time > 300s` → `failed-precondition` (`reauth-required`), ANTES de `getFirestore()`/`recursiveDelete`. **Fail-closed:** `auth_time` ausente/no-finito = expirado. El cliente DEBE forzar `getIdToken(true)` tras el reauth para que el `auth_time` fresco viaje en el token (sino rechazo espurio). Lógica pura separada en `reauthGate.ts` (`isReauthExpired`) para unit testing.
- **Wipe idempotente, `auth().deleteUser` ÚLTIMO.** Orden: `recursiveDelete(users/{uid})` (doc FANTASMA — sin doc raíz, solo subcolecciones; `recursiveDelete` las borra igual) → `recursiveDelete(userSecrets/{uid})` → `allowlist/{email}` + `accessRequests/{email}` (guard: saltar si el token no trae email — evita `allowlist/undefined`) → `rateLimits` del uid → `auth().deleteUser` ÚLTIMO. NO transaccional (cruza Firestore+Auth) → estrategia = idempotencia + reintento, no rollback. `user-not-found` = éxito idempotente.
- **Range query de rateLimits sin campo uid: `documentId()` con bound `[uid__ … uid__ + U+FFFF)`.** Los docs son `{uid}__{key}__{window}__{slot}` (sin campo uid) → se borran por `where(FieldPath.documentId(), '>=', uid+'__').where(..., '<', uid+'__'+String.fromCharCode(0xffff))` (**FieldPath**, NO FieldValue). **SEGURIDAD DEL BOUND (suposición explícita):** que NO barra rateLimits de OTRO uid depende de que los UIDs de Firebase Auth sean **longitud-fija (28 chars) alfanuméricos SIN underscore** → ningún uid es prefijo de otro, y el char inmediato tras `{uid}` nunca es `_`. Un custom UID con `_` o longitud variable rompería el bound (borraría docs ajenos en silencio) → **revisar este query ANTES de habilitar custom UIDs.**
- **Auth huérfano + retry de W6 (mitigación de PII residual).** Si `auth().deleteUser` falla DESPUÉS de borrar `allowlist/{email}`, el usuario queda bloqueado (el gate de la beta rechaza el login → no llega a `/settings` → no auto-reintenta) y su **email (PII) queda vivo en Auth** — justo lo que el borrado promete eliminar. La recuperación real ahí es por **SOPORTE** (borrar el Auth huérfano a mano), NO el usuario. Por eso W6 **reintenta hasta 3 veces** (backoff lineal 300/600 ms) ante error transitorio antes de `delete-account-failed` — mitigación, **no** garantía. NO vender "idempotente, el usuario reintenta" para este sub-caso.

Verificado: emulador (`test:functions`, wipe del doc fantasma + idempotencia + gate), smoke no-destructivo en prod (sin-auth → 401 `delete-account-unauthenticated`), smoke destructivo en prod con throwaway (wipe total confirmado server-side). Vivo en [deleteAccount.ts](../../src/functions/src/account/deleteAccount.ts) + [reauthGate.ts](../../src/functions/src/account/reauthGate.ts). Fork cliente (web modal / Android Custom Tab / Tauri oculto) en [DeleteAccountSection.tsx](../../src/components/settings/DeleteAccountSection.tsx).
