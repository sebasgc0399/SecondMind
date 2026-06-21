# Inventario de datos verificado — SecondMind

> **Propósito:** insumo factual para redactar la privacy policy real (reemplazo del placeholder de `/privacy`). **Este documento NO es la privacy policy** y no propone texto legal — es un inventario de qué datos toca el código, dónde viven y hacia dónde salen.
>
> **Método:** auditoría read-only multi-agente (9 investigadores de inventario A–I + 15 sondas de verificación adversarial independiente), principio **VERIFICAR-NO-ASUMIR**. Cada afirmación cita `archivo:línea` real; las ausencias se reportan explícitamente con el patrón de búsqueda usado. Los SPECs/CLAUDE.md se usaron solo como pistas de _dónde_ mirar, no como verdad.
>
> **Fecha:** 2026-06-20 · **Rama:** `docs/privacy-data-inventory` · **Proyecto Firebase:** `secondmindv1` · **Región de Cloud Functions:** `us-central1` (EE. UU.).
>
> **Nota de confianza:** los `archivo:línea` provienen de los subagentes; los puntos load-bearing y disputados (conteo de CFs, reglas de seguridad) fueron re-verificados directamente sobre el repo y se marcan con ✅ **verificado en esta sesión**. Algunas citas a `Spec/*.md` se marcan como referencia documental (no son código).

---

## Resumen ejecutivo de hallazgos críticos (C, D, F)

- **C — BYOK keys:** la API key de Anthropic del usuario se cifra con **AES-256-GCM** (IV aleatorio de 12 bytes por escritura, AAD = `userId`, master key de 32 bytes en Secret Manager) y se guarda en `userSecrets/{uid}/keys/anthropic` (Firestore **deny-all** client-side). El cliente **nunca** ve la key completa tras guardarla — solo metadata `{ configured, last4 }`. La key descifrada **solo** sale hacia `api.anthropic.com`. ✅
- **D — Terceros:** dos proveedores reciben contenido del usuario. **Anthropic** (`processInboxItem` → `rawContent`; `autoTagNote` → `contentPlain`) con la **key BYOK del usuario** (opt-in: sin key configurada, no se llama). **OpenAI** (`generateEmbedding` → `contentPlain`; `embedQuery` → texto de búsqueda) con la **key del proyecto** (`OPENAI_API_KEY`). **`generateEmbedding` corre automático en CADA escritura de nota, sin opt-out, y manda el `contentPlain` SIN cap de longitud.**
- **F — Borrado/derechos (ACTUALIZADO post-SPEC-64, v0.5.4):** **SÍ existe** borrado de cuenta in-app **self-service** — danger zone en Settings → CF `deleteAccount` hace **wipe total e irreversible** (todas las subcolecciones de `users/{uid}`, `userSecrets/`, `allowlist`/`accessRequests`, `rateLimits` + el Auth user), con gate de **reauth reciente server-side** (`auth_time`). En Android el botón abre la danger zone web en un Custom Tab; Tauri oculto en v1. **SIGUE sin existir** export/descarga de datos → **gap de portabilidad** GDPR/CCPA pendiente (el de borrado quedó cerrado). La papelera sigue siendo soft-delete con retención configurable (0/7/15/30 días, default 30).

### ⚠️ Discrepancias detectadas vs. docs/memoria (a tener en cuenta al redactar)

1. **Conteo de Cloud Functions: son 15** (post-SPEC-64). ✅ Eran 14; SPEC-64 agregó `deleteAccount` (la 15ª — v2 callable, wipe total). CLAUDE.md/memoria viejos dicen "11 (9 v2 + 2 v1 auth triggers)" — **stale**. Hoy son **15 funciones v2 y cero triggers v1** (los `onUserCreated`/`onUserDeleted` se eliminaron en SPEC-53).
2. **Android — permisos de publicidad transitivos.** El manifest _fuente_ solo declara `INTERNET` + un intent SEND. Pero el manifest _fusionado del build release_ declara `AD_ID` y `ACCESS_ADSERVICES_*` (Privacy Sandbox) y una `CustomTabActivity` de **Facebook** (`fbconnect://`), inyectados por el plugin `@capgo/capacitor-social-login` (trae Google Play Services Ads + Facebook SDK) — aunque la app solo usa Google sign-in. Relevante para el formulario **Data Safety** de Play. Ver § I.
3. **Sin opt-out de embeddings (OpenAI).** No es una omisión menor: todo el texto plano de cada nota se envía a OpenAI automáticamente, sin control del usuario. Ver § D.

---

## A. AUTH y perfil de usuario

