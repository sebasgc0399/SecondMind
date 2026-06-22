# SPEC — Feature 65: Migración de emails transaccionales a Resend

> **Estado:** F1 **cerrado y en producción**. F2 **implementado + verificado en prod** (smoke 2026-06-22, fix `fc324b8`) — queda **done al mergear el cierre de docs**. **SPEC viva** (no archivar): cabos pendientes — TODO PII de F1, action URL post-beta, F1.4 diferido (**DMARC: publicado `p=none`, verificado por DNS, `rua` final in-domain `dmarc@getsecondmind.co` vía Email Routing → cabo y follow-up del `rua` externo CERRADOS 2026-06-22**; detalle en `gotchas/email-resend.md`). > **Alcance:** SecondMind manda sus emails transaccionales desde un provider propio (Resend), cerrando el loop de postulación (aviso de aprobación) y habilitando emails de Auth con HTML propio.
> **Dependencias:** SPEC-52/53 (postulación + `allowlist`), SPEC-54 Nivel 1 (handler `/auth/action`), SPEC-63 (`getsecondmind.co` live en Cloudflare). Todas **cumplidas**.
> **Estimado:** F1 ≈ 0.5–1 día dev (+ OPS DNS) · F2 ≈ 2–3 días dev (**F2.1 ya verificado → sin OPS externo**: F2.0 + 2 CFs + 2 templates + swap + QA). Detalle por sub-feature en cada Fn y en D6.
> **Stack:** Resend (`npm resend`), Cloud Functions v2 (Node 22), Admin SDK (`generateLink`), Cloudflare DNS, Secret Manager.

## Objetivo

Hoy SecondMind no manda **ningún** email propio: la verificación y el reset de password los emite Firebase Auth client-side (templates nativos sanitizados), y al aprobar una postulación en `/admin` **el postulante no se entera** — el loop postular→aprobar→entrar no cierra. Al terminar esta feature, un postulante aprobado **recibe un aviso automático** y entra; y los emails de Auth pasan a tener **HTML propio** vía Resend, lo que además **sortea el blocker `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`** (el contenido se genera fuera del pipeline de templates de Firebase).

## Secuencia vs la beta

- **F1 va ANTES de la beta.** Cierra el loop de postulación de forma **automática** → **no se documenta ningún puente manual** (aviso a mano al aprobar): Resend lo reemplaza desde el día uno. Es el camino crítico para operar la beta por curación desde `/admin`.
- **F2 es POST-beta.** Calidad, no urgencia: los emails de Auth **funcionan hoy** con los templates nativos de Firebase. El HTML propio es una mejora que no bloquea abrir la beta.

## Estado verificado (research cerrado — no re-investigar)

- **Envío hoy = 100% client-side.** `sendEmailVerification()` en `useAuth.ts:108` (signup) y `:129` (reenvío); `sendPasswordResetEmail()` en `useAuth.ts:116` (anti-enum silencia `user-not-found` en `:121-123`). El handler `/auth/action` (`src/app/auth/action/page.tsx`) procesa `oobCode` client-side y **se reusa intacto** en F2.
- **`processAccessRequest.ts`** aprueba en tx atómica (`allowlist/{email}` + `accessRequests/{id}.status='approved'`), **sin notificación**. Punto de inserción del email: **post-commit**, re-leer status, guard `status==='approved' && email`, `try/catch` best-effort que **no throwea**.
- **DNS `getsecondmind.co`** en Cloudflare. Email Routing inbound ya activo (MX `route1/2/3.mx.cloudflare.net`, SPF root `v=spf1 include:_spf.mx.cloudflare.net ~all`). **No** hay DMARC ni `resend._domainkey`. A root `199.36.158.100` (Firebase, DNS-only).
- **`generateLink` (Admin SDK):** devuelve la URL completa con `oobCode`. **El ruteo a `/auth/action` lo da el "customize action URL" de la Console (el Admin SDK lo HEREDA)**, no `actionCodeSettings.url` (eso solo setea `continueUrl`). Email inexistente **throwea, pero el código DEPENDE DEL ENTORNO**: prod (Email Enumeration Protection) devuelve `auth/internal-error`; el emulador de Auth, `auth/email-not-found` (confirmado en el smoke 2026-06-22). → el catch **NO ramifica por código** (ver F2.3 + `gotchas/email-resend.md`).
- **Secrets/guards reusables:** `defineSecret('RESEND_API_KEY')` + `.value()` en handler; `requireVerified`/`assertAllowlisted`/`requireAdmin`; `rateLimit(key, ip, {...})`; `appError`/`sanitizeError`.

