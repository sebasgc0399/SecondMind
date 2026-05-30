# AUDIT — Auth/Login + BYOK API Keys · v0.5

**Fecha:** 2026-05-29
**Alcance:** Subsistema de autenticación/login y sistema BYOK de API keys de SecondMind.
**Tipo:** Auditoría READ-ONLY de seguridad y arquitectura. **No se modificó código de producción.**
**Proyecto Firebase:** `secondmindv1` · **Modelo de amenaza:** beta privada por invitación, ~100 usuarios, capacity-gated, datos personales de productividad + keys BYOK de Anthropic por usuario + key OpenAI compartida del operador.

## Metodología

Auditoría orquestada como workflow multi-agente sobre el código real (no de memoria):

- **1 agente de contexto** digirió el audit previo (gotchas `post-audit-2026-05`, SPEC F44/F47/F48, ESTADO-ACTUAL, Docs 01/03) → 11 ítems conocidos.
- **12 finders en paralelo** por dimensión (8 Auth, 3 Keys, 1 Cross-cutting), cada uno leyendo los archivos reales y citando `archivo:línea`.
- **Verificación adversarial de doble lente** por hallazgo (refutar-correctitud + dedup/severidad): ~48 verificadores.
- **1 crítico de completitud** que detectó gaps de cobertura.
- **Validación personal del orquestador** sobre los archivos crown-jewel (`crypto.ts`, `saveApiKey.ts`, `getUserAnthropicKey.ts`, `sanitizeError.ts`, `userCountTriggers.ts`, `firestore.rules`, `useAuth.ts`, `tauriAuth.ts`, `capacitorAuth.ts`, `validateProviderKey.ts`, `embedQuery.ts`, `oauth.rs`) y **cierre de 3 gaps** que el crítico marcó: la auth de la **Chrome Extension** (`chrome.identity`), `embedQuery`/`generateEmbedding` (key OpenAI compartida) y el listener Rust `oauth.rs`.

Totales: 62 agentes, ~2.9M tokens, 24 hallazgos (23 con ≥1 verificador confirmando), 8 gaps de completitud (resueltos en este informe).

---

## Resumen ejecutivo

El núcleo de seguridad está **sólido**: el cifrado BYOK (AES-256-GCM, IV único por escritura, auth tag verificado, master key de 32 bytes en Secret Manager, algoritmo hardcodeado anti-downgrade) es correcto; `userSecrets/` es **deny-all real** desde cliente (colección top-level, no cuelga del catch-all `users/`); el enforcement server-side de `email_verified` (C1) está vigente en las rules; la key en claro **nunca** vuelve al cliente ni aparece en logs; `sanitizeError` (M3) y `MAX_CONTENT_CHARS` (M2) están aplicados en las CFs de IA; la auto-invalidación 401/403 (D9) funciona; el PKCE de Tauri (verifier CSPRNG, S256, `state` anti-CSRF, redirect loopback exacto) es correcto.

Los problemas son de **consistencia de enforcement y superficie de abuso**, no de fuga de datos:

1. **Los callables (`saveApiKey`/`deleteApiKey`/`embedQuery`) no verifican `email_verified`** → boquete de consistencia con C1 (un usuario no verificado evade el gate por endpoint directo). **(A-1)**
2. **No hay App Check en ningún lado** + **el capacity gate es 100% client-side y los paths Google/extension no lo tocan en absoluto** → el límite de 100 es advisory, y los callables son invocables desde fuera de la app (oráculo de validación de keys Anthropic; abuso de costo sobre la key OpenAI compartida en `embedQuery`). **(A-2, A-3, A-4)**
3. **Master key única para todas las keys BYOK, sin AAD/binding al uid, sin rotación/versionado ni camino a KMS** → blast radius total ante leak; decisión documentada (D4) pero sin mitigaciones baratas aplicadas. **(K-1, K-2, K-3)**

**Bloqueante recomendado para v0.5.0:** **A-1** (guard `email_verified` en callables — fix de ~10 líneas). **Fast-follow barato y de alto valor (idealmente en v0.5.0):** cap `maxInstances` en `embedQuery`/`saveApiKey`, confirmar **Email Enumeration Protection** activado en la consola, y gatear el path Google del capacity en la UI. **Diferible post-beta:** App Check completo, hard-enforcement del capacity (requiere `beforeUserCreated` / Identity Platform pago), y el hardening cripto de la master key (AAD + `keyVersion` + KMS).

---

## Estado de ítems conocidos (audit previo · no re-reportados como nuevos)

> Nota: el audit 2026-05 **no dejó un documento consolidado con numeración C1–C4/M1–M3**. Sobreviven como anchors en código/gotchas C1, M2, M3 y la decisión D9. Las etiquetas "C4" y "M1" del encargo se mapean aquí a su estado real en el código.