**Métodos de sign-in REALMENTE habilitados — los tres, según plataforma:**

- **Google** (todas las plataformas): web `signInWithPopup`, Capacitor nativo, Tauri OAuth2 PKCE — `src/hooks/useAuth.ts:76-88`; nativo en `src/lib/capacitorAuth.ts:12-25` y `src/lib/tauriAuth.ts:30-135`.
- **Email/contraseña** (web): `signInWithEmailAndPassword` (`src/hooks/useAuth.ts:90-92`) + `createUserWithEmailAndPassword` en signup (`src/hooks/useAuth.ts:94-112`).
- UI con tabs signin/signup + botón Google: `src/components/auth/LoginCard.tsx:74-82`, `SignInForm.tsx:16,27`, `SignUpForm.tsx:18,62`.

**Gate de signup (capacidad de la beta):**

- Flag `signupsEnabled` leído de `config/app` — `src/hooks/useSignupsEnabled.ts:20-24` (fail-closed: doc ausente o flag ≠ true ⇒ registro cerrado). Gate **solo UI** (oculta el form): `src/components/auth/SignupGate.tsx:55-71`.
- La **capacidad** real (`maxUsers`) se aplica en la **aprobación** (no en el signup): `src/functions/src/access/processAccessRequest.ts:59-82` (cuenta la allowlist real vs `config/app.maxUsers`).
- Gate post-auth de allowlist: `checkMyAccess` (callable autenticado) — `src/functions/src/auth/checkMyAccess.ts:17-29`.

**Campos de perfil que se leen (de Firebase Auth, NO de Firestore):**

- `email`, `uid`, `displayName`, `photoURL`, `emailVerified` viven en el objeto `User` de Firebase Auth — `src/hooks/useAuth.ts:64-74`.
- Uso: `emailVerified` para el banner de verificación (`src/app/layout.tsx:115,142`); `photoURL`+`displayName` para el avatar del Sidebar (`src/components/layout/Sidebar.tsx:56-91`); `email` en el flujo verify-email (`src/components/auth/VerifyEmailAction.tsx:111`).
- **Ninguno de estos campos se persiste a Firestore.** Quedan en el sistema de Auth de Google.

**¿Existe doc de perfil `users/{uid}` raíz? NO.** ✅

- El signup (`src/hooks/useAuth.ts:94-112`) crea el usuario en Auth, corre `enforceAccessGate()` y manda verificación de email — **ningún `setDoc` de perfil**.
- Los `onUserCreated`/`onUserDeleted` (v1, solo incrementaban un counter) **fueron eliminados** en SPEC-53; `src/functions/src/index.ts` no los exporta. Existe JS compilado obsoleto en `src/functions/lib/auth/userCountTriggers.js:65-88` que ya **no se despliega** (probe A1).
- Verificación de email **server-side** para email/pw (Google auto-verifica) — `firestore.rules:15-20` ✅.

---

## B. Firestore — dato personal por colección

Todo cuelga de `users/{uid}/` bajo la regla catch-all owner-only (`firestore.rules:4-21` ✅). Contenido de usuario en **negrita**.