---

## F1 — Infra Resend + aviso de aprobación de postulantes

> Desbloquea la beta. Mail **plano** (el postulante no tiene cuenta → sin `generateLink`).

### F1.1 — Cuenta Resend + dominio de envío verificado `[OPS — Sebastián]`

**Qué:** Crear cuenta Resend, agregar el dominio **apex `getsecondmind.co`** (D1) y publicar los records en Cloudflare.

**Criterio de done:**

- [ ] Dominio `getsecondmind.co` en estado **Verified** en Resend.
- [ ] Records en Cloudflare (pegando **solo el host**, no el FQDN — Cloudflare auto-appendea la zona):
  - DKIM: 3× `CNAME` `<token>._domainkey` → `<token>.dkim.amazonses.com` **en DNS-only/grey** (proxy naranja = Code 1004 y falla la verificación).
  - Return-path: `MX` `send` → `feedback-smtp.<region>.amazonses.com` (pri 10) + `TXT` `send` → `v=spf1 include:amazonses.com ~all`.
  - `TXT` `_dmarc` → `v=DMARC1; p=none; rua=mailto:dmarc@getsecondmind.co; fo=1` (recomendado, no obligatorio para verificar). **✅ Publicado y verificado por DNS el 2026-06-22** (un solo `_dmarc`, sin duplicado, en DNS-only; resolvers 1.1.1.1 + 8.8.8.8). El `rua` es **in-domain** (`dmarc@` ruteado a gmail por Email Routing) → sin autorización externa RFC 7489 §7.1; detalle en `gotchas/email-resend.md`.
- [ ] `nslookup` **antes/después** confirma que el **SPF/MX root NO cambió** (Email Routing inbound intacto).

**Notas:** Con el apex como dominio Resend, los DKIM CNAME cuelgan del apex (nombres simples, sin nesting `send.send`) y Resend igual parquea el return-path en `send.` por defecto → SPF de Resend vive en `send.`, el SPF root queda igual, **cero merge** (SPF no hereda apex→subdominio). From = `SecondMind <noreply@getsecondmind.co>`.

### F1.2 — Secret + helper de envío

**Qué:** `RESEND_API_KEY` en Secret Manager + un helper `sendEmail()` reusable (wrapper del SDK con manejo de error sincrónico).

**Criterio de done:**

- [ ] `firebase functions:secrets:set RESEND_API_KEY` seteado y visible en `functions:secrets:list`.
- [ ] `src/functions/src/email/sendEmail.ts`: `new Resend(resendApiKey.value())` **dentro** del handler; branch en `{ data, error }` (el SDK **no throwea** en errores de API); `sanitizeError` + `logger` en el path de fallo; devuelve éxito/fallo sin propagar throw.

**Archivos a crear/modificar:**

- `src/functions/src/email/sendEmail.ts` — helper de envío (nuevo).
- `src/functions/src/email/from.ts` — constante del From (nuevo).
- `src/functions/package.json` — dep `resend`.

### F1.3 — Email de aprobación en `processAccessRequest`

**Qué:** Tras aprobar, mandar mail plano "fuiste aceptado, entrá con el mismo email en app.getsecondmind.co".

**Criterio de done:**

- [ ] Envío **post-commit**, con guard `finalStatus==='approved' && email` (re-leído del doc), `try/catch` que **loggea y no throwea** (`{ ok: true }` se mantiene aunque el mail falle).
- [ ] Re-aprobar una request ya aprobada **no re-manda** (cubierto por el guard de status).
- [ ] Copy es/en + From de `from.ts`.

**Archivos a crear/modificar:**

- `src/functions/src/access/processAccessRequest.ts` — attach `secrets:[resendApiKey]`, llamar `sendEmail` post-commit.
- `src/functions/src/email/templates/approval.ts` — copy del aviso (nuevo).

### F1.4 — Webhook de bounces/complaints `[OPCIONAL — diferible]`

**Qué:** Endpoint HTTPS que recibe `email.bounced`/`email.complained` (accepted ≠ delivered) para flaguear direcciones malas.

