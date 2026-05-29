# SPEC — Feature 48: BYOK API Keys (Anthropic, generación)

> **Estado:** Planificado — pendiente de implementación
> **Rama:** `feat/byok-api-keys` > **Discovery:** sesión 2026-05-28 (3 ejes: almacenamiento seguro, migración de CFs, UI/persistencia). Arquitectura aprobada por el owner.

## Objetivo

Cada usuario configura **su propia API key de Anthropic** en Settings (BYOK — Bring Your Own Key) y las Cloud Functions de **generación** (`processInboxItem`, `autoTagNote`) usan esa key en lugar del secret del proyecto. Sin key configurada, las features de IA de generación quedan **deshabilitadas** para ese usuario (no hay fallback al secret del proyecto) y la UI muestra empty states que invitan a configurarla. El resto de la app (notas, tareas, proyectos, búsqueda) sigue 100% funcional sin key. La key se guarda **cifrada** server-side y nunca vuelve al cliente.

**Fuera de scope (MVP):** Gemini y otros providers (feature futura F49+ sobre esta misma base), BYOK de embeddings (`generateEmbedding`/`embedQuery` siguen con la `OPENAI_API_KEY` del proyecto — ver D3), reproceso retroactivo del contenido creado sin key (ver D7).

## Decisiones de arquitectura (del discovery)

| #   | Decisión                                                                                                  | Razón                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Solo **Anthropic**, solo **generación** (`processInboxItem` + `autoTagNote`)                              | Las CFs ya hablan Anthropic (SDK, schemas, `tool_choice` configurados). Cero adapter nuevo: solo cambia de dónde viene la key. Gemini duplica el trabajo de adapter → feature separada F49+. Beta de ~100 usuarios: "traé tu key Anthropic" alcanza.                                                                                                |
| D2  | **Sin fallback** al secret del proyecto                                                                   | Objetivo = trasladar el costo de IA al usuario. Fallback lo derrotaría. Sin key → features de IA de generación deshabilitadas + empty state.                                                                                                                                                                                                        |
| D3  | **Embeddings fuera del MVP** (siguen con `OPENAI_API_KEY` del proyecto)                                   | Cambiar el provider de embeddings rompe la búsqueda semántica: vectores de distinto modelo/dimensión no son comparables (OpenAI `text-embedding-3-small` 1536d vs otros) → exigiría re-embedear todo el corpus. El costo de embeddings es marginal vs generación. `generateEmbedding` y `embedQuery` NO se tocan.                                   |
| D4  | Storage **A1**: AES-256-GCM + master key en Secret Manager                                                | A escala beta, Cloud KMS (A2) es overkill. A1 se implementa rápido, reusa el patrón `defineSecret` ya conocido, y es **migrable a A2 sin cambiar el modelo de datos**. Riesgo aceptado: una master key filtrada expone todas las keys (manejable con buenas prácticas a esta escala).                                                               |
| D5  | Secreto cifrado en colección **top-level** `userSecrets/{uid}/keys/{provider}`, no bajo `users/{uid}/...` | Las Firestore rules son **aditivas (OR)**: el `match /users/{userId}/{document=**}` actual da read/write al owner sobre todo su subárbol; un `allow read: if false` más específico NO lo bloquea. Mover el secreto a una colección top-level con bloque deny-all propio evita reestructurar las rules de `users/` (sensibles tras la auditoría C1). |
| D6  | Metadata legible en doc separado `users/{uid}/settings/aiKeys` (NO en `UserPreferences`)                  | El cliente necesita `{ configured, last4 }` para pintar estado. Doc propio evita el race con `setPreferences` del cliente y no toca `PREFERENCES_SCHEMA_VERSION`. La escribe la CF; el cliente solo la lee. El ciphertext nunca está acá.                                                                                                           |
| D7  | **Sin reproceso retroactivo** en MVP                                                                      | Los triggers Firestore no son retroactivos. Contenido creado antes de configurar la key: notas se re-taggean al editarlas (`autoTagNote` es `onDocumentWritten`); inbox capturado sin key queda sin sugerencias de IA pero **sigue clasificable manualmente** (la IA solo pre-rellena). Un job de reproceso queda post-MVP.                         |
| D8  | Escritura de la key vía **CF callable** (validar → cifrar → guardar), nunca por repos/TinyBase            | TinyBase sincroniza al cliente: un `apiKeysRepo` bajaría el ciphertext al browser. El cliente manda la key en claro una sola vez sobre TLS; la CF la cifra y persiste; nunca vuelve.                                                                                                                                                                |