| Ítem                               | Descripción                              | Estado actual                        | Evidencia                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | -------------------------------------------------------------------------------------------------------- |
| **C1**                             | `email_verified` server-side en rules    | ✅ Resuelto                          | `firestore.rules:10-14` — OR `sign_in_provider=='google.com'                                                                                                                   |     | token.email_verified==true`. Complementado por `useAuth.ts:127-129` (`getIdToken(true)` tras verificar). |
| **C2**                             | CSP Tauri con `unsafe-inline`            | ⚠️ Parcial / riesgo aceptado         | `src-tauri/tauri.conf.json` — decisión documentada (F39 D2). Solo Tauri; `connect-src` sí endurecido. No re-reportado.                                                         |
| **C3**                             | Security headers en Hosting              | ✅ Resuelto (con nota)               | `firebase.json` — HSTS, nosniff, Referrer-Policy, Permissions-Policy. **Nota forward:** web no tiene CSP ni `X-Frame-Options`/`frame-ancestors` (anti-clickjacking) — ver X-3. |
| **C4** _(= "counter idempotente")_ | Idempotencia del counter                 | ❌ **Pendiente**                     | `userCountTriggers.ts:13-22` — `FieldValue.increment(1)` sin dedup por uid. Sigue abierto (ver A-7).                                                                           |
| **M1** _(= "prompt-injection")_    | Inyección de prompt en pipeline IA       | ⚠️ Sin cambios / aceptado por diseño | `processInboxItem.ts:81`, `autoTagNote.ts` interpolan contenido del user, pero `tool_choice` forzado + `input_schema` acotan la salida. No es regresión.                       |
| **M2**                             | `MAX_CONTENT_CHARS` antes del LLM        | ✅ Resuelto (gap menor)              | `autoTagNote.ts:49-56`, `processInboxItem.ts:47-54` (cap 10 000). **Gap:** `generateEmbedding` no lo aplica — ver X-1.                                                         |
| **M3**                             | `sanitizeError` obligatorio en CFs       | ✅ Resuelto                          | `sanitizeError.ts` truncado a 200 chars; usado en todos los catch de CFs.                                                                                                      |
| **D9**                             | Auto-invalidación de key ante 401/403    | ✅ Resuelto                          | `getUserAnthropicKey.ts:25-35` + `processInboxItem.ts:114-119` + `autoTagNote.ts:123-128`.                                                                                     |
| **BYOK-CRYPTO**                    | Cifrado AES-256-GCM + master key         | ✅ Resuelto                          | `crypto.ts` — IV 12B CSPRNG, auth tag verificado, ALGO hardcodeado, master key 32B validada.                                                                                   |
| **BYOK-RULES**                     | `userSecrets/` deny-all top-level        | ✅ Resuelto                          | `firestore.rules:35-37`.                                                                                                                                                       |
| **OAUTH-SECRET**                   | `client_secret` OAuth en el bundle Tauri | ⚠️ Pendiente / mitigado              | `tauriAuth.ts:32` — embebido vía `VITE_*`; mitigado por tipo de cliente Desktop + PKCE. Ver A-13b.                                                                             |

---

## Hallazgos — AUTH

### A-1 · `email_verified` no se exige en los callables → bypass del gating por endpoint directo

- **Severidad:** Alto
- **Ubicación:** `src/functions/src/settings/saveApiKey.ts:31-34`; `src/functions/src/search/embedQuery.ts:27-31`; `src/functions/src/settings/deleteApiKey.ts:22-25`
- **Evidencia:** Los tres callables comparten el guard `if (!request.auth) throw HttpsError('unauthenticated', ...)` y luego leen `request.auth.uid`. Ninguno lee `request.auth.token.email_verified` ni `firebase.sign_in_provider`. No existe un helper `requireVerified`. Las Firestore rules **sí** exigen `email_verified` (C1), pero los callables usan el Admin SDK y **bypassean las rules**.
- **Impacto:** Un usuario email/password no verificado —bloqueado por las rules para leer/escribir Firestore— **todavía puede invocar los callables**: `embedQuery` quema cuota de la key OpenAI compartida del operador; `saveApiKey` funciona como oráculo de validación de keys Anthropic (ver A-4). Rompe la consistencia del enforcement de C1 (el verificador adversarial confirmó Alto↔Medio, 2/2 isReal).
- **Recomendación:** Helper compartido `requireVerified(request)` que exija `request.auth.token.email_verified === true || request.auth.token.firebase.sign_in_provider === 'google.com'`, aplicado al inicio de los tres callables (lanzar `HttpsError('permission-denied', ...)` si no). Fix de ~10 líneas.

### A-2 · El capacity gate es enforcement client-side; los paths Google y Chrome Extension lo evaden por completo