| Subcolección          | Path                                     | Contenido (campos clave)                                                                                                                                                                                                                                                                            | Evidencia                                                                    |
| --------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Notas                 | `users/{uid}/notes/{noteId}`             | **`title`, `content` (TipTap JSON), `contentPlain` (texto plano)**, `paraType`, `noteType`, `source`, `projectIds/areaIds/tagIds`, `outgoingLinkIds/incomingLinkIds`, **`summaryL3`, `aiTags`, `aiSummary`**, `distillLevel`, `fsrsState/fsrsDue`, `isFavorite/isArchived`, `deletedAt`, timestamps | `src/types/note.ts:3-35`; `src/stores/notesStore.ts:8-38`                    |
| Tareas                | `users/{uid}/tasks/{taskId}`             | **`name`, `description`**, `status`, `priority`, `dueDate`, `projectId/areaId/objectiveId`, `noteIds`, timestamps                                                                                                                                                                                   | `src/types/task.ts:3-18`; `src/stores/tasksStore.ts:6-22`                    |
| Proyectos             | `users/{uid}/projects/{projectId}`       | **`name`**, `status`, `priority`, `areaId/objectiveId`, `taskIds/noteIds`, `startDate/deadline`, timestamps                                                                                                                                                                                         | `src/types/project.ts:3-17`; `src/stores/projectsStore.ts:5-20`              |
| Objetivos             | `users/{uid}/objectives/{objectiveId}`   | **`name`**, `status`, `deadline`, `areaId`, `projectIds/taskIds`, timestamps                                                                                                                                                                                                                        | `src/types/objective.ts:3-14`; `src/stores/objectivesStore.ts:5-16`          |
| Inbox                 | `users/{uid}/inbox/{itemId}`             | **`rawContent` (captura cruda del usuario)**, `source` (quick-capture/web-clip/desktop-capture/voice/share-intent/email), `sourceUrl`, **`aiResult` (suggestedTitle/Tags/Type/Area, summary)**, `status`                                                                                            | `src/types/inbox.ts:4-10,31-41`; `src/stores/inboxStore.ts:7-24`             |
| Links                 | `users/{uid}/links/{sourceId__targetId}` | `sourceId/targetId`, **`sourceTitle/targetTitle`, `context`**, `linkType`, `strength`, `accepted`                                                                                                                                                                                                   | `src/types/link.ts:3-14`; `src/stores/linksStore.ts:3-15`                    |
| Hábitos               | `users/{uid}/habits/{YYYY-MM-DD}`        | `date`, 14 booleanos de hábito (ejercicio, codear, leer, meditar, pareja, etc.), `progress`, timestamps                                                                                                                                                                                             | `src/types/habit.ts:24-44`; `src/stores/habitsStore.ts:6-27`                 |
| Embeddings            | `users/{uid}/embeddings/{noteId}`        | **`vector` (number[]), `contentHash` (SHA-256 del texto)**, `model` (`text-embedding-3-small`), `createdAt`                                                                                                                                                                                         | `src/functions/src/embeddings/generateEmbedding.ts:66-72`                    |
| Preferences           | `users/{uid}/settings/preferences`       | `trashAutoPurgeDays`, flags de onboarding/distill, `sidebarHidden`, `splitPaneLayout`, `locale`, `lastSeenVersion`                                                                                                                                                                                  | `src/types/preferences.ts:1-41`; `src/lib/preferences.ts:43-45`              |
| **aiKeys (metadata)** | `users/{uid}/settings/aiKeys`            | **Solo** `anthropic: { configured: boolean, last4: string\|null }` — el `last4` son los últimos 4 chars de la key, para mostrar enmascarada. El ciphertext vive en `userSecrets/`                                                                                                                   | `src/types/apiKey.ts:6-13`; `src/functions/src/settings/saveApiKey.ts:74-78` |

- **`content` (TipTap JSON) NO vive en TinyBase** — se lee/escribe directo de Firestore al abrir la nota; `contentPlain` es la extracción de texto usada para embeddings/IA: `src/stores/notesStore.ts:3-5`.
- **Areas y Tags NO son colecciones.** Las areas son constantes hardcodeadas (`src/types/area.ts:1-13`); tags y areas se referencian como arrays de IDs (`tagIds`, `areaIds`) dentro de las notas (`src/stores/notesStore.ts:16-17`).
- **Embeddings son legibles por el dueño** (caen bajo el catch-all `users/{uid}/**`, no tienen deny-all propio) — son datos derivados del `contentPlain`, accesibles solo por el propio usuario.

**Colecciones top-level:**

- `config/app` — `{ signupsEnabled, maxUsers }`. **Read público**, write deny-all (Admin SDK): `firestore.rules:31-34` ✅.
- `userSecrets/{uid}/keys/{provider}` — ciphertext BYOK `{ ciphertext, iv, authTag, keyVersion, algo:'aes-256-gcm', updatedAt }`. **Deny-all** client-side: `firestore.rules:42-44` ✅; escritura en `saveApiKey.ts:69-72`.
- `allowlist/{email}` — `{ email, addedAt }`; la existencia del doc ES la membresía. **Deny-all** (las rules lo leen server-side; evita exponer ~100 emails como PII): `firestore.rules:52-54` ✅; tipo en `src/types/allowlistMember.ts:1-7`.
- `accessRequests/{email}` — formulario público de solicitud: `{ email, motivo (≤280 chars), status, createdAt, processedAt }`. **Deny-all** (pasa siempre por CFs): `firestore.rules:70-72` ✅; tipo en `src/types/accessRequest.ts:7-14`.
- `rateLimits/{...}` — contadores `{ count, expireAt }` por uid+key+ventana. **Deny-all**: `firestore.rules:60-62` ✅; `src/functions/src/lib/rateLimit.ts:66-72`.

---

## C. BYOK keys (crítico)

**Path del ciphertext:** `userSecrets/{userId}/keys/anthropic`, deny-all client-side — `src/functions/src/settings/saveApiKey.ts:69-73`; `firestore.rules:42-44` ✅.

