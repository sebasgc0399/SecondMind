# SPEC — Feature 65: Migración de emails transaccionales a Resend (Registro de implementación)

> Estado: Completada junio 2026 — F1 + F2 desplegadas y verificadas en prod (`secondmindv1`).
> Commits: `cb2fdd5` (F1 aviso de aprobación vía Resend), `fdce89e` (cierre docs F1), `82e9e3b` (F2 emails de Auth verify+reset con HTML propio), `fc324b8` (fix anti-enum entorno-agnóstico `sendResetEmail` F2.3), `c005886` (cierre docs F2), `9da853b` + `4c62961` (DMARC publicado `p=none` + `rua` in-domain).
> Gotchas operativos vigentes → `Spec/gotchas/email-resend.md` (índice en `Spec/ESTADO-ACTUAL.md`).

## Objetivo

Antes de esta feature SecondMind no mandaba **ningún** email propio: verify y reset los emitía Firebase Auth client-side (templates nativos sanitizados), y al aprobar una postulación en `/admin` **el postulante no se enteraba** — el loop postular→aprobar→entrar no cerraba. Tras la feature: un postulante aprobado **recibe un aviso automático** y entra, y los emails de Auth pasan a tener **HTML propio** vía Resend, lo que además **sortea el blocker `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`** (el contenido se genera fuera del pipeline de templates de Firebase). F1 fue pre-beta (camino crítico); F2, calidad post-beta.

## Qué se implementó

### F1 — Infra Resend + aviso de aprobación de postulantes

- **F1.1 — Dominio de envío `[OPS]`:** apex `getsecondmind.co` verificado en Resend; DKIM (3× `CNAME` `<token>._domainkey`), return-path (`MX`/`TXT` en `send.`) y DMARC, **todo DNS-only** (proxy naranja = Code 1004 y falla la verificación). SPF/MX root **intactos** (Resend parquea el return-path en `send.`, no hay merge). From = `SecondMind <noreply@getsecondmind.co>`.
- **F1.2 — Secret + helper:** `RESEND_API_KEY` en Secret Manager; helper `sendEmail()` reusable que **branch-ea en `{ data, error }`** (el SDK no throwea en errores de API) y nunca propaga throw. Archivos tocados: `src/functions/src/email/sendEmail.ts`, `src/functions/src/email/from.ts`, `src/functions/package.json`.
- **F1.3 — Aviso de aprobación:** envío **post-commit best-effort** en `processAccessRequest` (guard `status==='approved' && email` re-leído, `try/catch` que loggea y no throwea, `idempotencyKey` para deduplicar el doble-envío concurrente). Archivos tocados: `src/functions/src/access/processAccessRequest.ts`, `src/functions/src/email/templates/approval.ts`.
- **F1.4 — Webhook bounces/complaints:** **DIFERIDO** (opcional). El mínimo solo loggea el `data.id` del send. → ver Cabos abiertos.
- **F1.5 — QA F1:** emulador (fallo de mail no rompe el approve) + smoke real con cuenta throwaway, limpieza hard-delete verificada server-side por Firebase MCP.

### F2 — Emails de Auth (verify + reset) vía Resend — emitter-swap limpio

Reusó el handler `/auth/action` + el custom action URL **intactos** (SPEC-54); solo cambió **quién envía** (client SDK → CF con `generateLink` + Resend) y **el contenido** (HTML propio). Inventario de CFs: **15 → 17**.

- **F2.0 — `sendEmail` con HTML:** `html?` aditivo en `SendEmailParams`, envío **multipart `html` + `text`**; el approval text-only siguió verde. Archivos tocados: `sendEmail.ts`, `sendEmail.test.ts`.
- **F2.1 — Custom action URL:** verificado en vivo = `https://secondmind.web.app/auth/action` (handler custom, **no** el default). **No se tocó** (re-apuntar reabre el Console lock; post-beta).
- **F2.2 — CF `sendVerificationEmail` (autenticada):** gate `request.auth` (NO `requireVerified`), email vía `getUser(uid)`, link al vuelo, render + `sendEmail` html+text, `maxInstances` + rate-limit por uid, secret inline. **Reporta el fallo** (throw `verify-send-failed`, sin anti-enum). Archivos tocados: `src/functions/src/email/sendVerificationEmail.ts`, `src/functions/src/index.ts`.
- **F2.3 — CF `sendResetEmail` (pública, anti-enum):** sin auth, `rateLimit` por IP, `generatePasswordResetLink` en `try/catch`; **cualquier** fallo → **WARN + `return { ok: true }` uniforme, SIN ramificar por código** (entorno-dependiente; fix `fc324b8`); `ERROR` reservado al fallo de Resend. Archivos tocados: `src/functions/src/email/sendResetEmail.ts` (+ extracción `clientIpHash`), `src/functions/src/index.ts`.
- **F2.4 — Swap de los 3 call-sites:** `useAuth.ts:108`/`:129` → `sendVerificationEmail`; `:116` → `sendResetEmail`. El anti-enum **migró a la CF** → se removió el special-case `user-not-found` del cliente. Archivos tocados: `src/hooks/useAuth.ts`.
- **F2.5 — Templates HTML propios:** **decisión A** (HTML manual inline, sin React Email), es-first, con layout base liviano compartido. Archivos tocados: `src/functions/src/email/templates/{verify,reset}.ts`, `src/functions/src/email/templates/layout.ts`.
- **F2.6 — QA F2:** emulador + action-codes vía Admin SDK + **ADC** contra throwaway (nunca SA key commiteada), **sin doble-envío**, anti-enum confirmado. Gate verde: lint + tsc + 360 unit + 39 e2e + smoke real en prod (SPF/DKIM PASS, `emailVerified` y `passwordUpdatedAt` server-side, limpieza `NOT_FOUND`).