- **Severidad:** Medio
- **Ubicación:** `src/hooks/useAuth.ts:50-58` (`signIn()` Google sin check); `src/components/auth/LoginCard.tsx:72,102-112` (solo `SignUpForm` envuelto en `SignupCapacityGate`); `src/hooks/useSignupCapacity.ts:71`; `extension/src/lib/auth.ts:9-15` (`chrome.identity` crea usuario sin gate)
- **Evidencia:** (a) `signUpWithEmail` (`useAuth.ts:64-90`) hace un re-check fail-closed de capacity **client-side** antes de `createUserWithEmailAndPassword`, pero es saltable invocando la REST API de Firebase Auth directamente. (b) `signIn()` (Google) **no llama `readSignupCapacity` en ningún punto** → un alta nueva por Google se crea aunque la beta esté llena. (c) La Chrome Extension crea usuarios Firebase vía `chrome.identity.getAuthToken` → `signInWithCredential`, totalmente fuera del gate. (d) No hay `beforeUserCreated` (bloqueo server-side) — requiere Identity Platform (pago), decisión documentada en `userCountTriggers.ts:5-9`.
- **Impacto:** El límite de 100 es **advisory, no enforced**. Para una beta cuyo objetivo es control de costo/cupo, el cap puede superarse trivialmente (cualquier alta por Google, extension o REST directo). No es brecha de datos; es control de capacity/costo defeatible.
- **Recomendación:** (1) Corto plazo barato: gatear también el botón de Google con `SignupCapacityGate` en la UI (cierra el path honesto más probable). (2) Documentar explícitamente que el cap NO es server-enforced antes de apoyarse en él para la beta. (3) Hard-enforcement real solo vía `beforeUserCreated` (Identity Platform) o un callable de signup gateado server-side — diferible post-beta.

### A-3 · App Check no está inicializado ni enforced en ningún callable

- **Severidad:** Medio
- **Ubicación:** `src/lib/firebase.ts:1-19` (sin `initializeAppCheck`); `saveApiKey.ts:24-29`, `deleteApiKey.ts:16-20`, `embedQuery.ts:20-25` (sin `enforceAppCheck`)
- **Evidencia:** Grep `initializeAppCheck|enforceAppCheck|AppCheck|ReCaptcha` en `src/` y `src/functions/src/` → **cero matches** (solo aparece en `node_modules`). `firebase.ts` solo crea `getAuth/getFirestore/getFunctions`.
- **Impacto:** Cualquiera con el API key web público (embebido en el bundle) + un ID token válido puede invocar los callables desde fuera de la app: oráculo de validación de keys Anthropic (`saveApiKey`→`validateProviderKey` hace `fetch` real a `api.anthropic.com`), sumidero de costo sobre la key OpenAI (`embedQuery`).
- **Recomendación:** Habilitar App Check (`reCAPTCHA Enterprise`/v3 en web, Play Integrity en Android, provider custom en Tauri/extension) + `enforceAppCheck: true` en los callables. Rollout parcial factible (web primero). **Diferible** — App Check en Tauri/extension es no-trivial; priorizar el cap de `maxInstances` (A-4) como mitigación inmediata.

### A-4 · `embedQuery` usa la key OpenAI compartida sin `email_verified`, sin App Check ni rate-limit → abuso de costo

- **Severidad:** Medio
- **Ubicación:** `src/functions/src/search/embedQuery.ts:20-49`
- **Evidencia:** `embedQuery` valida `request.auth` y `text` (no vacío, `MAX_TEXT_LENGTH=500`), pero **no** `email_verified`, **no** App Check, **no** `maxInstances` ni rate limit. Usa `OPENAI_API_KEY` del operador (`defineSecret`, key compartida — no BYOK). El cap de 500 chars limita el costo por llamada, no la frecuencia.
- **Impacto:** Cualquier usuario autenticado (incluido no-verificado, ver A-1) puede llamar `embedQuery` en loop y quemar cuota/costo de la key OpenAI del operador. Perfil de abuso distinto al BYOK Anthropic (ahí la víctima del costo sería el propio usuario).
- **Recomendación:** (1) `maxInstances` acotado en `embedQuery` (mitigación inmediata, trivial). (2) Guard `email_verified` (parte de A-1). (3) Rate limit per-user (contador Firestore o App Check) — diferible.

### A-5 · Enumeración de cuentas latente en login (`auth/user-not-found` con mensaje distinto)