**Cifrado — AES-256-GCM** (todo en `src/functions/src/lib/crypto.ts`):

- Constantes: `ALGO = 'aes-256-gcm'`, `IV_BYTES = 12`, `KEY_BYTES = 32`, `KEY_VERSION = 1` — `crypto.ts:7-9` (+ KEY_VERSION).
- **IV/nonce:** `randomBytes(12)` — **nuevo IV aleatorio por cada escritura**, 96 bits (tamaño recomendado GCM) — `crypto.ts:40-44`.
- **Auth tag:** `cipher.getAuthTag()` tras finalizar; se guarda junto al ciphertext/IV; en descifrado `setAuthTag()` antes de `final()` — `crypto.ts:40-51`.
- **AAD = `userId`** (`cipher.setAAD(Buffer.from(aad))`): el ciphertext de un usuario no se puede descifrar bajo otro uid aunque se tenga la master key — `crypto.ts:31-43`, AAD pasado en `saveApiKey.ts:63`.
- **Sin KDF:** la master key base64 se decodifica a 32 bytes crudos, con validación de tamaño (no PBKDF2/scrypt/Argon2) — `crypto.ts:23-29`.
- **Payload guardado:** `{ ciphertext, iv, authTag, keyVersion }` (base64) — `crypto.ts:16-21`; descifrado exige `keyVersion` conocida ANTES de tocar cripto, sin fallback — `crypto.ts:53-57`.

**Master key (`BYOK_MASTER_KEY`):**

- `defineSecret('BYOK_MASTER_KEY')`, leída con `.value()` **dentro** del handler (nunca top-level) — `saveApiKey.ts:12,63`; `autoTagNote.ts:12,48`; `processInboxItem.ts:12,57`.
- **NO está en el repo ni en el cliente** (probe C2, `confirmed_absent`): solo aparece como string de `defineSecret`; `.env.local` gitignored (`.gitignore:1-2`); se setea con `firebase functions:secrets:set` (`Docs/SETUP-WINDOWS.md:136`). Ningún client-side accede a `userSecrets`.

**¿La key del usuario sale a otro lado además de Anthropic? NO** (probe C3, `confirmed_absent`):

- `getUserAnthropicKey` se llama en exactamente 2 CFs (`autoTagNote.ts:48`, `processInboxItem.ts:57`); la key descifrada va directo a `new Anthropic({ apiKey: key })` y solo a `client.messages.create()`.
- La única otra salida de la key es la **validación** al guardarla: `GET https://api.anthropic.com/v1/models` con header `x-api-key` — `src/functions/src/lib/validateProviderKey.ts:10-18` (también Anthropic).
- No se loggea en claro (logs solo `userId/provider/last4`); en 401/403 se invalida (borra ciphertext + `configured:false`) — `getUserAnthropicKey.ts:34-44`, `processInboxItem.ts:129-134`.

**¿El cliente ve la key en claro tras guardarla? NO** (probe C4, `confirmed_absent`):

- `saveApiKey` devuelve solo `{ ok:true, last4 }` — `saveApiKey.ts:19-22,82`.
- El cliente solo parsea metadata `{ configured, last4 }` de `settings/aiKeys` — `src/lib/apiKeys.ts:28-36`; tipo `src/types/apiKey.ts:6-9`.
- La UI muestra enmascarado `sk-ant-…{{last4}}` — `src/components/settings/ApiKeysSection.tsx:51`. Sin lógica de descifrado client-side.

---

## D. Cloud Functions → terceros

**14 Cloud Functions, todas v2, cero triggers v1** — ✅ verificado en `src/functions/src/index.ts:5-18`. **Solo 2 proveedores externos** (Anthropic, OpenAI); las otras 10 CFs no llaman a terceros.

### Las 14 funciones