## Modelo de datos

**Secreto cifrado** — `userSecrets/{uid}/keys/anthropic` (top-level, deny-all cliente, solo Admin SDK):

```jsonc
{
  "ciphertext": "<base64>",
  "iv": "<base64>",
  "authTag": "<base64>",
  "algo": "aes-256-gcm",
  "updatedAt": 1716800000000
}
```

**Metadata legible** — `users/{uid}/settings/aiKeys` (read owner, write efectivo solo CF):

```jsonc
{ "anthropic": { "configured": true, "last4": "AB12", "validatedAt": 1716800000000 } }
```

**Master key** — secret nuevo del proyecto `BYOK_MASTER_KEY` (32 bytes, base64) en Secret Manager, igual que `ANTHROPIC_API_KEY` hoy.

## Sub-features

### F1 — Helper de cifrado (`lib/crypto.ts`)

- **Qué:** módulo con `encryptSecret(plaintext, masterKeyB64)` → `{ ciphertext, iv, authTag }` (AES-256-GCM, IV aleatorio de 12 bytes por escritura) y `decryptSecret({ ciphertext, iv, authTag }, masterKeyB64)` → plaintext. Sin estado, sin logging del plaintext.
- **Criterio de done:** `decryptSecret(encryptSecret(x))` round-trips a `x`; IV distinto en dos cifrados del mismo input; tamper en `authTag`/`ciphertext` lanza error. Tests unit en Vitest.
- **Archivos:** `src/functions/src/lib/crypto.ts` (nuevo), `src/functions/src/lib/crypto.test.ts` (nuevo).
- **Notas:** `crypto.createCipheriv('aes-256-gcm', key, iv)` + `cipher.getAuthTag()`. La master key se decodifica de base64 a Buffer de 32 bytes.

### F2 — CF callables `saveApiKey` + `deleteApiKey`

- **Qué:** `saveApiKey({ provider: 'anthropic', key })` callable: (1) valida la key con un ping liviano, (2) cifra con `BYOK_MASTER_KEY`, (3) escribe `userSecrets/{uid}/keys/anthropic` (ciphertext) + `users/{uid}/settings/aiKeys` (metadata `configured/last4/validatedAt`). `deleteApiKey({ provider })`: borra ambos docs.
- **Criterio de done:** key válida → guarda y retorna `{ ok: true, last4 }`; key inválida (401 del provider) → `HttpsError('invalid-argument', 'API key inválida')` sin persistir; no autenticado → `HttpsError('unauthenticated')`. El ciphertext nunca se loggea (usar `sanitizeError`).
- **Archivos:** `src/functions/src/settings/saveApiKey.ts` (nuevo), `src/functions/src/settings/deleteApiKey.ts` (nuevo), `src/functions/src/index.ts` (export), `src/functions/src/lib/validateProviderKey.ts` (nuevo).
- **Notas:** validación Anthropic = `GET https://api.anthropic.com/v1/models` con headers `x-api-key: <key>` + `anthropic-version: 2023-06-01`, timeout ~5s; `fetch` global (Node 18+). 200 → válida, 401 → inválida, 429/5xx → tratar como "no se pudo validar ahora" (no rechazar la key, reintentar). `last4` = últimos 4 chars de la key. `saveApiKey` declara `secrets: [byokMasterKey]` (cifra); `deleteApiKey` **no** lo declara — solo borra docs, no descifra.

### F3 — Factory `getUserAnthropicKey` + migración de las 2 CFs de generación