- **Severidad:** Bajo
- **Ubicación:** `src/lib/authErrors.ts:18-19`
- **Evidencia:** En contexto `signin`, `auth/user-not-found` devuelve `'No existe una cuenta con ese email.'`, diferenciable de `'Email o contraseña incorrectos.'` (`wrong-password`/`invalid-credential`, líneas 16-17). La mitigación efectiva es **Email Enumeration Protection (EEP)** de Firebase: si está activado en consola, Firebase nunca devuelve `user-not-found` (uniforma a `invalid-credential`) y este string es inalcanzable. No verificable en código.
- **Impacto:** Si EEP estuviera desactivado, el login es un oráculo de enumeración de emails registrados. Defense-in-depth dependiente de un setting de consola.
- **Recomendación:** (1) Confirmar EEP activado en Firebase Console → Authentication → Settings. (2) Colapsar el mensaje `user-not-found` en `signin` al genérico `'Email o contraseña incorrectos.'` (cierra el gap sin depender del setting). Cheap.

### A-6 · `onUserDeleted` decrementa sin piso → el counter puede ir negativo

- **Severidad:** Bajo
- **Ubicación:** `src/functions/src/auth/userCountTriggers.ts:24-33`
- **Evidencia:** `set({ userCount: FieldValue.increment(-1) }, { merge: true })` sin clamp ni transacción.
- **Impacto:** Borrados que superen creaciones contabilizadas (o el doble-evento de A-7 en sentido inverso) dejan `userCount` negativo → corrompe `canSignUp = userCount < maxUsers`. Integridad del gate, no seguridad.
- **Recomendación:** Clamp a 0 con transacción, o job periódico que recompute `userCount` desde la lista de Auth.

### A-7 · (C4 · pendiente) Counter no idempotente ante doble-evento/reintento

- **Severidad:** Bajo (operacional)
- **Ubicación:** `src/functions/src/auth/userCountTriggers.ts:13-22`
- **Evidencia:** `onUserCreated` hace `increment(1)` incondicional, sin marcador de idempotencia por uid. Los triggers v1 de Auth tienen entrega _at-least-once_ → un reintento doble-cuenta. El propio comentario (`:5-9`) admite "Race aceptada y documentada en SPEC F6 (single-user beta)".
- **Impacto:** Deriva del counter (sobre o sub-conteo) a lo largo de la beta de 100. Probabilidad baja por evento, acumulable.
- **Recomendación:** Dedup por marcador (`config/app/seenUids/{uid}` en transacción) o recompute periódico. Conocido (no nuevo); se reporta su estado por seguir abierto.

### A-8 · Sin enforcement real de complejidad de password (solo `length>=8` client-side)

- **Severidad:** Bajo
- **Ubicación:** `src/components/auth/SignUpForm.tsx:33-38,107-110`
- **Evidencia:** `validate()` solo chequea `password.length < 8`; el helper text promete una regla más fuerte (numérico) que no se valida en código. El enforcement real dependería de una password policy de Identity Platform no verificable en repo.
- **Impacto:** Mensajería/UX inconsistente; passwords débiles si la policy de consola no está configurada.
- **Recomendación:** Activar password policy en Identity Platform, o alinear la validación client-side con la regla prometida.

### A-9 · Persistencia de sesión default (localStorage) → refresh token alcanzable por XSS

- **Severidad:** Bajo
- **Ubicación:** `src/lib/firebase.ts:17` (`getAuth(app)` sin `setPersistence`)
- **Evidencia:** Grep `setPersistence|initializeAuth|indexedDBLocalPersistence` en `src/` → 0 hits. Las tres plataformas heredan el default `browserLocalPersistence` (localStorage).
- **Impacto:** Hardening: ante un XSS, el refresh token es legible. No es vuln independiente.
- **Recomendación:** `setPersistence(indexedDBLocalPersistence)`. La mitigación de fondo del XSS sería un CSP en web (ver X-3).

### A-10 · Cooldown de resend de verificación solo client-side (sessionStorage)

- **Severidad:** Bajo
- **Ubicación:** `src/hooks/useEmailVerificationResend.ts:9-10,51-68`
- **Evidencia:** `COOLDOWN_KEY` en `sessionStorage`, guard `if (remainingSeconds > 0 || sending) return` es de UI. Firebase impone sus propios límites de envío server-side.
- **Impacto:** El cooldown UI se evade limpiando storage, pero el envío real lo limita Firebase. Sin activo de seguridad afectado.
- **Recomendación:** Aceptable para beta; si aparece abuso, mover el cooldown a un callable con rate-limit.

### A-11 · Anti-brute-force depende 100% de defaults de Identity Platform

- **Severidad:** Bajo
- **Ubicación:** `src/hooks/useAuth.ts:60-62`; `src/lib/authErrors.ts:27-28` (`auth/too-many-requests`)
- **Evidencia:** No hay CAPTCHA ni throttle propio en login; se delega en Identity Platform.
- **Impacto:** Caracterización de dependencia arquitectónica, no bug. Aceptable con EEP + defaults.
- **Recomendación:** Mantener EEP; evaluar reCAPTCHA en login si se detecta abuso.

### A-12 · Sin validación de shape/tipo/tamaño en writes de `users/**`

