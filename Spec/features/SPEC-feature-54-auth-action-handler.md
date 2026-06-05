# SPEC — Feature 54: Custom auth action handler (`/auth/action`) — Nivel 1

> **Estado:** ✅ **Código completo, en prod y testeado** (`0.4.4`, deploy 2026-06-03/04). F1–F7 implementados, desplegados a `secondmind.web.app` y verificados E2E en prod. **F8 (custom action URL) + F9 (copy español de templates) PENDIENTES del soporte de Firebase** — config server-side, NO código (ver nota abajo). Las secciones F1–F9 describen lo enviado.
> **Verificación:** build (tsc+vite) + lint completo + `npm test` **252/252** verdes. E2E Playwright local (fallback · verify ok/error · reset form/validación/golden path · claro/oscuro · 375/1280) + **test en prod real** con oobCodes del Admin SDK contra `secondmind.web.app` (verify success + reset golden path; **G3 confirmado en prod**: usuario logueado igual recibe la landing standalone, sin app shell ni redirect). QA con cuenta descartable `qa-spec54@example.com` (borrada al cierre) + SA key temporal (archivo borrado + revocada en GCP).
> **Desvío/agregado (decidido en implementación):** se sumó el **fix PWA `navigateFallbackDenylist: /^\/auth\/action/`** ([vite.config.ts](../../vite.config.ts), commit `e7df5b0`) tras detectar en el test de prod que el service worker servía el `index.html` precacheado (bundle viejo sin la ruta → 404 en el `*` del Layout). Crítico porque la landing se golpea desde **links de email externos** y debe cargar siempre el bundle actual. No estaba en el SPEC original; gotcha escalado a `gotchas/pwa-offline.md`.
> **⛔ F8/F9 BLOQUEADAS por Firebase (escalado a soporte):** la Console devuelve `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` al guardar el callbackUri (F8) y al editar los templates (F9) tras varios reintentos. Escalado al engineering team de Firebase vía **soporte de Firebase** (NO Google Cloud Support — Blaze es facturación, no incluye soporte técnico de GCP; confirmado por Ruben). Puede tardar días. Son **config server-side, no commits** — la landing ya está lista; cuando el soporte mueva el callbackUri, los emails apuntan a `/auth/action` y se activa **sin más deploy**. **Smoke email→landing queda pendiente post-soporte** (no bloqueó el merge; el código ya está validado en prod con oobCodes manuales).
> **Versión:** `0.4.4` (client-side + config; **no abre la beta**, no toca rules ni gate de acceso). 4 commits feat + 1 release + 1 fix PWA en `feat/auth-action-pages` → merge `--no-ff` a `main`.
> **Depende de:** F47 (LoginCard, verify-email page, `authErrors.ts`, `SignUpForm` validación), SPEC-51 (`enforceAccessGate`, store reactivo `loginError` — **no se tocan**), SPEC-53 (`SignupGate` cliente-only — no se toca).
> **Origen:** las "action handler pages" genéricas de Firebase (`secondmindv1.firebaseapp.com/__/auth/action`) rompen la coherencia visual del producto en los dos momentos más frágiles del onboarding (activar cuenta / reset password).

## Objetivo

Una página pública `/auth/action` que reemplaza la landing genérica de Firebase para **verificación de email** y **reset de contraseña**, ruteando por `?mode=` y procesando el `oobCode` con el SDK cliente, coherente con el design system (violet oklch 285°, claro/auto/oscuro), reusando el molde visual de `verify-email`.

**Alcance Nivel 1 (este SPEC):**

1. La **landing** `/auth/action` completa (ruta + state machines + UI) — F1–F7.
2. El **custom action URL** en Console apuntando a la landing — F8.
3. La **personalización en COPY** (texto + remitente, en español) de las plantillas de email de Console — F9. **Sin HTML diseñado.**

**Fuera de scope (Nivel 2, SPEC futuro):** emisor propio (Resend/SendGrid vía CF), templates HTML diseñados, y cualquier cambio a las llamadas `sendEmailVerification` / `sendPasswordResetEmail` del cliente. Esas se quedan **exactamente como están** — Firebase sigue siendo el emisor, ahora con el copy español de F9.

