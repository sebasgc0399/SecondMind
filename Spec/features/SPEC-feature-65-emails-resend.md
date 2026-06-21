# SPEC — Feature 65: Migración de emails transaccionales a Resend

> **Estado:** Aprobado (GO de Sebastián, 2026-06-21) — pendiente implementación. Próximo paso: SDD step 2 (Plan mode) de F1. **No codeado.** > **Alcance:** SecondMind manda sus emails transaccionales desde un provider propio (Resend), cerrando el loop de postulación (aviso de aprobación) y habilitando emails de Auth con HTML propio.
> **Dependencias:** SPEC-52/53 (postulación + `allowlist`), SPEC-54 Nivel 1 (handler `/auth/action`), SPEC-63 (`getsecondmind.co` live en Cloudflare). Todas **cumplidas**.
> **Estimado:** F1 ≈ 0.5–1 día dev (+ OPS DNS) · F2 ≈ 2–3 días dev (+ OPS Console). Detalle por sub-feature en cada Fn y en D6.
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
- **`generateLink` (Admin SDK):** devuelve la URL completa con `oobCode`. **El ruteo a `/auth/action` lo da el "customize action URL" de la Console (el Admin SDK lo HEREDA)**, no `actionCodeSettings.url` (eso solo setea `continueUrl`). Email inexistente **throwea `auth/internal-error`** (no `user-not-found`).
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
  - `TXT` `_dmarc` → `v=DMARC1; p=none; rua=mailto:sebasgc0399@gmail.com` (recomendado, no obligatorio para verificar).
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

> Mejora de calidad **post-beta**. Reusa el handler `/auth/action` intacto; solo cambia **quién envía** y **el contenido**.

### F2.1 — Verificar el custom action URL de la Console `[OPS — pre-requisito duro]`

**Qué:** Confirmar que Authentication → Templates → "customize action URL" = `https://secondmind.web.app/auth/action`.

**Criterio de done:**

- [ ] La Console muestra esa URL (la fijó el equipo de Firebase en SPEC-54 F8).