- **Severidad:** Bajo
- **Ubicación:** `firestore.rules:10-15`
- **Evidencia:** El match `users/{userId}/{document=**}` solo gobierna autenticación/aislamiento (C1), no valida campos ni tamaño.
- **Impacto:** Un usuario puede inyectar campos basura / self-DoS de su propio storage. No cruza trust boundary (solo su árbol).
- **Recomendación:** Reglas de validación de campos/tamaño si se desea; baja prioridad para beta.

### A-13 · Hardening del flujo Google OAuth (Tauri + Capacitor)

- **A-13a · Listener loopback de Tauri reenvía el path de cualquier primer request local** — **Bajo.** `src-tauri/src/oauth.rs:21-37`: `handle_connection` toma `request_line.split_whitespace().nth(1)` de la **primera** conexión TCP y la emite a `oauth://callback` sin validar método ni endpoint. Mitigado: bind `127.0.0.1:0` (loopback), `accept()` one-shot, y el `state` se valida downstream (`tauriAuth.ts:82`, rechaza mismatch). Worst case: un request local malicioso durante la ventana de ~5min consume el listener → DoS de **ese** intento de login (local-only). **Recomendación:** validar que el path empiece por el callback esperado antes de emitir.
- **A-13b · `client_secret` OAuth embebido en el bundle Tauri** — **Bajo** (OAUTH-SECRET conocido). `tauriAuth.ts:32` lee `VITE_GOOGLE_OAUTH_CLIENT_SECRET` → embebido en el binario distribuido. Mitigado si el OAuth client es de tipo **Desktop** (donde el secret es no-confidencial por diseño y PKCE es la protección real). **Recomendación:** confirmar el tipo de cliente en Google Cloud Console; si fuera "Web", migrar a un cliente Desktop dedicado.
- **A-13c · Capacitor: `id_token` federado sin nonce** — **Bajo/informativo.** `capacitorAuth.ts:13-23` no pasa nonce; Firebase valida la credencial server-side. Aceptable.

---

## Hallazgos — KEYS (BYOK)

### K-1 · Master key única cifra TODAS las keys BYOK, sin derivación per-user → blast radius total ante leak

- **Severidad:** Medio
- **Ubicación:** `src/functions/src/lib/crypto.ts:25-36` (`encryptSecret` usa `masterKeyB64` directo como clave AES); `src/functions/src/lib/getUserAnthropicKey.ts:15-18`; decisión documentada `Spec/features/SPEC-feature-48-byok-api-keys.md:30` (D4, "riesgo aceptado")
- **Evidencia:** Una sola `BYOK_MASTER_KEY` (Secret Manager) cifra/descifra las keys de todos los usuarios; no hay derivación por uid. Mitigaciones presentes: master key en Secret Manager (acceso controlado por IAM), `userSecrets/` deny-all, ciphertext separado de la metadata legible.
- **Impacto:** Si la master key se filtra (compromiso de IAM/Secret Manager/runtime de las CFs), **todas** las keys BYOK quedan descifrables. Decisión documentada (D4) pero sin mitigaciones de defensa en profundidad aplicadas.
- **Recomendación:** Largo plazo → **envelope encryption con Cloud KMS** (la master key nunca sale de KMS; reduce el blast radius real). Corto plazo → ver K-2 (AAD=uid, que ata el ciphertext al usuario aunque no reduzca el blast del leak de la master). Mantener el riesgo documentado y trackear el camino a KMS como ítem post-beta.

### K-2 · Cifrado sin AAD → ciphertext no atado al uid (portabilidad bajo la misma master key)

- **Severidad:** Bajo
- **Ubicación:** `src/functions/src/lib/crypto.ts:25-49` (no llama `cipher.setAAD`); `saveApiKey.ts:58` (no pasa `userId`); `getUserAnthropicKey.ts:11-18` (no valida binding)
- **Evidencia:** `encryptSecret`/`decryptSecret` no usan AAD; el único binding al usuario es el path `userSecrets/{uid}/keys/{provider}`. `request.auth.uid` está disponible pero no se mezcla en el cifrado.
- **Impacto:** Un ciphertext es descifrable bajo cualquier uid (mismo master key). Explotable solo con acceso de escritura a `userSecrets/` (deny-all desde cliente; solo Admin SDK) → prácticamente requiere comprometer el backend primero. Defensa en profundidad.
- **Recomendación:** `cipher.setAAD(Buffer.from(userId))` en encrypt + `decipher.setAAD(...)` en decrypt. Barato; aplicar junto con K-1/K-3.

### K-3 · Sin procedimiento ni versionado de rotación de la master key (`keyVersion` ausente)