## Contexto / punto de partida (verificado en código esta sesión)

- **No existe ruta `/auth/action`** ni ninguna `/auth/*`. Router en `src/app/router.tsx:21-51`: rutas públicas (siblings, fuera del `Layout` autenticado) = `/login`, `/verify-email`, `/solicitar-acceso`, `/capture`. La ruta nueva va al mismo nivel.
- **Cero procesamiento de `oobCode` cliente-side hoy.** `applyActionCode`, `verifyPasswordResetCode`, `confirmPasswordReset`, `checkActionCode` **no se usan en ningún lado**. Las únicas action-code APIs en uso son `sendEmailVerification` (`useAuth.ts:108`, post-signup) y `sendPasswordResetEmail` (`useAuth.ts:116`, desde /login), ambas **sin `actionCodeSettings`** → Firebase usa su handler genérico.
- **`firebase.json`** tiene el rewrite SPA `** → /index.html` → `/auth/action` lo sirve React Router **sin tocar config de hosting**.
- **La app NO permite cambiar email** (cero `updateEmail`/`verifyBeforeUpdateEmail`; Settings sin email editable) → el `mode=recoverEmail` **no necesita flujo propio**: fallback.
- **Molde visual (reusar `verify-email`):**
  - Page wrapper (idéntico en `src/app/login/page.tsx` y `src/app/verify-email/page.tsx`): `relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-6 py-12` + gradiente radial violet (`radial-gradient(ellipse 55% 42% at 50% 8%, color-mix(in oklch, var(--primary) 45%, transparent) 0%, transparent 65%)`) + branding (`favicon.svg` `h-20 w-20 md:h-24 md:w-24` + wordmark `text-3xl md:text-4xl font-extrabold tracking-tight`).
  - Card: `w-full max-w-md rounded-2xl border border-border-strong bg-popover p-6 shadow-modal backdrop-blur-md md:p-8`.
  - Estado centrado (`verify-email/page.tsx`): icon badge (`rounded-full bg-amber-500/15 p-3` + icono `size-6`) + `h2 text-xl font-semibold` + texto `text-sm text-muted-foreground` + `Button variant=default size=lg className="w-full"`. **Es el molde de ok/error/loading.**
  - Inputs raw (no shadcn — `ui/` solo tiene `button`, `alert-dialog`, `confirm-dialog`): `rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring/40 aria-invalid:border-destructive`.
- **Validación de password a reusar** (`SignUpForm.tsx:34-46`): **mínimo 8 caracteres** + **confirmación que coincide** (la validación cliente solo chequea `length < 8`; el copy menciona "con al menos un número" pero no se enforce client-side — replicar la regla **tal cual** para consistencia, no inventar una más estricta).
- **Copy de errores** centralizado en `src/lib/authErrors.ts` (`mapAuthError`). `auth/weak-password` ya mapeado.

## Decisiones cerradas (con Sebastián, esta sesión)

| #      | Decisión                                                            | Detalle                                                                                                                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | **Una sola página `/auth/action`, dispatch por `mode`**             | No dos páginas. La page lee `mode`/`oobCode` de `useSearchParams` y rutea a verify / reset / fallback. El form de pedir reset (en /login) y la página verify-email **propia** (`/verify-email`, post-signup) **NO se tocan** — son otra superficie.                                                      |
| **D2** | **CTA self-contained → `/login`, sin `continueUrl`**                | No se tocan las llamadas `send*` ni se agrega `actionCodeSettings`. Tras ok/error el CTA va a `/login`. Más simple y cross-device-safe; un "volver a donde estabas" pediría pasar `continueUrl` y es scope extra innecesario.                                                                            |
| **D3** | **verifyEmail siempre termina en "Iniciar sesión"** (no auto-login) | El click llega casi siempre **cross-device** y sin sesión en este browser. No intentamos refrescar token ni auto-entrar. Si el usuario igual tuviera sesión acá, `/login` lo rebota adentro. Evita complejidad por un caso marginal.                                                                     |
| **D4** | **`recoverEmail` = fallback puro**                                  | No hay cambio de email en la app → Firebase nunca lo emite. Cae al estado `fallback` genérico junto con modes desconocidos / `oobCode` ausente.                                                                                                                                                          |
| **D5** | **Ruta lazy-loaded** (como `/admin`)                                | `/auth/action` solo se golpea desde un link de email, nunca desde nav in-app → chunk aparte, fuera del bundle principal.                                                                                                                                                                                 |
| **D6** | **Nivel 1 sin emails propios; Nivel 2 (provider) es SPEC aparte**   | Sebastián deja listo ahora todo lo que **no depende de un dominio**. Los emails diseñados via provider migran cuando tenga dominio propio (Namecheap). La landing (F1–F7) + el action URL (F8) son **base reusable**: Nivel 2 no los toca. El copy español de F9 se reusa como base del HTML de Nivel 2. |
| **D7** | **F9 = SOLO copy + remitente, sin HTML**                            | Personalizar asunto/cuerpo/nombre-del-remitente de las plantillas de Console en español branded **en texto**. Nada de HTML diseñado (eso es Nivel 2). Manual, agrupado con F8 en una sola entrada a Console al final. Sebastián lo hace con guía del asesor.                                             |