| #   | Función                | Tipo / trigger                                   | Tercero                 | Key                             |
| --- | ---------------------- | ------------------------------------------------ | ----------------------- | ------------------------------- |
| 1   | `processInboxItem`     | `onDocumentCreated` `users/{uid}/inbox/{itemId}` | **Anthropic**           | **BYOK usuario**                |
| 2   | `autoTagNote`          | `onDocumentWritten` `users/{uid}/notes/{noteId}` | **Anthropic**           | **BYOK usuario**                |
| 3   | `generateEmbedding`    | `onDocumentWritten` `users/{uid}/notes/{noteId}` | **OpenAI**              | **Proyecto** (`OPENAI_API_KEY`) |
| 4   | `embedQuery`           | `onCall` (autenticado)                           | **OpenAI**              | **Proyecto** (`OPENAI_API_KEY`) |
| 5   | `onNoteDeleted`        | `onDocumentDeleted` `notes/{noteId}`             | —                       | cascada embeddings+links        |
| 6   | `autoPurgeTrash`       | `onSchedule` (`0 3 * * *` UTC)                   | —                       | purga papelera                  |
| 7   | `saveApiKey`           | `onCall` (auth), `maxInstances:3`                | (Anthropic, validación) | —                               |
| 8   | `deleteApiKey`         | `onCall` (auth)                                  | —                       | borra ciphertext                |
| 9   | `checkMyAccess`        | `onCall` (auth), `maxInstances:5`                | —                       | lee allowlist                   |
| 10  | `submitAccessRequest`  | `onCall` (**público**), `maxInstances:5`         | —                       | escribe accessRequests          |
| 11  | `listAccessRequests`   | `onCall` (admin)                                 | —                       | —                               |
| 12  | `processAccessRequest` | `onCall` (admin)                                 | —                       | escribe allowlist               |
| 13  | `listAllowlistMembers` | `onCall` (admin)                                 | —                       | —                               |
| 14  | `revokeAccess`         | `onCall` (admin)                                 | —                       | borra allowlist (soft revoke)   |

(Tipos/config verificados en cada handler: `processInboxItem.ts:18-26`, `autoTagNote.ts:18-26`, `generateEmbedding.ts:13-20`, `embedQuery.ts:29-38`, `onNoteDeleted.ts:18-28`, `autoPurgeTrash.ts:48-56`, `saveApiKey.ts:27-35`, `deleteApiKey.ts:19-23`, `checkMyAccess.ts:17-29`, `submitAccessRequest.ts:92-102`, `listAccessRequests.ts:23-29`, `processAccessRequest.ts:22-28`, `revokeAccess.ts:18-24`.)

### Payloads exactos a terceros

- **`processInboxItem` → Anthropic:** envía **`rawContent`** (la captura cruda del inbox) embebido en `buildInboxUserPrompt(locale, rawContent)`. Modelo `claude-haiku-4-5-20251001`, `max_tokens:512`, cap `MAX_CONTENT_CHARS=10_000`. Key = **BYOK del usuario**; si no hay key, retorna sin llamar. — `processInboxItem.ts:35-36,57-83,14-16`; `src/functions/src/inbox/prompts.ts:34-37` (probe D1).
- **`autoTagNote` → Anthropic:** envía **`contentPlain`** (texto plano de la nota) embebido en `buildNoteUserPrompt(locale, contentPlain)`. Modelo `claude-haiku-4-5-20251001`, `max_tokens:256`, cap 10k, system con `cache_control: ephemeral`. Key = **BYOK del usuario**; sin key, retorna. — `autoTagNote.ts:33-34,48-80,14-16`; `src/functions/src/notes/prompts.ts:53-56` (probe D2).
- **`generateEmbedding` → OpenAI:** envía **`contentPlain`** a `embeddings.create({ model:'text-embedding-3-small', input: contentPlain })`. **Automático en cada `onDocumentWritten` de cualquier nota.** Key = **del proyecto** (`OPENAI_API_KEY`). — `generateEmbedding.ts:13-20,29-30,57-62,11` (probe D3). ⚠️ **Sin cap de longitud**: a diferencia de las 3 CFs de Anthropic, esta no aplica `MAX_CONTENT_CHARS` antes de OpenAI → manda el `contentPlain` completo (gap documentado en `Spec/audits/AUDIT-auth-keys-v0.5.md:216-222`).
- **`embedQuery` → OpenAI:** envía **el texto de búsqueda del usuario** (`request.data.text`) a `embeddings.create`. On-demand (al buscar), cap `MAX_TEXT_LENGTH=300`, rate-limit 60/min y 1000/día por uid, `maxInstances:5`. Key = **del proyecto** (`OPENAI_API_KEY`). — `embedQuery.ts:21-23,46,56,76-81,13,16,19`; cliente `src/lib/embeddings.ts:79-83`, `src/hooks/useHybridSearch.ts:69-70` (probe D4).

### ¿Se puede desactivar el envío a OpenAI (embeddings)? NO

- **No existe ningún toggle de opt-out.** `UserPreferences` (`src/types/preferences.ts:1-54`) no tiene campo de embeddings; búsqueda de `disableEmbedding|skipEmbedding|...` sin resultados. `generateEmbedding` corre incondicionalmente en cada escritura de nota (solo skip por contenido vacío o hash sin cambios), con la key del proyecto. El usuario **no controla** este flujo (a diferencia de Anthropic, que requiere que el usuario ponga su propia key).

---

