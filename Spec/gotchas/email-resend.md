# Gotchas — Emails transaccionales (Resend)

> Canon de gotchas del envío de emails transaccionales vía Resend (provider propio, dominio `getsecondmind.co`). Nacen en SPEC-65 F1 (aviso de aprobación de postulantes) + F2 (emails de Auth verify/reset vía Admin SDK `generateLink`). Indexado en `Spec/ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)". Código: `src/functions/src/email/` (`sendEmail.ts`, `from.ts`, `templates/`, `sendVerificationEmail.ts`, `sendResetEmail.ts`).

## El SDK de Resend no lanza excepción ante errores de API

`resend.emails.send(...)` **NO throwea** ante errores de API (4xx/5xx/rate-limit): devuelve `{ data, error }`. Un branch solo-excepción (`try/catch` sin mirar `error`) trataría un **401/429/validación como éxito**. Hay que **branquear explícitamente en `error`** y, por separado, envolver en `try/catch` para los throws de **transporte** (red caída, DNS). Las dos capas son distintas: el `error` cubre el rechazo a nivel API; el `catch` cubre la excepción de transporte. Patrón vivo en [`src/functions/src/email/sendEmail.ts`](../../src/functions/src/email/sendEmail.ts).

## El error de Resend es un objeto plano, no un Error

El `error` que devuelve `emails.send` es un objeto plano `{ name, message }`, **no una instancia de `Error`**. Por eso `sanitizeError()` (que extrae solo de `instanceof Error`) lo perdería como `"[object Object]"`: en el branch `error` se leen `error.name` / `error.message` **directo** (truncando el message a 200 chars, sin logear el destinatario por PII). `sanitizeError()` se reserva para el `catch` de transporte, que sí recibe un `Error` real. Se loguea con el shape `{ code, message }` del resto del codebase (`code = error.name`, p.ej. `validation_error`).

## El SDK de Resend no expone timeout: acotar con Promise.race

El SDK de Resend **no acepta** un timeout HTTP ni un `AbortSignal` (verificado contra la doc, junio 2026). Un Resend lento colgaría el handler hasta el `timeoutSeconds` de la CF. Se acota con `Promise.race([send, timeout(~10s)])` + `clearTimeout`, devolviendo `{ ok: false }` si el timeout gana. El approve ya es durable (el envío es post-commit), así que el peor caso es **latencia**, nunca pérdida de datos. El send perdedor se deja morir con un `.catch(() => {})` para no generar un `unhandledRejection`.

## idempotencyKey para deduplicar el envío concurrente

`emails.send(payload, { idempotencyKey })` deduplica **server-side 24h**: dos envíos con la misma key y el mismo payload cuentan como uno; el segundo concurrente vuelve por el campo `error` (409) → `{ ok: false }`. Cierra la ventana de doble-envío que un guard de timestamp (re-leer → enviar → marcar, no atómico) no cubre. Formato de key: `<evento>/<entidad>` con la entidad **normalizada** (p.ej. `approval/${email}` con el email `trim().toLowerCase()`), para que dos invocaciones del mismo sujeto colisionen. **El payload debe ser idéntico entre envíos de la misma key** o Resend devuelve `409 invalid_idempotent_request` — seguro acá porque el copy es estático.

## El secret debe existir en Secret Manager antes del deploy

Agregar un `defineSecret('RESEND_API_KEY')` al array `secrets: [...]` de una CF **cambia el binding del deploy**: el secret debe existir en Secret Manager **antes** de desplegar (`firebase functions:secrets:set RESEND_API_KEY`) o el deploy/runtime falla. El `deploy:functions` otorga `roles/secretmanager.secretAccessor` a la SA de compute **solo** (no hay que tocar IAM a mano). `.value()` solo dentro del handler (nunca top-level, sería `undefined` en deploy).

## El secret en el emulador va por emu-secret.mjs, no por env vars

`defineSecret(...).value()` resuelve de Secret Manager (prod) o de `src/functions/.secret.local` (emulador), **NO de `process.env`** → el runtime forkeado del emulador no ve una env var inline. Para los e2e que disparan un envío, `scripts/emu-secret.mjs` siembra una `RESEND_API_KEY` **dummy** (gitignored, regenerada por corrida): el envío falla a propósito (key inválida) y el handler lo traga.

## vi.mock no cruza al proceso del emulador de Functions

`vi.mock('resend')` solo afecta el proceso de test; **NO llega al proceso forkeado** del emulador de Functions, que importa el módulo real. Por eso la garantía **no-throw** del helper la cubre el **unit test** (mock del SDK, las 3 ramas: éxito / error de API / throw de transporte) + la estructura del código; el e2e de emulador solo asserta el **invariante del flujo** (que el approve devuelve `{ ok: true }` y persiste aunque el mailer falle con la key dummy), no el resultado del envío.

## Envío best-effort post-commit: marcar el timestamp solo tras éxito

El aviso se manda **post-commit** (después de la tx que ya persistió el efecto durable) y vive en su **propio `try/catch`** para que un fallo del envío (o de la re-lectura / del `set` del timestamp) **nunca** alcance el catch externo y degrade el `{ ok: true }` a `internal`. Single-send: el marcador (`approvalEmailSentAt`) se escribe **solo tras un envío exitoso** → si falla queda ausente y un reintento del flujo re-manda; si está, se saltea (a-lo-sumo-una-vez tras éxito). El smoke de SPEC-65 F1 lo confirmó en prod: tx commit a `.296Z` → `approvalEmailSentAt` a `.721Z` (~425ms después). El dato a enviar suele ser tx-local (se normaliza dentro de la tx) → re-leerlo del doc post-commit.

## DKIM de Resend como TXT via Cloudflare Auto configure

Al verificar el dominio de envío con el **Auto configure** de Cloudflare, el DKIM quedó como **`TXT resend._domainkey`** (no 3× CNAME manuales). El registro de envío vive en el subdominio `send.` por defecto, así que el **SPF/MX del root no se toca** (el Email Routing inbound de Cloudflare queda intacto, sin merge). Si se publican CNAME a mano en Cloudflare, hay que dejarlos en **Solo DNS / gris** (proxiados = `Code 1004` y la verificación falla). DNS-only es inherente para TXT/MX. Baseline de correo del dominio: ver [`gotchas/hosting-dominio.md`](hosting-dominio.md).

## TODO (PII): el message logueado en el primer error real

`sendEmail` loguea `{ code: error.name, message: error.message.slice(0, 200) }`. El smoke de F1 salió `Delivered` **sin error**, así que falta confirmar — en el **primer error real** de Resend que aparezca en logs — que ese `message` **no arrastre el email del postulante**. Si lo hiciera, dejar **solo el `code`**. No bloqueante; pendiente de la primera observación real.

## El código de error de `generateLink` DEPENDE DEL ENTORNO — no ramificar sobre él

`admin.auth().generatePasswordResetLink(email)` / `generateEmailVerificationLink(email)` lanzan cuando el email no existe, **pero el código de error NO es estable entre entornos**: en **prod con Email Enumeration Protection** activado el backend enmascara `EMAIL_NOT_FOUND` y el Admin SDK lo surfacea como **`auth/internal-error`**; el **emulador de Auth** devuelve **`auth/email-not-found`**. Confirmado empíricamente en el smoke de F2 (2026-06-22): el source-mapping de `firebase-admin` dice `email-not-found`, pero prod dio `internal-error`. **Regla (gotcha estrella):** un `try/catch` anti-enumeración **NO debe depender del código de error exacto** de `generateLink` — trata **CUALQUIER** fallo como el caso uniforme (`return { ok: true }` incondicional) y usa el código solo para decidir el **nivel de log** (WARN para el catch; ERROR reservado al fallo de envío de Resend). Ramificar por `auth/email-not-found` (como sugería el source) deja la rama **muerta en prod** y loguea cada reset a un inexistente como ERROR (falsa alarma). Patrón vivo en [`sendResetEmail.ts`](../../src/functions/src/email/sendResetEmail.ts) (fix `fc324b8`). Corolario: el anti-enum del reset es uniforme porque `generateLink` + `sendEmail` **solo corren para emails existentes** → cualquier fallo posterior está correlacionado con la existencia; solo formato + rate-limit (pre-`generateLink`) pueden burbujear.

## SPF + DKIM del dominio de envío: PASS confirmado

El smoke de F2 confirmó la autenticación del From (por DNS + el header DKIM del email real — **Mailinator NO agrega `Authentication-Results`**, así que el veredicto se valida por DNS): **DKIM** firma con `d=getsecondmind.co; s=resend` (**alineado con el From** → DKIM alignment OK) y la clave pública vive en `resend._domainkey.getsecondmind.co`; **SPF** pasa por el Return-Path `send.getsecondmind.co` (`v=spf1 include:amazonses.com ~all` + MX `feedback-smtp.us-east-1.amazonses.com`). Resend envía vía Amazon SES. Ambos autentican → el From queda firmado para verify/reset/approval.

## El host del action URL ≠ el dominio del From (deliverability, post-beta)

Los links de los emails de Auth apuntan al **action URL de la Console** (`secondmind.web.app/auth/action`, heredado por `generateLink`), pero el From es `noreply@getsecondmind.co` → **mismatch link-host vs sending-domain** que Mailer-Tester flaggea (señal de phishing → resta deliverability). **No es blocker** (SPF+DKIM pasan). **Fix post-beta:** re-apuntar el "customize action URL" a `app.getsecondmind.co/auth/action` (el SPA se sirve idéntico ahí, ya está en authorized domains) para alinear link y From — pero eso **reabre el riesgo `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`** (Console lock, ver SPEC-54), por eso es decisión post-beta con Sebastián.

## DMARC publicado — `p=none` (observación), `rua` in-domain

`getsecondmind.co` **tiene DMARC publicado** (Cloudflare, **DNS-only**), verificado por DNS (`Resolve-DnsName` contra **1.1.1.1 y 8.8.8.8** — `dig` no está en este Windows): **un solo** `_dmarc`, **sin duplicado**, valor final `v=DMARC1; p=none; rua=mailto:dmarc@getsecondmind.co; fo=1` (`rua` actualizado a in-domain el 2026-06-22). Root **intacto** (SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, MX `route1/2/3.mx.cloudflare.net` de Email Routing — **sin DMARC mezclado en el apex**). `p=none` = **modo observación**: no cuarentena/rechaza nada, solo solicita reportes agregados. SPF+DKIM ya autentican el From, así que DMARC acá es reputación + telemetría, no enforcement. **Endurecer a `quarantine`/`reject` post-beta**, una vez que los reportes `rua` confirmen que no hay fuentes legítimas sin alinear.

**`rua` in-domain → sin autorización externa (RFC 7489 §7.1 no aplica).** El `rua` apunta a `dmarc@getsecondmind.co` (**mismo org-domain** que el `_dmarc`), ruteado a la casilla real de Sebastián vía Cloudflare Email Routing (regla `dmarc@` → gmail, **activa**; catch-all sigue off, la de soporte intacta). Como el host del `rua` **==** el dominio publicado, **NO aplica** la "Verifying External Destinations" de RFC 7489 §7.1 → no hace falta el record `_report._dmarc` y los reportes agregados **llegan garantizados**. **Histórico (resuelto):** el `rua` arrancó apuntando a `gmail.com` directo, un **destino externo** que requería el record de autorización `getsecondmind.co._report._dmarc.gmail.com` (`TXT "v=DMARC1"`) — daba **NXDOMAIN** y Gmail no lo publica para mailboxes de usuario, así que los reporters RFC-compliant podían descartar los reportes. Se movió a in-domain el 2026-06-22 para cerrar ese hueco.

## Cleanup de un throwaway con SIGNUP no se cierra entero por MCP

El smoke de F2 (a diferencia de F1) crea una **cuenta de Auth** (signup del throwaway). El **Firebase MCP no expone `auth_delete_user`** (solo `auth_get_users`/`auth_update_user`) y el CLI no borra users arbitrarios → el borrado del Auth user es **manual por Console** (Authentication → Users → Delete), o reservar la contraseña del reset para llamar el self-service `deleteAccount`. Lo demás (`allowlist/{email}`, `rateLimits/` del smoke, `users/{uid}/**`) sí se borra por MCP (`firestore_delete_document`) y se verifica NOT_FOUND server-side. Preverlo en cualquier smoke futuro con signup. En F1 no aplicaba (el postulante no tenía cuenta de Auth).