---

## Sub-features

### Frente A — Landing `/auth/action` (código)

#### F1 — Ruta pública lazy `/auth/action`

- **Qué:** agregar `{ path: '/auth/action', lazy: async () => ({ Component: (await import('@/app/auth/action/page')).default }) }` como **sibling** de `/login` (fuera del `Layout` autenticado), molde del lazy de `/admin` (`router.tsx:40-43`).
- **Criterio de done:** navegar a `/auth/action?...` monta la page sin chrome de app ni auth-gate; el chunk solo carga al visitar la ruta.
- **Archivos:** `src/app/router.tsx`.

#### F2 — Page shell + dispatch por `mode`

- **Qué:** `src/app/auth/action/page.tsx`. Owns el **page wrapper** (wrapper + gradiente + branding, copiados de `verify-email/page.tsx`). Lee `mode` y `oobCode` con `useSearchParams`. Dispatch:
  - `verifyEmail` → `<VerifyEmailAction oobCode={...} />`
  - `resetPassword` → `<ResetPasswordAction oobCode={...} />`
  - cualquier otro (`recoverEmail`, `signIn`, ausente) **o `oobCode` faltante** → `<ActionStatus variant="error" .../>` con copy "Enlace inválido o no soportado" + CTA → /login.
- **Criterio de done:** las 3 ramas renderizan dentro del molde de page; sin `oobCode` cae al fallback sin crashear.
- **Archivos:** **nuevo** `src/app/auth/action/page.tsx`.

#### F3 — `ActionStatus` (componente de estado compartido)

- **Qué:** `src/components/auth/ActionStatus.tsx` — presentacional. Props: `{ variant: 'loading' | 'success' | 'error', title, description?, icon?, action? }`. Reusa el molde card de `verify-email`: card + icon badge (verde para success, amber/destructive para error, neutro/animado para loading) + `h2` + texto + `<Button>` opcional (CTA). **Skeleton/calm loading, nunca spinner** (gotcha universal). Un solo molde para los 3 estados visuales de F4/F5.
- **Criterio de done:** los 3 variants renderizan consistentes con el design system; CTA opcional navega.
- **Archivos:** **nuevo** `src/components/auth/ActionStatus.tsx`.

#### F4 — `VerifyEmailAction` (flujo verify + state machine)

- **Qué:** `src/components/auth/VerifyEmailAction.tsx`. En mount llama `applyEmailVerification(oobCode)` (F6). Máquina:

  ```
  verifying ──ok────▶ success  (badge ✓ verde · "Email verificado" · "Ya podés iniciar sesión" · botón → /login)
      └─────error────▶ error    (badge alerta · mapActionError(code) · botón → /login)
  ```

  - Llamada **una sola vez** (guard contra doble-invocación en StrictMode dev: ref o flag — `applyActionCode` es single-use; una segunda corrida daría `invalid-action-code` espurio).

- **Criterio de done:** oobCode válido → success; expirado → "El enlace expiró"; inválido/ya usado → "El enlace es inválido o ya fue usado"; deshabilitado → su copy. Loading no es spinner.
- **Archivos:** **nuevo** `src/components/auth/VerifyEmailAction.tsx`.