- **Severidad:** Bajo–Medio
- **Ubicación:** `src/functions/src/settings/saveApiKey.ts:64-68` (doc sin `keyVersion`); `src/functions/src/lib/crypto.ts:11-15` (`EncryptedSecret` sin discriminador de versión); `getUserAnthropicKey.ts:15-18` (decrypt asume master key actual)
- **Evidencia:** El doc persistido guarda `{ciphertext, iv, authTag, algo, updatedAt}` sin `keyVersion`/`keyId`. `decryptSecret` siempre usa la master key actual.
- **Impacto:** Rotar la master key hoy **orfanaría todos los ciphertexts** (no descifrables) → invalidación masiva (los usuarios deben re-ingresar sus keys). No hay forma de soportar dos master keys en transición.
- **Recomendación:** Agregar `keyVersion`/`keyId` al doc **ahora** (cambio barato, forward-compatible) para habilitar rotación futura y la migración a KMS. Ver K-4.

### K-4 · El campo `algo` no funciona como discriminador de esquema

- **Severidad:** Bajo
- **Ubicación:** `saveApiKey.ts:66` (escribe `algo:'aes-256-gcm'`); `crypto.ts:43-44` (ALGO hardcodeado; `decryptSecret` ignora `payload.algo`)
- **Evidencia:** Se persiste `algo` pero el decrypt no lo lee (el type `EncryptedSecret` ni siquiera lo incluye). Una migración a KMS/envelope no podría distinguir esquemas.
- **Impacto:** Cosmético hoy; bloquea una migración de esquema limpia.
- **Recomendación:** Fundir con K-3 — usar un `keyVersion`/`scheme` real como discriminador leído en decrypt.

### K-5 · `invalidateUserAnthropicKey` se await en el catch sin try interno → un fallo del WriteBatch escapa sin loggear

- **Severidad:** Bajo
- **Ubicación:** `src/functions/src/inbox/processInboxItem.ts:115-120`; `src/functions/src/notes/autoTagNote.ts:124-129`; `getUserAnthropicKey.ts:25-35` (`batch.commit` puede throw)
- **Evidencia:** En el catch de 401/403, `await invalidateUserAnthropicKey(userId)` corre antes de `sanitizeError`+`logger.error`, sin try anidado. Si el `batch.commit()` falla, la excepción escapa sin log.
- **Impacto:** Robustez/observabilidad; sin dimensión de explotabilidad.
- **Recomendación:** Envolver la invalidación en try/catch propio con log.

### K-6 · `saveApiKey` no aplica cota superior de longitud al input de la key

- **Severidad:** Bajo
- **Ubicación:** `src/functions/src/settings/saveApiKey.ts:41-44`
- **Evidencia:** Solo valida `typeof rawKey === 'string' && rawKey.trim()`; sin máximo. El input fluye como header `x-api-key` a `validateProviderKey` (`fetch` a Anthropic).
- **Impacto:** Auth requerida, solo afecta el doc propio, e input gigante nunca se persiste (Anthropic lo rechazaría). Marginal.
- **Recomendación:** Cap razonable (p. ej. 200 chars) antes de `validateProviderKey`.

---

## Hallazgos — CROSS-CUTTING

### X-1 · `generateEmbedding` no aplica `MAX_CONTENT_CHARS` antes de OpenAI (gap de cobertura M2)

- **Severidad:** Bajo
- **Ubicación:** `src/functions/src/embeddings/generateEmbedding.ts:29-62`
- **Evidencia:** Las otras 3 CFs aplican el cap; `generateEmbedding` (trigger `onWrite` sobre notas) envía `contentPlain` raw a `embeddings.create` sin cap (sí tiene dedup por hash, `:50-53`).
- **Impacto:** Costo/robustez: una nota muy larga dispara una llamada cara o falla por `context_length_exceeded`.
- **Recomendación:** Aplicar el mismo `MAX_CONTENT_CHARS` (o truncar al límite del modelo) antes de `embeddings.create`.

### X-2 · La salida del modelo (`tool_use.input`) se persiste sin re-validación server-side de schema

- **Severidad:** Bajo
- **Ubicación:** `src/functions/src/inbox/processInboxItem.ts:95-106`; `src/functions/src/notes/autoTagNote.ts:104-113`
- **Evidencia:** `toolBlock.input as InboxClassification` se castea y escribe a Firestore sin validar enum/array; el único guard es de tipo básico. El enforcement real es el `tool_choice` forzado + `input_schema` (que ya acotan, pero del lado del modelo).
- **Impacto:** Defense-in-depth: si el modelo devolviera un shape inesperado, se persistiría. No explotable (input del propio usuario, su propio árbol).
- **Recomendación:** Validar enum/array server-side antes de escribir.

### X-3 · (Nota forward de C3) Web sin CSP ni anti-clickjacking

