# Gotchas — Emails transaccionales (Resend)

> Canon de gotchas del envío de emails transaccionales vía Resend (provider propio, dominio `getsecondmind.co`). Nacen en SPEC-65 F1 (aviso de aprobación de postulantes). Indexado en `Spec/ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)". Código: `src/functions/src/email/` (`sendEmail.ts`, `from.ts`, `templates/`).

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