#### F5 — `ResetPasswordAction` (flujo reset + form + state machine)

- **Qué:** `src/components/auth/ResetPasswordAction.tsx`. Máquina:

  ```
  verifying-code ──ok──▶ form ──submit──▶ submitting ──ok──▶ success ("Contraseña actualizada" · botón → /login)
        │                  │                                    └──error──▶ error (botón → /login)
        └──error──▶ error  └─ validación cliente: ≥8 chars + confirmación coincide (regla de SignUpForm.tsx:34-46)
  ```

  1. Mount → `verifyResetCode(oobCode)` (F6) → valida + obtiene el email (mostrar "Restablecer contraseña de **{email}**" opcional). Error → estado error.
  2. Form (inputs raw, molde `SignUpForm`: password + confirmar, mismos estilos + `aria-invalid`). Validación local **antes** de llamar.
  3. Submit → `confirmReset(oobCode, newPassword)` (F6). Error (incl. `weak-password`, `expired/invalid` si el code venció entre verify y confirm) → estado error con `mapActionError`.
  4. Success → CTA /login.

- **Criterio de done:** golden path resetea y termina en success; validación fallida bloquea sin llamar; errores en verify **y** en confirm mapeados; loading sin spinner; botón submit deshabilitado + label dinámico durante `submitting`.
- **Archivos:** **nuevo** `src/components/auth/ResetPasswordAction.tsx`.

#### F6 — `lib/authActions.ts` (wrappers de las 3 APIs)

- **Qué:** `src/lib/authActions.ts` — lógica fuera del componente (regla "lógica en hooks/lib"), molde de `src/lib/allowlist.ts`. Wrappers finos sobre `auth` (de `@/lib/firebase`):
  - `applyEmailVerification(oobCode: string): Promise<void>` → `applyActionCode(auth, oobCode)`.
  - `verifyResetCode(oobCode: string): Promise<string>` → `verifyPasswordResetCode(auth, oobCode)` (devuelve el email).
  - `confirmReset(oobCode: string, newPassword: string): Promise<void>` → `confirmPasswordReset(auth, oobCode, newPassword)`.
  - No usan `useAuth` (el usuario no está necesariamente logueado; son one-shots desacoplados de la sesión). Errores se propagan crudos (el componente mapea con `mapActionError`).
- **Criterio de done:** tres funciones tipadas, testeables, sin estado.
- **Archivos:** **nuevo** `src/lib/authActions.ts`.

#### F7 — `mapActionError` en `authErrors.ts`

- **Qué:** nueva función exportada en `src/lib/authErrors.ts` (single source of truth del copy de auth). Mapeo de los códigos action-code a español:
  - `auth/expired-action-code` → "El enlace expiró. Pedí uno nuevo."
  - `auth/user-disabled` → "Esta cuenta está deshabilitada."
  - `auth/weak-password` → "Mínimo 8 caracteres." _(alineado a la regla del cliente ≥8, no al copy "con un número" que no se enforce)._
  - `auth/network-request-failed` → "Hubo un problema de conexión. Reintentá." _(ajuste aprobado: el enlace está bien, falló la red — no mandar a "pedí uno nuevo")._
  - `auth/too-many-requests` → reusa el string existente de `mapAuthError`.
  - `auth/invalid-action-code` + `auth/user-not-found` + default → "El enlace no es válido. Pedí uno nuevo." _(invalid colapsa "inválido o ya usado", que Firebase no distingue; user-not-found colapsa al default por anti-enumeración, paranoia F50-53)._
- **Criterio de done:** todos los códigos del set mapeados; `tsc`/ESLint verdes.
- **Archivos:** `src/lib/authErrors.ts`. _(No tocar `mapAuthError`.)_

### Frente B — Configuración Console (manual / checklist, al final)

#### F8 — Custom action URL → `https://secondmind.web.app/auth/action` ⛔ PENDIENTE SOPORTE