## E. Chrome Extension (web clipper)

Vive en `extension/`, build independiente (`extension/vite.config.ts:1-8`, `extension/package.json`).

**Qué captura — solo texto seleccionado + título + URL:**

- `{ text: window.getSelection(), title: document.title, url: location.href }` — `extension/src/content/getSelection.ts:2-8`, inyectado via `chrome.scripting.executeScript` (`extension/src/popup/Popup.tsx:67-76`).
- **NO captura** HTML completo, DOM, ni screenshot (ver Ausencias).

**Dónde escribe:** `users/{userId}/inbox/{itemId}` con `{ id, rawContent, source:'web-clip', sourceUrl (limpia), sourceTitle, status:'pending', aiProcessed:false, createdAt }` — `extension/src/lib/firestore.ts:40-56`. Está **totalmente cableada** (no es stub): guarda en cada "Guardar en Inbox" (`Popup.tsx:86-103`).

- **Limpieza de tracking:** quita `utm_*`, `gclid`, `fbclid`, `dclid`, `msclkid`, `twclid`, `igshid`, `mc_cid`, `mc_eid` de la URL antes de guardar — `extension/src/lib/firestore.ts:4-32`.

**Auth y permisos:**

- `chrome.identity.getAuthToken()` → `GoogleAuthProvider.credential` → `signInWithCredential` (SDK `firebase/auth/web-extension`) — `extension/src/lib/auth.ts:1-15`.
- Config Firebase web pública hardcodeada (proyecto `secondmindv1`) — `extension/src/lib/firebaseConfig.ts:1-15` (normal/esperado en extensiones; no es secreto).
- `manifest.json` permisos: `["identity","activeTab","storage","scripting"]` — `extension/manifest.json:7`. **Sin `host_permissions`** — `manifest.json:1-25`. OAuth2 scopes `["openid","email","profile"]`, client_id en `manifest.json:21-24`. Key RSA fija para ID estable (`manifest.json:6`).
- **Sin encolamiento offline:** popup efímero, si no hay red muestra error — `Popup.tsx:99-101`.

---

## F. Borrado / retención / derechos del usuario

> **⚠️ ACTUALIZADO post-SPEC-64 (v0.5.4):** lo que sigue era el estado AL MOMENTO DEL INVENTARIO (pre-SPEC-64), cuando el borrado in-app NO existía. **Ahora SÍ existe:** danger zone en Settings (`DeleteAccountSection.tsx`) → CF `deleteAccount` (wipe total e irreversible: todas las subcolecciones de `users/{uid}`, `userSecrets/`, `allowlist`/`accessRequests`, `rateLimits` + Auth user; gate de reauth server-side). En Android el botón abre la danger zone web en un Custom Tab; Tauri lo oculta (v1). Los probes "NO" de F1/F2 quedan como registro histórico. **Sigue PENDIENTE:** export/descarga de datos (portabilidad).

**¿Flujo IN-APP para borrar cuenta + datos? NO** (probe F1, `confirmed_absent`):

- Settings solo tiene Appearance, Language, Sidebar, Trash, API Keys, App Info — `src/app/settings/page.tsx:1-110`; `src/components/settings/AppInfoSection.tsx:50-85`.
- `useAuth` exporta `signIn/signInWithEmail/signUpWithEmail/resetPassword/resendVerification/refreshUser/signOut` — **sin** `deleteUser`/`deleteAccount`/`reauthenticate` — `src/hooks/useAuth.ts:50-186`. Sidebar tiene "Cerrar sesión", no borrar cuenta — `Sidebar.tsx:176-184`.
- Revocar acceso (`revokeAccess`) **no borra** cuenta ni datos — solo quita de la allowlist (soft revoke), confirmado en copy i18n (`src/locales/en/translation.json`).

**¿Cloud Function que borre TODOS los datos de un usuario? NO** (probe F2, `confirmed_absent`):

- Ninguna de las 14 CFs hace wipe de usuario. Los v1 `onUserCreated`/`onUserDeleted` (que solo tocaban un counter) se eliminaron en SPEC-53. Las únicas deletes son `revokeAccess` (allowlist) y `onNoteDeleted` (una nota individual).

**¿Export/descarga de datos? NO** (probe F3, `confirmed_absent`):

- Sin sección de export en Settings; sin CF/endpoint de export; `baseRepo` solo expone CRUD (`create/update/remove/removeRaw`) — `src/infra/repos/baseRepo.ts:25-32`. Sin features de portabilidad/GDPR DSAR.

**Papelera / retención (sí existe, bien implementada):**