- **Severidad:** Bajo / informativo
- **Ubicación:** `firebase.json` (hosting headers)
- **Evidencia:** C3 resolvió HSTS/nosniff/Referrer-Policy/Permissions-Policy, pero **no hay `Content-Security-Policy` ni `X-Frame-Options`/`frame-ancestors`** en el hosting web (el CSP custom solo existe en Tauri).
- **Impacto:** Sin CSP, un XSS no tiene contención (relevante para A-9); sin `X-Frame-Options`, la web es enmarcable (clickjacking).
- **Recomendación:** Agregar `Content-Security-Policy` y `X-Frame-Options: DENY` (o `frame-ancestors 'none'`) en `firebase.json`. Diferible; coordinar el CSP con los orígenes de Firebase/Reagraph para no romper la app.

---

## Verificación de regresión (ítems ya abordados — confirmados)

| Ítem                                                                              | Estado                 | Evidencia                                                                                                                          |
| --------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Enumeración en **reset** (mensaje genérico)                                       | ✅ Confirmado resuelto | `useAuth.ts:99-101` silencia `auth/user-not-found`; `ResetPasswordForm.tsx:41-43` muestra siempre "Si la cuenta existe…".          |
| Enumeración cross-provider en **signup**                                          | ✅ Confirmado resuelto | `authErrors.ts:22-24` mapea `email-already-in-use` y `account-exists-with-different-credential` al mismo `GENERIC_ACCOUNT_EXISTS`. |
| Enumeración en **login**                                                          | ⚠️ Parcial             | `auth/user-not-found` en `signin` sigue diferenciable (ver A-5; mitigado por EEP).                                                 |
| **Stale token** (`getIdToken(true)` tras verificar)                               | ✅ Confirmado resuelto | `useAuth.ts:127-129`, gated en `emailVerified`.                                                                                    |
| Email verification enviado tras signup                                            | ✅ Confirmado resuelto | `useAuth.ts:82-89` (`sendEmailVerification` en try/catch graceful).                                                                |
| Password no se loggea / no va a estado global/URL/storage                         | ✅ Confirmado resuelto | Grep sin hits de `console.*`/`searchParams`/`location` tocando password.                                                           |
| Doble-submit en signup                                                            | ✅ Confirmado resuelto | `SignUpForm.tsx` `disabled={loading}` + re-check fail-closed.                                                                      |
| Tauri PKCE (verifier CSPRNG, S256, state anti-CSRF, redirect exacto)              | ✅ Confirmado resuelto | `tauriAuth.ts:12-16,48,82,44`.                                                                                                     |
| `userSecrets/` deny-all real + reglas aditivas no abren de más                    | ✅ Confirmado resuelto | `firestore.rules:35-37` (top-level), matches con prefijos disjuntos.                                                               |
| `config/app` read público + write denegado                                        | ✅ Confirmado resuelto | `firestore.rules:24-27` (path explícito).                                                                                          |
| BYOK: key nunca al cliente / nunca en logs / sin IDOR en delete                   | ✅ Confirmado resuelto | `saveApiKey.ts:16-19,76`; `deleteApiKey.ts:25` (uid server-derived).                                                               |
| Crypto: IV CSPRNG único, auth tag verificado, master 32B, master nunca al cliente | ✅ Confirmado resuelto | `crypto.ts:7-49`.                                                                                                                  |
| D9 auto-invalidación 401/403                                                      | ✅ Confirmado resuelto | `getUserAnthropicKey.ts:25-35` + consumidores.                                                                                     |
| `validateProviderKey` sin SSRF / sin leak de key / timeout                        | ✅ Confirmado resuelto | `validateProviderKey.ts:12-22` (URL hardcodeada, GET solo-lectura).                                                                |
| Tool use con `tool_choice` forzado + `input_schema`                               | ✅ Confirmado resuelto | `processInboxItem.ts:77`, `autoTagNote.ts`.                                                                                        |

---

## Cobertura y gaps de completitud

El crítico de completitud marcó 8 gaps; estado tras el cierre manual del orquestador:

- ✅ **Chrome Extension auth (`chrome.identity`)** — auditado en este informe: `extension/src/lib/auth.ts` (otro path ungated de capacity → A-2), `extension/src/lib/firestore.ts` (writes a inbox gobernados por rules, sin issue de aislamiento), `extension/manifest.json` (**least-privilege**: permisos `identity/activeTab/storage/scripting`, sin `host_permissions` amplios — positivo), `firebaseConfig.ts` (config web pública, no secreta — OK).
- ✅ **App Check ausente** — confirmado negativamente y reportado (A-3).
- ✅ **`embedQuery`/`generateEmbedding` (key OpenAI compartida)** — auditados (A-4, X-1).
- ✅ **Master key threat model / rotación / KMS** — reportado (K-1, K-3, K-4).
- ✅ **Enumeración en login** — reportado (A-5).
- ✅ **Callables sin rate-limit/`maxInstances`** — reportado (A-3, A-4).
- ✅ **`oauth.rs` listener Rust** — auditado (A-13a).
- ✅ **Capacity idempotencia/race** — reportado (A-2, A-6, A-7).