- **Estado:** **bloqueado** — la Console rechaza el guardado con `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` (ver header). Escalado a soporte de Firebase. Sin código pendiente: la landing ya procesa el callbackUri cuando el soporte lo habilite.
- **Qué:** en Firebase Console → Authentication → Templates → "Customize action URL" (aplica **global** a todos los templates) → `https://secondmind.web.app/auth/action`.
- **Orden:** **penúltimo paso**, **después** de desplegar la landing a prod y testearla con un `oobCode` real del Admin SDK (ver Verificación). Antes de este cambio, los emails de prod siguen yendo al handler genérico — la landing nueva queda lista pero no recibe tráfico hasta el switch.
- **Criterio de done:** un email de prod (verify o reset) lleva un link a `secondmind.web.app/auth/action?mode=...&oobCode=...` y la landing lo procesa.
- **Archivos:** ninguno (Console). Agrupado con F9 en una sola entrada a Console.

#### F9 — Personalizar plantillas de email en Console (SOLO copy + remitente) ⛔ PENDIENTE SOPORTE

- **Estado:** **bloqueado** — mismo `EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED` que F8. Escalado a soporte de Firebase.
- **Qué:** en Console → Authentication → Templates, para **Verificación de email** y **Restablecimiento de contraseña**: asunto + cuerpo + nombre del remitente → **español, branded en COPY**. **SOLO texto y remitente, NADA de HTML diseñado** (eso es Nivel 2). Sebastián lo hace con guía del asesor.
- **Criterio de done:** los dos emails llegan en español con remitente branded; el resto (emisor Firebase, mecánica del link) intacto.
- **Archivos:** ninguno (Console). Misma entrada a Console que F8.

---

## Orden de implementación

1. **F7** (`mapActionError`) + **F6** (`lib/authActions.ts`) — las bases sin UI.
2. **F3** (`ActionStatus`) — el molde visual compartido.
3. **F4** (verify) + **F5** (reset) — las dos máquinas, sobre F3/F6/F7.
4. **F2** (page shell + dispatch) + **F1** (ruta lazy) — cablear todo.
5. Lint/build verdes + **E2E local con oobCodes del Admin SDK** (ver Verificación).
6. Deploy hosting (+ Tauri/Android **opcionales** — la ruta vive en el dist compartido; no se toca `src-tauri/` ni `android/`).
7. **Test en prod** de la landing con un oobCode real del Admin SDK contra la URL de prod.
8. **F8 + F9** en Console (una sola entrada): custom action URL → personalización de copy.
9. Smoke prod final: disparar un reset/verify real (cuenta descartable) → confirmar que el email lleva a la landing branded y el flujo cierra.

## Verificación

**El detalle espinoso:** el custom action URL (F8) es **global a prod**, así que Firebase no puede mandar un link a localhost. Plan de QA **sin tocar la cuenta real de Sebastián** (`gYPP7…`):

- Generar `oobCode`s reales con el **Admin SDK** (`generatePasswordResetLink` / `generateEmailVerificationLink`) contra una **cuenta descartable** (NO la de Sebastián — el reset **cambia la contraseña**), extraer el `oobCode` del link devuelto y visitar `http://localhost:5173/auth/action?mode=...&oobCode=...`. Los callbacks (`confirmPasswordReset`, etc.) pegan al backend de Firebase con la apiKey del SDK, así que el code es **válido independiente del origin** — funciona en localhost antes de tocar Console.
- La cuenta descartable **no necesita estar allowlisted** (los flujos action-code corren pre-login, antes de `enforceAccessGate`).
- **Casos a cubrir:** verify ok · verify link expirado · verify link ya usado (segunda visita) · reset golden path · reset con validación cliente fallida (corta <8 / no coinciden) · reset con code inválido en verify-step · fallback (mode desconocido / sin oobCode). Viewports **375 / 768 / 1280**, theme **claro / oscuro / auto**.
- **Build/lint:** `npm run build` + `npm run lint` completo + `npm test` verdes (lint completo, no solo el hook --fix).
- **Test en prod (paso 7):** mismo truco de Admin SDK pero apuntando a `https://secondmind.web.app/auth/action` **antes** de cambiar el action URL de Console (la landing ya está desplegada; el link se arma a mano).
- **Smoke prod final (paso 9, post-F8/F9):** disparar un reset real desde /login a la cuenta descartable → confirmar email español branded + link a la landing + flujo completo. La cuenta de Sebastián **no se usa para reset**.
- **Limpieza (cierre):** **borrar la cuenta descartable de Auth** tras el smoke (queda con la contraseña cambiada por el test de reset; inofensiva porque no está allowlisted, pero prolijo — mismo criterio que los throwaways de SPEC-52/53).