**Criterio de done:** _(si se incluye)_ CF HTTPS verifica firma Svix y loggea el evento. **F1 mínimo solo loggea el `data.id` del send**; este sub-feature puede ser fast-follow.

### F1.5 — QA F1

**Criterio de done:**

- [ ] Emulador: aprobar dispara `sendEmail` (mockeado) post-commit; fallo de mail **no** rompe el approve.
- [ ] Smoke real con cuenta **throwaway** (protocolo CLAUDE.md step 5): postular → aprobar en `/admin` → el throwaway recibe el mail → **limpieza** (hard-delete del `accessRequests/{email}` + `allowlist/{email}`, verificada server-side por Firebase MCP).

---

## F2 — Reemplazo de emails de Auth (verify + reset) vía Resend

> Mejora de calidad **post-beta**. **Emitter-swap limpio**: reusa el handler `/auth/action` + `src/lib/authActions.ts` + el custom action URL **intactos** (SPEC-54); solo cambia **quién envía** (client SDK → CF con `generateLink` + Resend) y **el contenido** (HTML propio). Elimina la dependencia de dos sistemas de email y sortea el blocker de templates de Firebase.
>
> **Estado: implementado + verificado en prod (smoke 2026-06-22, `fc324b8`).** F2.0–F2.6 verdes end-to-end: lint + tsc + 360 unit + 39 e2e + smoke real (verify/reset con throwaway, SPF/DKIM pass, sin doble-envío, anti-enum confirmado). _Done_ al mergear este cierre de docs.

### Estado verificado para F2 (research cerrado 2026-06-22 — no re-investigar)

- **Custom action URL CONFIRMADO en vivo = `https://secondmind.web.app/auth/action`** (= nuestro handler custom, **NO** el default `/__/auth/action` de Firebase) → **F2 es emitter-swap limpio: sin re-apuntar, sin dependencia externa, sin reabrir el Console lock.** El dominio `web.app` da igual (el SPA `/auth/action` se sirve idéntico en todos los hostings; lo que importaba era handler custom vs default).
- **Firebase NO auto-envía** ningún email (`createUserWithEmailAndPassword` no manda nada; reset solo con la llamada explícita). `generate*Link` (Admin SDK) **solo devuelven el string, no envían** → evitar el doble-envío = **solo dejar de llamar los senders client-side**; no hay toggle server-side. Los templates nativos quedan dormidos.
- **3 call-sites client-side** a reemplazar: `useAuth.ts:108` (verify auto post-signup), `:129` (verify reenvío), `:116` (reset). Auditado: no hay FirebaseUI ni retries ocultos — **re-auditar igual** en implementación.
- **`sendEmail` es TEXT-ONLY hoy** (`SendEmailParams` sin `html`) → F2.0 lo extiende.
- **Scope CONFIRMADO** = exactamente {verify, reset}. No hay email-change / passwordless / MFA / borrado-de-cuenta email; el aviso de aprobación ya está en Resend (F1).

### Patrón de implementación (ambas CFs)

Son **emisores standalone**: a diferencia de `processAccessRequest` (F1), **no** hay write durable previo que proteger — el "disparo" es la llamada del cliente (para verify, la cuenta ya fue creada client-side; para reset no hay write). El patrón:

1. **Gate:** verify → `request.auth` presente (NO `requireVerified`: el user aún no verificó); reset → sin auth + `rateLimit(key, request.rawRequest.ip, {...})`.
2. **Generar el link AL VUELO** dentro del handler, justo antes del send (no anticipado) → maximiza la ventana del `oobCode` (reset ~1h, verify ~3d, single-use).
3. **Render** del template es-first con el link.
4. **`sendEmail({ to, subject, html, text, apiKey })`** best-effort en `try/catch` aislado, **SIN `idempotencyKey`** (D3). El wrapper ya garantiza no-throw.
5. **Resultado uniforme** al cliente. Reset: el catch trata **cualquier** fallo de `generateLink` como el caso uniforme (`return { ok: true }` incondicional, **sin ramificar por código** — varía por entorno) y loguea **WARN**; el `logger.error('send failed')` queda reservado solo para el fallo de envío de Resend (anti-enum server-side).

### F2.0 — Extender `sendEmail` con HTML (aditivo)

**Qué:** Agregar `html?: string` opcional a `SendEmailParams` y al payload; mandar **`html` + `text`** (multipart: deliverability + clientes sin HTML). No rompe el approval text-only.