**Notas:** **Bloqueante si está mal**: el Admin SDK **hereda** esa URL para rutear el `oobCode` (no se setea por código). Editarla puede estar **server-locked** (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`) → requeriría soporte de Firebase. **Verificar primero** antes de codear F2.

### F2.2 — CF `sendVerificationEmail` (autenticada)

**Qué:** Callable que genera el link y manda el email de verificación con HTML propio.

**Criterio de done:**

- [ ] Gate = `request.auth` presente (el usuario aún **no** está verificado → `requireVerified` no aplica); lee el email del token.
- [ ] `generateEmailVerificationLink(email)` → extrae la URL → `sendEmail` con template de F2.5.
- [ ] `maxInstances` explícito; `sanitizeError` en catch; rate-limit por uid/IP (reenvío abusable).

**Archivos a crear/modificar:** `src/functions/src/email/sendVerificationEmail.ts` (nuevo), `src/functions/src/index.ts`.

### F2.3 — CF `sendResetEmail` (pública, anti-enumeración)

**Qué:** Callable público que genera el reset link y lo manda.

**Criterio de done:**

- [ ] **Sin auth**; `rateLimit('sendResetEmail', request.rawRequest.ip, {...})` por IP.
- [ ] `generatePasswordResetLink(email)` en `try/catch`; email inexistente throwea `auth/internal-error` → **se captura y se devuelve éxito uniforme** (no oráculo de enumeración).
- [ ] `maxInstances` explícito; `sanitizeError` en catch.

**Archivos a crear/modificar:** `src/functions/src/email/sendResetEmail.ts` (nuevo), `src/functions/src/index.ts`.

### F2.4 — Swap de los 2 call-sites client-side

**Qué:** Reemplazar las llamadas al SDK de Firebase por las CFs.

**Criterio de done:**

- [ ] `useAuth.ts:108` (signup) y `:129` (reenvío) → `sendVerificationEmail` callable.
- [ ] `useAuth.ts:116` (reset) → `sendResetEmail` callable, **preservando** el silenciado anti-enum del lado cliente.
- [ ] El flujo verify/reset end-to-end sigue funcionando (el `oobCode` lo consume el handler `/auth/action` intacto).

**Archivos a crear/modificar:** `src/hooks/useAuth.ts` (y un wrapper en `src/lib/` solo si aporta — YAGNI por defecto).

### F2.5 — Templates HTML propios (verify + reset)

**Qué:** Diseñar 2 templates HTML (es/en), **nuevos** (la copy F9 NO está aplicada → no es base).

**Criterio de done:**

- [ ] HTML responsive con `text` fallback; marca SecondMind; un CTA al link; pasa un Mailer-Tester razonable (SPF/DKIM/DMARC pass).

**Archivos a crear/modificar:** `src/functions/src/email/templates/{verify,reset}.ts` (nuevos).

### F2.6 — QA F2

**Criterio de done:**

- [ ] Action-codes vía Admin SDK (`generate*Link`) contra cuenta **throwaway** + **ADC** (nunca SA key commiteada); visitar `localhost/auth/action?...` con el `oobCode`; verify y reset completan. Borrar la throwaway al cierre.

---

## Orden de implementación

1. **F1.1** (OPS DNS) → todo F1 depende del dominio verificado.
2. **F1.2 → F1.3 → F1.5** → cierra el loop de la beta (entregable de mayor valor, **pre-beta**).
3. **F2.1** (OPS Console — verificar antes de codear; potencial bloqueo externo).
4. **F2.5** (templates) → **F2.2 / F2.3** (CFs) → **F2.4** (swap) → **F2.6** (QA).

> **F1 entera antes de F2.** F1 desbloquea la beta y comparte la infra (F1.2) que F2 reusa. F2 es calidad post-beta, no urgencia.

## Decisiones clave

| #      | Decisión                                       | Detalle                                                                                                                                                                                                                                                                                                              |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Dominio de envío = apex `getsecondmind.co`** | Elegido por Sebastián. From `noreply@getsecondmind.co`; records simples; Resend parquea el return-path en `send.` → root SPF/MX intactos. _Alternativa NO tomada: subdominio `send.` dedicado (máxima isolación de reputación, pero nesting `send.send`)._                                                           |
| **D2** | **Fallos/rebotes no rompen el flujo**          | F1: email post-commit best-effort (branch en `{error}`, log, no throw). F2: idem en la CF. Bounces async vía webhooks (F1.4, **diferible**); el mínimo solo loggea el send id.                                                                                                                                       |
| **D3** | **Idempotencia**                               | F1: guard `status==='approved'` antes de enviar. F2: `generateLink` emite `oobCode` fresco por llamada → dedupe vía **rate-limit por IP + debounce de botón** (no doble-send en doble-click).                                                                                                                        |
| **D4** | **Coexistencia con templates nativos de Auth** | F2 deja de llamar los senders client-side → los templates nativos de Firebase quedan **dormidos** (fallback, **no se borran**). El custom action URL de la Console **debe seguir** apuntando a `/auth/action` (F2.1).                                                                                                |
| **D5** | **API key en Secret Manager**                  | `defineSecret('RESEND_API_KEY')` + `.value()` en el handler (nunca top-level). Mismo patrón que `BYOK_MASTER_KEY`/`OPENAI_API_KEY`.                                                                                                                                                                                  |
| **D6** | **Esfuerzo por fase**                          | **F1 ≈ 0.5–1 día dev** (chica/media; F1.2+F1.3 son chicos, el costo real es OPS + espera de verificación DNS). **F2 ≈ 2–3 días dev** (media/grande: 2 CFs + 2 templates HTML + swap + QA action-codes). Webhook F1.4 sumaría ~0.5 día si se incluye. **F1 es pre-beta (camino crítico); F2 es post-beta (calidad).** |

## Checklist global de completado

- [ ] Dominio `getsecondmind.co` verificado en Resend; `nslookup` confirma SPF/MX root intactos.
- [ ] `RESEND_API_KEY` en Secret Manager.
- [ ] Postulante aprobado recibe el aviso automático; fallo de envío **no** rompe el approve.
- [ ] (F2) Verify + reset llegan vía Resend con HTML propio; flujo `/auth/action` intacto.
- [ ] (F2) Reset público no filtra existencia de cuentas (anti-enumeración).
- [ ] `npm run lint` + `tsc` verdes; CFs desplegadas; QA con throwaway limpiado y verificado server-side.

## Riesgos

- **F2.1 puede bloquear F2:** si el custom action URL de la Console no está bien o necesita edición, el lock `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` puede requerir soporte de Firebase (dependencia externa, sin ETA). **Mitigación:** verificar primero; F1 no depende de esto.
- **Cloudflare Code 1004:** DKIM CNAME proxeado (naranja) rompe la verificación. **Mitigación:** DNS-only explícito en F1.1.

## Correcciones de docs detectadas (fast-follow, fuera de F65)

- `CLAUDE.md` § Cloud Functions: inventario **stale** — son **15 CFs v2**, no "~11 + 2 triggers v1"; `onUserCreated/onUserDeleted` **ya no existen** (removidos en SPEC-53). Actualizar al cerrar.
- `Spec/ESTADO-ACTUAL.md` (candidato Nivel 2): el prereq "espera al dominio de Namecheap" está **resuelto** (dominio live en Cloudflare). Esta feature lo materializa.

## Siguiente paso (post-GO)

SDD **step 2 (Plan mode)** de F1: Explore agents + Plan agent para afinar la integración antes de codear. (No es parte de este SPEC.)