## Riesgos / cuestiones abiertas

- **StrictMode doble-mount (dev):** `applyActionCode`/`confirmPasswordReset` son single-use; sin guard, el doble-invoke de StrictMode daría un `invalid-action-code` espurio en F4. Guard con ref/flag (no es bug de prod, pero ensucia el QA local).
- **Ventana verify→confirm en reset:** el `oobCode` puede expirar entre `verifyResetCode` (mount) y `confirmReset` (submit) si el usuario tarda. F5 debe mapear el error también en el confirm-step, no solo en verify.
- **Gotchas a escalar al cerrar:** (1) procesar action-codes cliente-side (`applyActionCode`/`verifyPasswordResetCode`/`confirmPasswordReset` sobre `auth`; single-use + StrictMode guard; oobCode válido cross-origin) → `Spec/gotchas/` dominio auth. (2) QA de action-codes vía Admin SDK `generate*Link` contra cuenta descartable sin enviar email — patrón reusable. (3) custom action URL es global a prod → no testeable contra localhost vía email, solo vía oobCode manual.

## Nivel 2 — SPEC futuro (anotar en ESTADO-ACTUAL, NO implementar acá)

**Emails propios diseñados vía provider (Resend/SendGrid) + 2 CFs**, prerequisito **dominio propio verificado**.

- **Qué cambia vs Nivel 1:** Nivel 2 toca SOLO el **emisor** (Firebase → CF + provider) y el **contenido** (texto → HTML diseñado). La landing `/auth/action` + el action URL (F8) son **base reusable que Nivel 2 NO toca**. El copy español de F9 se reusa como **base del HTML**.
- **Las 2 CFs:** `sendVerificationEmail` (autenticada) / `sendResetEmail` (pública con **rate-limit por IP** + **anti-enumeración** — espejo del `user-not-found` silenciado actual).
- **El swap toca solo 2 callers:** `sendEmailVerification` en `useAuth.signUpWithEmail` y `sendPasswordResetEmail` en /login (la llamada de `resetPassword`). Reemplazo directo por las CFs cuando llegue — **NO** envolverlos en un wrapper ahora (YAGNI: son 2 lugares puntuales).
- **Prerequisito duro:** dominio propio verificado (SPF/DKIM) para el remitente. Sin dominio, el sandbox del provider solo manda al propio correo del dueño de la cuenta → no se puede enviar a usuarios reales. Por eso Nivel 2 espera al dominio de Namecheap.

## Checklist

- [x] F1 — ruta pública lazy `/auth/action`
- [x] F2 — page shell (wrapper + branding) + dispatch por `mode`
- [x] F3 — `ActionStatus` (loading/success/error compartido)
- [x] F4 — `VerifyEmailAction` (state machine verify + guard StrictMode)
- [x] F5 — `ResetPasswordAction` (verify-code → form → confirm + validación reusada)
- [x] F6 — `lib/authActions.ts` (3 wrappers)
- [x] F7 — `mapActionError` en `authErrors.ts`
- [x] **Fix PWA** `navigateFallbackDenylist: /^\/auth\/action/` (agregado en implementación tras el test de prod)
- [x] E2E local (oobCodes Admin SDK, cuenta descartable) + lint/build/test **252/252** verdes
- [x] Deploy hosting `0.4.4` + test prod real (verify success + reset golden path + G3 con oobCode del Admin SDK)
- [ ] F8 — custom action URL → `secondmind.web.app/auth/action` (Console) — ⛔ **pendiente soporte Firebase**
- [ ] F9 — copy español + remitente en plantillas verify + reset (Console) — ⛔ **pendiente soporte Firebase**
- [ ] Smoke prod final email→landing — ⛔ **pendiente post-soporte** (depende del callbackUri de F8)
- [x] Cierre: merge + registro + gotchas escalados (PWA denylist + action-code) + Nivel 2 en ESTADO-ACTUAL + patrón QA en CLAUDE.md