- Soft-delete: `softDelete` setea `deletedAt = Date.now()`, `restore` lo limpia a 0 — `src/infra/repos/notesRepo.ts:225-239`. Notas soft-deleted ocultas de grafo/búsqueda/URL (SPEC-19 F7).
- Auto-purge configurable: `0 (Nunca) / 7 / 15 / 30` días, **default 30** — `src/components/settings/TrashAutoPurgeSelector.tsx:14-50`; `src/functions/src/notes/autoPurgeTrash.ts:27-28`.
- `autoPurgeTrash` corre diario `0 3 * * *` UTC; purga solo tras vencer el plazo (`now - deletedAt ≥ purgeDays`); `purgeDays=0` ⇒ nunca — `autoPurgeTrash.ts:48-56,85-93`. Grace period para notas pre-F19 desde `2026-04-26` — `autoPurgeTrash.ts:10-21`.
- **Hard-delete** (purga programada o "Eliminar para siempre" / "Vaciar papelera" manual) dispara `onNoteDeleted` → borra el embedding `embeddings/{noteId}` + **todos** los links donde la nota es `sourceId` o `targetId` (batches de 500) — `src/functions/src/notes/onNoteDeleted.ts:18-81,39-47,55-65`.

---

## G. Analytics / telemetría

**No hay NINGÚN SDK de analytics/telemetría/crash activo en ninguna plataforma** (probe G1 + sección G, `confirmed_absent`):

- `package.json` (raíz, functions, extension): sin `posthog/sentry/crashlytics/mixpanel/amplitude/segment/plausible/datadog/gtag` — `package.json:28-77`, `extension/package.json:10-13`, `src/functions/package.json:15-20`.
- **Firebase Analytics NO se inicializa:** `src/lib/firebase.ts:1-34` solo llama `getAuth/initializeFirestore/getFunctions`; `measurementId` está en config pero **nunca** se pasa a `getAnalytics()` (no existe esa llamada en todo el repo).
- `index.html:1-29`: sin GTM/gtag/scripts de analytics. Sin `navigator.sendBeacon` en `src/`.
- **Tauri:** `src-tauri/tauri.conf.json` sin plugins de telemetría; `src-tauri/Cargo.toml:20-34` sin crates de telemetría.
- **Capacitor/Android:** `capacitor.config.ts` solo SplashScreen; `android/app/google-services.json` solo `appinvite_service` (sin `analytics_service`/`crashlytics_service`/`performance_service`).
- ⚠️ **Matiz (ver § I):** "sin SDK de analytics inicializado" ≠ "sin permisos de publicidad declarados". El build de Android **declara** permisos `AD_ID`/`adservices` por dependencias transitivas del plugin social-login, aunque ningún código los use.

---

## H. Firebase Storage

**Storage NO se usa en runtime hoy** (probe H1 + sección H, `confirmed_absent`):

- `storageBucket` está en la config (web y extensión) pero **`getStorage()` nunca se llama/importa** — `src/lib/firebase.ts:1-35`, `extension/src/lib/firebaseConfig.ts:1-16`.
- Editor TipTap **sin** extensión Image ni handlers de paste/drop de imagen — `src/components/editor/NoteEditor.tsx:50-81`; `transformPastedHTML` solo limpia `style/class` (`NoteEditor.tsx:78-80`). Sin `@tiptap/extension-image` instalado.
- Sin `uploadBytes/uploadString/ref(storage)/Blob/FormData` en `src/` ni en functions. Sin `storage.rules`. `notesStore` sin campos de adjuntos/imágenes.
- Drag & drop de imágenes con upload a Storage es **roadmap, no implementado** — `Spec/ESTADO-ACTUAL.md:504`. **Excluir Storage de la privacy policy actual.**

---

## I. Permisos Android (Capacitor) · iOS

**iOS: no existe.** No hay carpeta `ios/` ni proyecto Xcode; scripts solo `android` — `package.json:24-26` (probe/sección I). Capacitor lo soporta pero nunca se corrió `cap add ios`.

**Manifest FUENTE** (`android/app/src/main/AndroidManifest.xml` — lo que declara el dev):

- `INTERNET` — línea 50.
- Intent-filter `SEND` + `text/*` (recibe texto compartido) — líneas 28-32.
- `FileProvider` (`external-path`, `cache-path`, `exported=false`) — líneas 35-45; `res/xml/file_paths.xml:2-5`.
- Intent-filter `MAIN`+`LAUNCHER` — líneas 23-26.
- **`allowBackup="false"`** (bloquea backup del sistema Android) — línea 7.