- **Qué:** `getUserAnthropicKey(userId)` lee `userSecrets/{uid}/keys/anthropic`, descifra con `BYOK_MASTER_KEY`, retorna `string | null`. En `processInboxItem` y `autoTagNote`: reemplazar `defineSecret('ANTHROPIC_API_KEY')` por `defineSecret('BYOK_MASTER_KEY')` en `secrets: [...]`; al inicio del `try`, `const key = await getUserAnthropicKey(userId); if (!key) { log + return; }` (early-return **sin marcar `aiProcessed`**); instanciar `new Anthropic({ apiKey: key })`.
- **Criterio de done:** con key del user → procesa idéntico a hoy (sugerencias en inbox, tags en notas); sin key → early-return limpio, el doc **no** queda con `aiProcessed: true` (queda pendiente, no "procesado vacío"); log `info` distinguible (`reason: 'no-byok-key'`). `generateEmbedding`/`embedQuery` intactas.
- **Archivos:** `src/functions/src/lib/getUserAnthropicKey.ts` (nuevo), `src/functions/src/inbox/processInboxItem.ts` (tocar), `src/functions/src/notes/autoTagNote.ts` (tocar).
- **Notas:** ojo con el guard de idempotencia de `autoTagNote` (`if (after.aiProcessed) return` línea 43): el early-return sin key debe ir **después** de ese guard pero no marcarlo, para que al configurar la key y reescribir la nota se reprocese. El secret `ANTHROPIC_API_KEY` del proyecto deja de inyectarse en estas 2 CFs (sigue existiendo en Secret Manager por si se revierte, pero ya no se referencia).

### F4 — Firestore rules: colección de secretos deny-all

- **Qué:** bloque nuevo para `userSecrets/{uid}/{document=**}` con `allow read, write: if false` (solo Admin SDK desde CFs accede). La metadata `users/{uid}/settings/aiKeys` queda cubierta por el wildcard existente (read owner) — aceptable que el cliente la lea; su write desde cliente es cosméticamente irrelevante (no afecta seguridad ni procesamiento, ver D6).
- **Criterio de done:** validar con Firebase MCP / emulador que un cliente autenticado NO puede leer ni escribir `userSecrets/{suUid}/keys/anthropic`; sí puede leer `users/{suUid}/settings/aiKeys`; las CFs (Admin SDK) bypassan rules y leen/escriben el secreto. No hay regresión en `users/{uid}/{document=**}` (notas/tareas/etc. siguen accesibles).
- **Archivos:** `firestore.rules` (tocar).
- **Notas:** mantener el enforcement de `email_verified` que ya existe en el bloque de `users/` (C1). El bloque `userSecrets/` es deny-all puro, no necesita esa condición.

### F5 — Types + hook `useApiKeys` (cliente)

- **Qué:** tipos de dominio del provider y estado; hook que (1) se suscribe vía `onSnapshot` a `users/{uid}/settings/aiKeys` para exponer `{ anthropic: { configured, last4 } }` reactivo, (2) expone `saveKey(provider, key)` y `deleteKey(provider)` que invocan las callables (`httpsCallable`), con estados `saving`/`error`.
- **Criterio de done:** el hook refleja en tiempo real el cambio de metadata tras guardar/borrar; `saveKey` con key inválida propaga el error mapeado a español; loading states sin spinner (skeleton si aplica).
- **Archivos:** `src/types/apiKey.ts` (nuevo), `src/hooks/useApiKeys.ts` (nuevo).
- **Notas:** la key en claro vive solo en el `useState` del form hasta el `saveKey`; nunca se persiste client-side. Mapeo de errores reusa el patrón de `src/lib/authErrors.ts`.

### F6 — UI: sección API Keys en Settings

- **Qué:** `<section id="api-keys">` nueva en la página de Settings con una card por provider (solo Anthropic en MVP): estado (`✓ sk-ant-…AB12 configurada` / `no configurada`), input `type="password"`, botón Guardar (+ Borrar si está configurada), link a `console.anthropic.com` para obtener la key, y nota de qué features habilita (inbox processing + auto-tagging).
- **Criterio de done:** configurar key válida → card pasa a ✓ con last4; key inválida → mensaje de error inline; borrar → vuelve a "no configurada"; responsive (375/768/1280) consistente con el resto de Settings.
- **Archivos:** `src/components/settings/ApiKeysSection.tsx` (nuevo), `src/app/settings/page.tsx` (tocar — montar `<section>`).
- **Notas:** molde visual = `src/components/settings/TrashAutoPurgeSelector.tsx` (grid de cards con estado + descripción). Componentes `@/components/ui/{button,input}`; icons lucide (`Key`, `CheckCircle2`, `ExternalLink`). Lógica en `useApiKeys`, no en el componente.

### F7 — Empty states en features de IA de generación