**Criterio de done:**

- [ ] `SendEmailParams.html?: string`; el payload incluye `html` solo si está presente.
- [ ] `sendEmail.test.ts` cubre el nuevo campo sin perder las 3 ramas actuales (el test es el dueño del no-throw guarantee).
- [ ] El approval (text-only) sigue verde.

**Archivos a crear/modificar:** `src/functions/src/email/sendEmail.ts`, `src/functions/src/email/sendEmail.test.ts`.

### F2.1 — Custom action URL `[VERIFICADO ✅ 2026-06-22]`

**Qué:** Confirmado en Console: Authentication → Templates → "customize action URL" = **`https://secondmind.web.app/auth/action`** (lo fijó el equipo de Firebase en SPEC-54 F8).

**Criterio de done:**

- [x] La Console muestra esa URL → es nuestro handler custom → F2 arranca limpio.

**Notas:** Ya **no es bloqueante** (era el gate de F2). El Admin SDK **hereda** esta URL para rutear el `oobCode`. **No tocarla**: re-apuntar a `getsecondmind.co` por estética reabre el riesgo `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` y es post-beta (D4).

### F2.2 — CF `sendVerificationEmail` (autenticada)

**Qué:** Callable que genera el link de verificación y manda el email con HTML propio.

**Criterio de done:**

- [ ] Gate = `request.auth` presente (NO `requireVerified`: el user aún no verificó); email vía **`admin.auth().getUser(uid)`** (fuente de verdad, no el token).
- [ ] `generateEmailVerificationLink(email)` al vuelo → render template verify (F2.5) → `sendEmail` (html+text).
- [ ] `maxInstances` explícito (~5); **rate-limit por uid** (reenvío abusable); `sanitizeError` en catch; secret `RESEND_API_KEY` inline (`defineSecret` + `secrets:[]` + `.value()` — D5).

**Archivos a crear/modificar:** `src/functions/src/email/sendVerificationEmail.ts` (nuevo), `src/functions/src/index.ts`.

### F2.3 — CF `sendResetEmail` (pública, anti-enumeración)

**Qué:** Callable público que genera el reset link y lo manda.

**Criterio de done:**

- [ ] **Sin auth**; `rateLimit('sendResetEmail', request.rawRequest.ip, {...})` por IP; `maxInstances` explícito (~5).
- [ ] `generatePasswordResetLink(email)` en `try/catch`; **cualquier** fallo (email inexistente — código entorno-dependiente: prod/EEP `auth/internal-error`, emulador `auth/email-not-found` — o cualquier otro) → **WARN + `return { ok: true }` uniforme, SIN ramificar por código** (no oráculo). Fix `fc324b8`.
- [ ] `sanitizeError` en catch; secret inline (D5).

**Notas (gotcha — endurecimiento futuro, YAGNI ahora):** el rate-limit por IP **no** cubre el bombing dirigido (un atacante con muchas IPs llenando la bandeja de una víctima). Aceptable para la beta (volumen bajo, no somos objetivo masivo). Futuro: rate-limit **por email-target**, **silencioso** (mismo comportamiento observable exista o no el email, para no filtrar enumeración).

**Archivos a crear/modificar:** `src/functions/src/email/sendResetEmail.ts` (nuevo), `src/functions/src/index.ts`.

### F2.4 — Swap de los 3 call-sites client-side

**Qué:** Reemplazar las llamadas al SDK de Firebase por `httpsCallable` a las CFs.

**Criterio de done:**

- [ ] `useAuth.ts:108` (signup) y `:129` (reenvío) → `sendVerificationEmail`.
- [ ] `useAuth.ts:116` (reset) → `sendResetEmail`. El **anti-enum ahora vive en la CF** → el cliente deja de necesitar el special-case `user-not-found` (`:121-123`): muestra el mensaje uniforme y solo maneja transporte/rate-limit.
- [ ] Imports de `sendEmailVerification`/`sendPasswordResetEmail` removidos de `useAuth.ts` si quedan huérfanos; **re-auditar** que no haya otros call-sites.
- [ ] El flujo verify/reset end-to-end sigue funcionando (el `oobCode` lo consume el handler `/auth/action` intacto).