**Manifest FUSIONADO del build release** (`android/app/build/intermediates/merged_manifests/release/.../AndroidManifest.xml` — lo que termina en el APK, inyectado por dependencias):

- ⚠️ **`AD_ID` + `ACCESS_ADSERVICES_ATTRIBUTION/AD_ID/CUSTOM_AUDIENCE/TOPICS`** (Google Privacy Sandbox) — líneas 30-34. Inyectados por Google Play Services Ads vía el plugin social-login.
- ⚠️ **Facebook `CustomTabActivity`** con deep link `fbconnect://cct.com.secondmind.app` — líneas 123-135. Del Facebook SDK que trae el plugin social-login (la app solo usa Google).
- `USE_BIOMETRIC` / `USE_FINGERPRINT` (androidx.credentials) — líneas 15-16.
- `BIND_GET_INSTALL_REFERRER_SERVICE` (Play Billing) — línea 41.
- `USE_CREDENTIALS` (del manifest del plugin: `node_modules/@capgo/capacitor-social-login/android/src/main/AndroidManifest.xml:3`).
- Permiso de firma propio `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` — líneas 36-40.
- Plugins Capacitor: `@capacitor/app`, `@capacitor/splash-screen`, `@capgo/capacitor-share-target`, `@capgo/capacitor-social-login` — `android/app/capacitor.build.gradle:12-15`. Google sign-in nativo en `MainActivity.java:13-14`.
- **Posible FCM inactivo:** `build.gradle` aplica `google-services` condicionalmente pero **no hay** `POST_NOTIFICATIONS` ni código de notificaciones → mensajería no activa hoy.

> **Implicación Data Safety (Play Console):** la presencia de `AD_ID`/`adservices` en el APK obliga a declarar el Advertising ID en el formulario de Data Safety, aunque el código no use publicidad. Decisión pendiente para Sebastián: declarar correctamente, o **evaluar reemplazar/configurar el plugin social-login** para no arrastrar Google Ads + Facebook SDK (solo se usa Google sign-in).

---

## AUSENCIAS CONFIRMADAS

Lo que se buscó explícitamente y **NO existe** en el código hoy (tan relevante como lo que sí existe):

1. **Borrado de cuenta in-app** — sin `deleteUser`/`deleteAccount`/`reauthenticate`/"danger zone" (probe F1). _Buscado:_ grep `deleteUser|deleteAccount|reauthenticate|borrar cuenta|eliminar cuenta` en `src/`, `functions/`, `android/`, `extension/`.
2. **Cloud Function de wipe total de usuario** — ninguna CF borra todos los datos; `onUserDeleted` eliminado en SPEC-53 (probe F2).
3. **Export / descarga / portabilidad de datos** — sin export JSON/CSV, sin endpoint, sin botón (probe F3).
4. **Doc de perfil `users/{uid}` raíz** — no se crea al signup; identidad solo en Firebase Auth (probe A1, sección A).
5. **Triggers v1 de Auth** (`onUserCreated`/`onUserDeleted`) — eliminados; quedan 14 CFs v2, cero v1.
6. **Analytics / telemetría / crash reporting** — sin PostHog/Sentry/Crashlytics/Firebase Analytics/GA/Mixpanel/Amplitude/Segment/sendBeacon (probe G1, sección G). PostHog es futuro, hoy ausente.
7. **Firebase Storage en runtime** — sin `getStorage`/`uploadBytes`/upload path; sin `storage.rules`; sin Image extension en el editor (probe H1, sección H).
8. **Opt-out de embeddings (OpenAI)** — no hay toggle; `generateEmbedding` corre siempre, sin control del usuario (probe D3, sección D).
9. **Proyecto iOS** — sin `ios/`, sin `.pbxproj`/`Info.plist`.
10. **Permisos de cámara/ubicación/contactos/almacenamiento** en el manifest Android — ninguno (app de texto).
11. **`POST_NOTIFICATIONS` / notificaciones push activas** en Android — ausente pese a `google-services` condicional (FCM no activo).
12. **Key BYOK en claro hacia el cliente o hardcodeada en el repo** — el cliente solo ve `{ configured, last4 }`; la master key vive solo en Secret Manager (probes C2, C4).
13. **KDF sobre la master key** (PBKDF2/scrypt/Argon2) — no hay; se usa la key de 32 bytes cruda con validación de tamaño.
14. **Egress de la key del usuario a terceros distintos de Anthropic** — ninguno (probe C3).
15. **Captura de HTML/DOM/screenshot por la extensión** — solo texto seleccionado + título + URL.

---

_Fin del inventario. No se redactó privacy policy ni texto legal — esto es solo el insumo factual._