- **Qué:** donde hoy se muestran/esperan las sugerencias de IA (inbox processor, banner/flujo de auto-tagging), cuando `anthropic.configured === false` mostrar un estado que explique que la IA está deshabilitada hasta configurar la key + CTA a Settings, en vez de esperar sugerencias que no llegan.
- **Criterio de done:** sin key, inbox y notas no muestran "procesando…" indefinido sino el CTA; con key, comportamiento normal sin cambios. El gate lee `useApiKeys` (no re-fetch propio).
- **Archivos:** componentes de inbox/notas a identificar en implementación (probablemente `src/components/capture/*` y el banner de sugerencias de notas). **Mapear con grep antes de tocar** — no asumir paths.
- **Notas:** mantener la app usable: el inbox sigue permitiendo clasificación manual; el empty state es informativo, no bloqueante.

## Orden de implementación

`F1` (crypto) → `F4` (rules) → `F2` (callables, dep F1) → `F3` (factory + migrar CFs, dep F1) → `F5` (types + hook, dep F2) → `F6` (UI, dep F5) → `F7` (empty states, dep F5). Un commit atómico por sub-feature (`feat`/`refactor` según corresponda).

## Pre-deploy (obligatorio, antes de `deploy:functions`)

1. Generar la master key: `openssl rand -base64 32` (o equivalente Node `crypto.randomBytes(32).toString('base64')`).
2. Subirla a Secret Manager: `firebase functions:secrets:set BYOK_MASTER_KEY` y pegar el valor. **Guardar el valor en un gestor seguro** — si se pierde, las keys cifradas quedan irrecuperables (los usuarios deben recargarlas).

## Migración post-deploy (OBLIGATORIA)

> ⚠️ **Crítico — solicitado explícitamente por el owner.** Tras desplegar functions + rules + hosting, `processInboxItem` y `autoTagNote` **dejan de usar `ANTHROPIC_API_KEY` del proyecto**. La IA de generación queda inoperante para todo usuario sin key propia, **incluido el owner**.

**Paso 1 inmediato post-deploy:** el owner entra a Settings → API Keys y configura su key Anthropic. Recién entonces inbox processing y auto-tagging vuelven a funcionar para su cuenta. Validar con una captura de inbox real que las sugerencias de IA reaparecen.

Comunicar a los usuarios de la beta (si los hubiera con uso de IA activo) que deben configurar su key para conservar inbox processing + auto-tagging.

## Verificación E2E (Playwright MCP + Firebase MCP)

UID de tests: `gYPP7NIo5JanxIbPqMe6nC3SQfE3` (proyecto `secondmindv1`).

- **Sin key:** borrar la key del user de test → capturar inbox item → confirmar que NO se escriben campos `aiSuggested*` y el doc no queda `aiProcessed: true`; UI muestra empty state. Crear nota → sin `aiTags`.
- **Validación:** guardar una key con formato inválido → rechazo con mensaje en español, nada persistido. (El golden path "key válida procesa" requiere una key Anthropic real de test — lo verifica el owner manualmente; el path de error y el sin-key no la necesitan.)
- **Con key (owner):** configurar key válida → card ✓ con last4; capturar inbox → sugerencias de IA aparecen; crear nota → auto-tags. Borrar key → vuelve a sin-key.
- **Seguridad:** con Firebase MCP confirmar que `userSecrets/{uid}/keys/anthropic` guarda ciphertext (no plaintext) y que las rules deniegan lectura cliente; que `users/{uid}/settings/aiKeys` no contiene la key, solo metadata.

## Checklist de cierre

- [ ] F1–F7 implementadas, cada una con su commit atómico
- [ ] `npm run lint` + `npm test` verdes (incluye `crypto.test.ts`)
- [ ] `npm run build` sin errores TS
- [ ] Pre-deploy: `BYOK_MASTER_KEY` generada y subida a Secret Manager (valor respaldado)
- [ ] Deploy: `deploy:functions` (2 CFs migradas + 2 callables nuevos) + `deploy:rules` + `deploy` (hosting)
- [ ] **Migración post-deploy: owner configura su key Anthropic en Settings y valida que la IA de generación vuelve a funcionar**
- [ ] E2E: sin-key / validación-error / con-key / seguridad de rules
- [ ] Merge `--no-ff` a main; push a origin
- [ ] Paso 8 SDD: convertir este SPEC a registro de implementación + escalar gotchas (rules aditivas / deny-all top-level; patrón BYOK crypto en CFs) según corresponda