**Archivos a crear/modificar:** `src/hooks/useAuth.ts` (+ wrapper opcional `src/lib/authEmails.ts`, espejo de `authActions.ts` — YAGNI por defecto, pero mantiene `useAuth` limpio).

**Nota operativa:** post-migración, **no usar** el botón "Reset password" de la Console ni la hosted-UI (disparan los templates nativos, From viejo `noreply@secondmindv1.firebaseapp.com`). Con el swap el From visible pasa a `noreply@getsecondmind.co` (ya en `from.ts`).

### F2.5 — Templates HTML propios (verify + reset)

**Qué:** 2 templates HTML **es-first** (función que devuelve `{ subject, html, text }`, patrón espejo de `approval.ts` con COPY locale-keyed) + un **layout base liviano** compartido (una función wrapper, NO un sistema de templating).

**Criterio de done:**

- [ ] HTML responsive con `text` fallback; marca SecondMind; un CTA al link; Mailer-Tester razonable (SPF/DKIM/DMARC pass).
- [ ] **Verify:** reusar como base el wording español que ya ven los usuarios en el verify nativo ("Activá tu cuenta de SecondMind", copy paisa) — no arrancar de cero.
- [ ] es-first (consistente con approval); locale-inference diferido (no en F2).

**SUB-DECISIÓN ABIERTA (resolver en Plan mode) — cómo escribir el HTML:**

| Eje    | **A · HTML manual inline** _(recomendada)_                                                                                                                   | **B · React Email** (`@react-email/components`, nativo en Resend)                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Pro    | Cero deps nuevas en functions; control total; 2 templates simples (CTA + texto) manejables; el build de functions no crece                                   | Resuelve compat cross-client (componentes battle-tested → tablas inline-styled); `render()`→HTML; DX en JSX; Resend lo integra nativo |
| Contra | El HTML de email es un pozo de compat (Outlook ignora flex/grid, Gmail strip-ea `<style>`→todo inline, dark mode invierte colores); test cross-client a mano | Suma `@react-email/*` + React como dep de functions + setup JSX/TSX en el build (runtime Node, no UI); over-kill para 2 templates     |

**Recomendación:** **A** para 2 templates simples — evita la dependencia y el setup JSX. Ir a **B** solo si (a) el test cross-client muestra roturas que no valga pelear a mano, o (b) se prevén más emails HTML pronto. Si hay dudas en Plan mode, evaluar con `research-innovator`.

**Archivos a crear/modificar:** `src/functions/src/email/templates/{verify,reset}.ts` (nuevos) + `src/functions/src/email/templates/layout.ts` (wrapper liviano, si A).

### F2.6 — QA F2

**Criterio de done:**

- [ ] Emulador: las 2 CFs generan link (Admin SDK) y llaman `sendEmail` (mockeado); reset con email inexistente devuelve éxito uniforme (anti-enum).
- [ ] Action-codes vía Admin SDK (`generate*Link`) contra cuenta **throwaway** + **ADC** (nunca SA key commiteada); visitar `localhost/auth/action?mode=…&oobCode=…` con el `oobCode`; verify y reset completan end-to-end. Borrar la throwaway al cierre.
- [ ] **Sin doble-envío**: confirmar que Firebase no manda su template nativo además del de Resend.
- [ ] (Diferible — D-I) Smoke Android: el link abre en Custom Tab → `/auth/action` valida el `oobCode`.

---

## Orden de implementación

1. **F1.1** (OPS DNS) → todo F1 depende del dominio verificado.
2. **F1.2 → F1.3 → F1.5** → cierra el loop de la beta (entregable de mayor valor, **pre-beta**).
3. **F2.1 ✅ verificado** (action URL = `secondmind.web.app/auth/action`, sin bloqueo externo).
4. **F2.0** (`sendEmail` html) → **F2.5** (templates) → **F2.2 / F2.3** (CFs) → **F2.4** (swap) → **F2.6** (QA).

> **F1 entera antes de F2.** F1 desbloquea la beta y comparte la infra (F1.2) que F2 reusa. F2 es calidad post-beta, no urgencia.

## Decisiones clave