## Decisiones clave

| #      | Decisión                                       | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Dominio de envío = apex `getsecondmind.co`** | Elegido por Sebastián. From `noreply@getsecondmind.co`; records simples; Resend parquea el return-path en `send.` → root SPF/MX intactos. _Alternativa NO tomada: subdominio `send.` dedicado (máxima isolación de reputación, pero nesting `send.send`)._                                                                                                                                                                          |
| **D2** | **Fallos/rebotes no rompen el flujo**          | F1: email post-commit best-effort (branch en `{error}`, log, no throw). F2: idem en la CF. Bounces async vía webhooks (F1.4, **diferible**); el mínimo solo loggea el send id.                                                                                                                                                                                                                                                      |
| **D3** | **Idempotencia**                               | F1: guard `status==='approved'` + `idempotencyKey` (payload estático). **F2: SIN `idempotencyKey`** — `generateLink` emite `oobCode` fresco por llamada, así que una key estática daría 409 / código stale en un reenvío legítimo. El doble-click es **benigno** (2 códigos válidos, se usa uno, el otro expira): alcanza el **cooldown 60s ya existente (sessionStorage) + rate-limit server**. NO time-bucket (over-engineering). |
| **D4** | **Coexistencia con templates nativos de Auth** | F2 deja de llamar los senders client-side → Firebase **no auto-envía nada**, los templates nativos quedan **dormidos** (fallback, **no se borran**). El custom action URL está **verificado** en `secondmind.web.app/auth/action` (F2.1) y **no se toca** (re-apuntar a `getsecondmind.co` reabre el lock; post-beta). No usar el botón "Reset password" de Console post-migración (dispara el template nativo).                    |
| **D5** | **API key en Secret Manager**                  | `defineSecret('RESEND_API_KEY')` + `.value()` en el handler (nunca top-level). Mismo patrón que `BYOK_MASTER_KEY`/`OPENAI_API_KEY`.                                                                                                                                                                                                                                                                                                 |
| **D6** | **Secuencia F1 antes de F2**                   | F1 desbloqueó la beta (camino crítico) y comparte la infra (`sendEmail`, secret) que F2 reusó. F2 fue calidad post-beta, no urgencia (los emails de Auth ya funcionaban con los templates nativos).                                                                                                                                                                                                                                 |

## Cabos abiertos (post-beta)

- **TODO PII de F1:** en el **primer error real** de Resend, confirmar que el `message` logueado no arrastre el email del usuario (sanitización). Hoy sin evidencia porque no hubo fallo real.
- **Action URL post-beta:** re-apuntar el "customize action URL" a `app.getsecondmind.co/auth/action` para alinear link↔From (deliverability; Mailer-Tester flaggea el mismatch). **Reabre el riesgo `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`** (Console lock, SPEC-54) → decisión post-beta con Sebastián.
- **F1.4 webhook bounces/complaints:** diferido (fast-follow opcional, ~0.5 día). CF HTTPS que verifica firma Svix y flaguea direcciones malas (accepted ≠ delivered).
- **Email bombing dirigido (reset):** el rate-limit por IP de F2.3 **no** cubre un atacante con muchas IPs llenando la bandeja de una víctima. **Aceptado para la beta** (volumen bajo). Endurecimiento futuro: rate-limit por email-target **silencioso** (sin filtrar enumeración). YAGNI ahora.
- **DMARC:** ✅ **CERRADO 2026-06-22** — publicado `p=none` (observación), `rua` in-domain `dmarc@getsecondmind.co` vía Email Routing. **Endurecer a `quarantine`/`reject` post-beta** con los datos de los reportes `rua`.

## Lecciones

- **El código de error de `generateLink` para email inexistente DEPENDE DEL ENTORNO** (prod/EEP `auth/internal-error`, emulador `auth/email-not-found`). Un `try/catch` anti-enumeración **NO debe ramificar por código** — trata cualquier fallo como el caso uniforme y usa el código solo para el nivel de log. Ramificar deja la rama muerta en prod (fix `fc324b8`).
- **Anti-enum del reset = `return { ok: true }` incondicional**; el `logger.error` se reserva al fallo de envío de Resend. El de verify, en cambio, **sí reporta** (el user ya está autenticado, no hay enumeración que proteger).
- **Sin `idempotencyKey` cuando el payload no es estático:** `generateLink` emite un `oobCode` fresco por llamada → una key estática daría 409/código stale en un reenvío legítimo. El doble-click es benigno (cooldown 60s + rate-limit alcanzan).
- **Un `rua` de DMARC a destino externo (gmail) exige autorización RFC 7489 §7.1** (`_report._dmarc`, que da NXDOMAIN y Gmail no publica) → usar `rua` **in-domain** y rutearlo por Email Routing.
- **El SDK de Resend no throwea en errores de API** (branch en `{ data, error }`), el error es un **objeto plano** (no `Error`) y **no expone timeout** (acotar con `Promise.race`). El test del helper es el dueño del no-throw guarantee.
- Detalle completo de los 15 gotchas del dominio (Resend + DNS/email auth) → `Spec/gotchas/email-resend.md`.