**Claims que el audit dejó como falsos por construcción** (no asumir resueltos): no existe protección App Check; no existe rotación de master key ni uso de KMS; `email_verified` NO se exige en todos los paths de escritura (los callables no lo chequean — A-1); no existe rate-limiting propio sobre los callables.

---

## Tabla resumen priorizada

| ID              | Hallazgo                                                                       | Sev.       | Esfuerzo                        | Veredicto beta                                    |
| --------------- | ------------------------------------------------------------------------------ | ---------- | ------------------------------- | ------------------------------------------------- |
| **A-1**         | `email_verified` ausente en callables                                          | Alto       | Bajo (~10 líneas)               | **BLOQUEANTE v0.5.0**                             |
| **A-4**         | `embedQuery` abuso de costo (key OpenAI compartida) — al menos `maxInstances`  | Medio      | Bajo (cap) / Medio (rate-limit) | **Fast-follow v0.5.0** (cap `maxInstances` ahora) |
| **A-5**         | Enumeración en login — confirmar EEP + colapsar mensaje                        | Bajo       | Bajo                            | **Fast-follow v0.5.0** (cheap)                    |
| **A-2**         | Capacity gate evadible (Google/extension/REST) — gatear UI Google + documentar | Medio      | Bajo (UI) / Alto (hard-enforce) | Parcial v0.5.0 (UI + doc); hard-enforce diferible |
| **A-3**         | App Check ausente                                                              | Medio      | Alto (Tauri/extension)          | Diferible (rollout web primero post-beta)         |
| **K-1**         | Master key única, blast radius total                                           | Medio      | Alto (KMS)                      | Diferible post-beta (documentar threat model)     |
| **K-2**         | Sin AAD/binding al uid                                                         | Bajo       | Bajo                            | Diferible (con K-1/K-3)                           |
| **K-3 / K-4**   | Sin `keyVersion` / rotación / discriminador                                    | Bajo–Medio | Bajo (agregar campo ahora)      | Diferible (future-proof barato)                   |
| **A-6 / A-7**   | Counter negativo / no idempotente (C4)                                         | Bajo       | Medio                           | Diferible                                         |
| **A-8**         | Password policy no enforced en código                                          | Bajo       | Bajo                            | Diferible                                         |
| **A-9**         | Sesión en localStorage (XSS)                                                   | Bajo       | Bajo                            | Diferible (junto con X-3 CSP)                     |
| **A-10 / A-11** | Resend/brute-force solo defaults                                               | Bajo       | Bajo                            | Diferible                                         |
| **A-12**        | Sin validación de shape en `users/**`                                          | Bajo       | Medio                           | Diferible                                         |
| **A-13a/b/c**   | Hardening OAuth (loopback path, client_secret, nonce)                          | Bajo       | Bajo                            | Diferible                                         |
| **K-5**         | Invalidación sin try interno                                                   | Bajo       | Bajo                            | Diferible                                         |
| **K-6**         | `saveApiKey` sin cap de longitud                                               | Bajo       | Bajo                            | Diferible                                         |
| **X-1**         | `generateEmbedding` sin `MAX_CONTENT_CHARS`                                    | Bajo       | Bajo                            | Diferible                                         |
| **X-2**         | Output del modelo sin re-validación server-side                                | Bajo       | Bajo                            | Diferible                                         |
| **X-3**         | Web sin CSP ni anti-clickjacking                                               | Bajo       | Medio                           | Diferible                                         |

### Veredicto para abrir la beta de 100 usuarios

- **Debe entrar en v0.5.0:** **A-1** (guard `email_verified` en `saveApiKey`/`deleteApiKey`/`embedQuery`).
- **Fast-follow barato, idealmente en v0.5.0:** `maxInstances` en `embedQuery`/`saveApiKey` (A-4), confirmar **EEP** activado + colapsar mensaje de login (A-5), gatear el botón Google con el capacity gate en la UI + documentar que el cap no es server-enforced (A-2 parcial). Si se agrega `keyVersion` al doc cifrado ahora (K-3), se evita una migración dolorosa después — es casi gratis.
- **Diferible post-beta (con seguimiento):** App Check completo (A-3), hard-enforcement del capacity (A-2), hardening cripto de la master key — AAD + KMS (K-1/K-2), y todos los ítems Bajo de hardening.

**Conclusión:** el subsistema es apto para la beta de 100 usuarios **una vez aplicado A-1** y, preferentemente, los fast-follows baratos. No hay ninguna fuga de keys ni brecha de aislamiento entre usuarios; los riesgos restantes son de consistencia de enforcement, abuso de costo y defensa en profundidad, todos acotados al modelo de amenaza de una beta privada.