| #      | Decisión                                       | Detalle                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Dominio de envío = apex `getsecondmind.co`** | Elegido por Sebastián. From `noreply@getsecondmind.co`; records simples; Resend parquea el return-path en `send.` → root SPF/MX intactos. _Alternativa NO tomada: subdominio `send.` dedicado (máxima isolación de reputación, pero nesting `send.send`)._                                                                                                                                                                          |
| **D2** | **Fallos/rebotes no rompen el flujo**          | F1: email post-commit best-effort (branch en `{error}`, log, no throw). F2: idem en la CF. Bounces async vía webhooks (F1.4, **diferible**); el mínimo solo loggea el send id.                                                                                                                                                                                                                                                      |
| **D3** | **Idempotencia**                               | F1: guard `status==='approved'` + `idempotencyKey` (payload estático). **F2: SIN `idempotencyKey`** — `generateLink` emite `oobCode` fresco por llamada, así que una key estática daría 409 / código stale en un reenvío legítimo. El doble-click es **benigno** (2 códigos válidos, se usa uno, el otro expira): alcanza el **cooldown 60s ya existente (sessionStorage) + rate-limit server**. NO time-bucket (over-engineering). |
| **D4** | **Coexistencia con templates nativos de Auth** | F2 deja de llamar los senders client-side → Firebase **no auto-envía nada**, los templates nativos quedan **dormidos** (fallback, **no se borran**). El custom action URL está **verificado** en `secondmind.web.app/auth/action` (F2.1) y **no se toca** (re-apuntar a `getsecondmind.co` reabre el lock; post-beta). No usar el botón "Reset password" de Console post-migración (dispara el template nativo).                    |
| **D5** | **API key en Secret Manager**                  | `defineSecret('RESEND_API_KEY')` + `.value()` en el handler (nunca top-level). Mismo patrón que `BYOK_MASTER_KEY`/`OPENAI_API_KEY`.                                                                                                                                                                                                                                                                                                 |
| **D6** | **Esfuerzo por fase**                          | **F1 ≈ 0.5–1 día dev** (chica/media; F1.2+F1.3 son chicos, el costo real es OPS + espera de verificación DNS). **F2 ≈ 2–3 días dev** (media/grande: 2 CFs + 2 templates HTML + swap + QA action-codes). Webhook F1.4 sumaría ~0.5 día si se incluye. **F1 es pre-beta (camino crítico); F2 es post-beta (calidad).**                                                                                                                |

## Checklist global de completado

- [ ] Dominio `getsecondmind.co` verificado en Resend; `nslookup` confirma SPF/MX root intactos.
- [ ] `RESEND_API_KEY` en Secret Manager.
- [ ] Postulante aprobado recibe el aviso automático; fallo de envío **no** rompe el approve.
- [ ] (F2) Verify + reset llegan vía Resend con HTML propio; flujo `/auth/action` intacto.
- [ ] (F2) Reset público no filtra existencia de cuentas (anti-enumeración).
- [ ] `npm run lint` + `tsc` verdes; CFs desplegadas; QA con throwaway limpiado y verificado server-side.

## Riesgos

- **~~F2.1 puede bloquear F2~~ → RESUELTO:** action URL verificado en vivo (2026-06-22) = `secondmind.web.app/auth/action` (handler custom, no el default). F2 es emitter-swap limpio, **sin dependencia externa**. No re-apuntar el dominio (reabriría el lock; post-beta).
- **Email bombing dirigido (reset):** el rate-limit por IP de F2.3 **no** cubre a un atacante con muchas IPs llenando la bandeja de una víctima. **Aceptado para la beta** (volumen bajo, no somos objetivo masivo); endurecimiento futuro = rate-limit por email-target silencioso (ver F2.3). YAGNI ahora.
- **Cloudflare Code 1004:** DKIM CNAME proxeado (naranja) rompe la verificación. **Mitigación:** DNS-only explícito en F1.1.

## Correcciones de docs detectadas (fast-follow, fuera de F65)

- `CLAUDE.md` + `ESTADO-ACTUAL.md` § Cloud Functions: inventario corregido a **15 CFs v2** (`404ed37`). **Al cerrar F2: 15 → 17** (`sendVerificationEmail`, `sendResetEmail`).
- `Spec/ESTADO-ACTUAL.md:26`: fraseo "action URL esperando desbloqueo" **corregido** (F8 resuelto; action URL verificado en vivo).

## Siguiente paso (post-GO)

Tras GO de Sebastián: SDD **step 2 (Plan mode)** de F2 — Explore agents + Plan agent para afinar la integración (CFs + templates + swap) antes de codear. (No es parte de este SPEC.)
