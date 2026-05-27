# SPEC — SecondMind · Feature 47: Login Redesign + Email/Password Auth + Capacity Gate

> **Alcance:** Redesign Linear-style del LoginPage + nuevo provider email/password (sign-up, sign-in, reset, verification banner) + gate "Beta llena" basado en config Firestore.
> **Dependencias:** Ninguna — extiende `useAuth.ts` y `LoginPage` actuales sin breaking changes en el flow Google.
> **Estimado:** 10-12h de dev (1-2 sesiones).
> **Stack relevante:** Firebase Auth (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `sendPasswordResetEmail`, `sendEmailVerification`), `@base-ui/react/tabs` (consistente con F45 Select + F46 Dialog del mismo namespace), Cloud Functions v1 Auth triggers (`onCreate`/`onDelete`) que mantienen un counter en Firestore (`config/app.userCount`). **Email Enumeration Protection** habilitada en Firebase Console → `fetchSignInMethodsForEmail` queda fuera del stack.

---

## Objetivo

Al terminar esta fase el usuario puede crear cuenta o iniciar sesión con email + contraseña (además de Google), recuperar contraseña vía email reset, ve un banner persistente en la app recordándole verificar su email tras sign-up (no bloqueante), recibe mensajes claros cuando intenta usar Google en una cuenta email/password (o viceversa), y queda bloqueado del registro cuando la beta alcanza el límite configurado en Firestore. La pantalla `/login` queda visualmente alineada con el design system (Linear-style card + radial glow indigo + tipografía hero) en lugar del minimal actual de un solo botón.

---

## Features

### F1: LoginPage shell redesign + sign-in email/password funcional

**Qué:** Refactor completo de `src/app/login/page.tsx` al diseño Linear-style del design system: hero copy fuera del card (`text-4xl font-extrabold tracking-[-0.01em]`), card centrado nivel 3 (`bg-[oklch(0.14_0.008_270)]` + `backdrop-blur-md` + `border-strong` + `rounded-lg`), radial glow indigo desde top usando `--primary-glow`, primer tab "Iniciar sesión" con form email + password funcional, errores mapeados, separador "o continuá con", botón Google secundario. Responsive mobile-first. Light + dark mode.

**Criterio de done:**

- [ ] Pantalla `/login` renderiza hero "SecondMind / Tu segundo cerebro digital" en `text-4xl font-extrabold tracking-[-0.01em]` arriba del card en desktop, compactado en mobile (`text-3xl`).
- [ ] Card central con elevación nivel 3 del design system: `bg-[oklch(0.14_0.008_270)]`, `backdrop-blur-md`, `border border-[var(--border-strong)]`, `rounded-lg`, padding `p-8` desktop / `p-6` mobile.
- [ ] Radial gradient indigo (`oklch(0.62 0.18 275 / 0.15)`) desde top centrado como capa absolute inset-0 detrás del contenido — sutil, no opaco, sin saturación.
- [ ] Tabs `[Iniciar sesión]` activo / `Crear cuenta` enabled (F1 deja el tab visible pero sin form interno aún — F2 lo completa).
- [ ] Form sign-in: input email (`type="email"` required), input password (`type="password"` required, `minLength=6` por compat Firebase), botón primary "Iniciar sesión" full-width.
- [ ] Submit llama `useAuth.signInWithEmail(email, password)` que delega a `signInWithEmailAndPassword(auth, email, password)` — sin branching multi-plataforma (email/pass funciona idéntico en web/Tauri/Capacitor).
- [ ] Errores Firebase mapeados a español vía `mapAuthError(code)`: invalid-email, wrong-password, user-not-found, user-disabled, too-many-requests → mensaje visible debajo del form en `text-destructive text-sm` con role="alert".
- [ ] Separador `─── o continuá con ───` debajo del form (texto `text-xs text-foreground-muted uppercase tracking-wider`).
- [ ] Botón Google secondary (`bg-muted` + border-border) abajo del separador con icono Google + texto "Continuar con Google".
- [ ] Loading state durante submit: botón muestra spinner inline + disabled + texto cambia a "Iniciando sesión..." (sin layout shift).
- [ ] Responsive verificado: 375px, 768px, 1280px sin overflow horizontal.
- [ ] Dark mode default, light mode probado vía toggle `prefers-color-scheme` o tema manual del proyecto.
- [ ] Focus rings indigo (`ring-2 ring-ring`) en todos los inputs y botones.
- [ ] `Enter` en cualquier input submite el form.
- [ ] `aria-label` en botón Google ("Continuar con Google"), `aria-invalid` + `aria-describedby` en inputs con error.

**Archivos a crear/modificar:**

- `src/app/login/page.tsx` — refactor completo. De 41 líneas a ~80-100 con hero + LoginCard.
- `src/components/auth/LoginCard.tsx` — **nuevo**. Card central nivel 3 que recibe `<Tabs>` como children; encapsula glow + responsive.
- `src/components/auth/SignInForm.tsx` — **nuevo**. Form email + password con submit handler + errores inline.
- `src/components/auth/GoogleSignInButton.tsx` — **nuevo**. Botón Google secondary (extraído del LoginPage actual + restyled per design system).
- `src/lib/authErrors.ts` — **nuevo**. Pure function `mapAuthError(code: string): string` con strings en español (tabla canónica en sección "Definiciones técnicas").
- `src/hooks/useAuth.ts` — extender con `signInWithEmail(email: string, password: string): Promise<void>`.

**Notas de implementación:**

- Usar `@base-ui/react/tabs` (consistente con F45 Select y F46 Dialog del mismo namespace base-ui). NO instalar shadcn tabs — el repo ya tiene precedente firme con base-ui para primitivas headless.
- Inputs custom siguiendo el design system § Inputs pattern (no shadcn input — no instalado). Label arriba del input (`text-sm font-medium text-foreground` + `mb-1.5`), no placeholder-only.
- Radial glow: `bg-[radial-gradient(ellipse_at_top,_oklch(0.62_0.18_275_/_0.15),_transparent_50%)]` en un layer `absolute inset-0 -z-10 pointer-events-none` dentro del wrapper de la página.
- `useAuth.signInWithEmail` NO usa branching `isCapacitor/isTauri` — `signInWithEmailAndPassword` del Firebase SDK web funciona idéntico en los 3 frentes (WebView puro, sin OAuth externo).
- Skill `frontend-design` disponible en plan mode si la dirección visual necesita variantes antes de codear.

---

### F2: Sign-up tab + form email/password + auto-send verification

**Qué:** Completar el tab "Crear cuenta" del LoginCard. Form sign-up con email + password + confirm password, validación client-side (email regex, password min 8 chars, password === confirm), submit → `createUserWithEmailAndPassword` → `sendEmailVerification(user)` automático post-success, navega a `/`. Errores email-already-in-use mapeados con CTA "Iniciá sesión" que cambia al tab Sign-in.

**Criterio de done:**

- [ ] Tab "Crear cuenta" activable, switch interno sin reload (animación 200ms vía `useMountedTransition` si aplica).
- [ ] Form sign-up: input email, input password, input confirm password — los 3 required.
- [ ] Validación client-side ANTES de submit: email pattern HTML5 + `password.length >= 8` + `password === confirmPassword`. Errores inline debajo del input correspondiente.
- [ ] Submit llama `useAuth.signUpWithEmail(email, password)` que internamente: (1) `createUserWithEmailAndPassword`, (2) `sendEmailVerification(user)`, (3) navega a `/`.
- [ ] Errores Firebase mapeados: `email-already-in-use` (mensaje genérico unificado — Email Enumeration Protection impide identificar provider, ver F5); `weak-password` (mensaje alineado con política Firebase Console: 8 chars + numérico); `invalid-email`.
- [ ] Si `account-exists-with-different-credential` (Google existente con mismo email) — mensaje delegado a F5.
- [ ] Tras sign-up exitoso: usuario navegado a `/` con sesión activa (auto-login Firebase post-create) y `emailVerified === false` (banner F4 lo recordará).
- [ ] Email de verificación enviado automáticamente (no requiere acción extra del usuario).

**Archivos a crear/modificar:**

- `src/components/auth/SignUpForm.tsx` — **nuevo**. Form con 3 inputs + validación + submit + error handling.
- `src/hooks/useAuth.ts` — extender con `signUpWithEmail(email: string, password: string): Promise<void>`.
- `src/components/auth/LoginCard.tsx` — sumar lógica de switch tab (sign-in ↔ sign-up). Sin handoff `prefillEmail` — F5 no requiere auto-switch porque EEP impide saber a qué tab redirigir.

**Notas de implementación:**

- Password strength meter visual: opcional, dejar fuera del MVP.
- **Política Firebase Console (server-side):** "Exigir aplicación" habilitada + mínimo 8 caracteres + requerir caracteres numéricos. El client valida `length >= 8` (alineado); Firebase rechaza con `auth/weak-password` si falta numérico o si es <8 chars. El mensaje UX de `weak-password` refleja la política completa: "Mínimo 8 caracteres con al menos un número." NO duplicar la regla "requiere numérico" en validación client-side (defense in depth server-side suficiente — el client-side serviría solo para feedback inmediato, trade-off aceptable vs duplicar reglas).
- `sendEmailVerification` puede recibir `actionCodeSettings` con `url` callback. Por MVP usar default — Firebase Console permite custom email templates si después se quiere branding.
- Validación reactive con `useState` para errors locales, sin librería externa (Zod overkill para 3 campos).

---

### F3: Reset password flow

**Qué:** Link "¿Olvidaste tu contraseña?" debajo del input password en el form sign-in. Click cambia el cuerpo del card a un panel reset (anim transición) con input email + botón "Enviar enlace". `sendPasswordResetEmail` siempre muestra mensaje genérico al usuario (no expone si el email existe — protección enumeration). Link "← Volver al login" restaura tabs.

**Criterio de done:**

- [ ] Link "¿Olvidaste tu contraseña?" visible en SignInForm (`text-sm text-primary hover:underline`) a la derecha del label password.
- [ ] Click cambia el cuerpo del card a un panel reset (transición 200ms con `useMountedTransition` — paridad con F33/F35 conventions).
- [ ] Panel reset: input email + botón "Enviar enlace" + link "← Volver al login".
- [ ] Submit llama `useAuth.resetPassword(email)` → `sendPasswordResetEmail(auth, email)`.
- [ ] Tras submit (success O user-not-found ambos): mensaje genérico "Si la cuenta existe, recibirás un enlace en tu email" + ofrecer "← Volver al login".
- [ ] Errores other-than-user-not-found mostrados: `invalid-email`, `too-many-requests`, `network-request-failed`.
- [ ] Link "Volver al login" restaura el card al estado tabs (sign-in/sign-up activos).

**Archivos a crear/modificar:**

- `src/components/auth/ResetPasswordForm.tsx` — **nuevo**. Panel inline con input + submit + estado confirmación.
- `src/components/auth/SignInForm.tsx` — sumar link "¿Olvidaste tu contraseña?" + prop `onForgotPassword` que dispara el switch.
- `src/components/auth/LoginCard.tsx` — sumar estado interno `mode: 'tabs' | 'reset'` con animación de switch.
- `src/hooks/useAuth.ts` — extender con `resetPassword(email: string): Promise<void>`.

**Notas de implementación:**

- Tratar `user-not-found` igual que success previene enumeration attacks (un atacante no puede listar emails registrados probando reset). Práctica estándar Firebase + OWASP.
- La transición tabs ↔ reset usa el patrón `useMountedTransition` del repo (post-F33/F35 conventions). Plan mode confirma duración y direction.

---

### F4: Email verification banner post-login (no gate)

**Qué:** Tras login (sin importar provider), si `user.emailVerified === false` montar banner persistente en `src/app/layout.tsx`: "Verificá tu email para asegurar tu cuenta · [Reenviar enlace]". Botón reenviar llama `sendEmailVerification(user)` con cooldown visible 60s. Banner auto-oculta cuando `emailVerified` cambia a true (vía `user.reload()` al focus de window o polling 30s).

**Criterio de done:**

- [ ] Banner renderiza en `src/app/layout.tsx` cuando `user && !user.emailVerified` (Google users tienen `emailVerified: true` automático — solo afecta email/password).
- [ ] Visual: `bg-warning/10 border-warning/30 border` + icono `Mail` (Lucide) + texto "Verificá tu email para asegurar tu cuenta" + botón "Reenviar enlace" + botón "×" para cerrar.
- [ ] Click "Reenviar" llama `sendEmailVerification(user)` y muestra "Enviado · 60s" disabled durante cooldown.
- [ ] Cooldown se persiste en `sessionStorage` (no localStorage — reset al cerrar app es aceptable).
- [ ] Banner cerrado con "×" se persiste en `sessionStorage` para no aparecer 2 veces en la misma sesión (vuelve al siguiente login).
- [ ] `user.reload()` cada 30s mientras banner visible — actualiza `emailVerified` sin requerir logout/login.
- [ ] Cuando `emailVerified === true` post-reload: banner desaparece con fade-out 200ms.
- [ ] Banner NO bloquea ninguna feature del app — todas las rutas accesibles, todos los handlers operativos.

**Archivos a crear/modificar:**

- `src/components/auth/EmailVerificationBanner.tsx` — **nuevo**. Banner con icono + mensaje + reenvío + cooldown + dismiss.
- `src/hooks/useAuth.ts` — extender con `resendVerification(): Promise<void>`.
- `src/app/layout.tsx` — montar `<EmailVerificationBanner />` arriba del main content cuando user existe y `!emailVerified`.

**Notas de implementación:**

- `user.reload()` refresca el objeto User pero NO dispara `onAuthStateChanged`. Necesitará forzar re-render via local state en `useAuth` (`setUser(auth.currentUser)`) o vía hook propio en el banner.
- Alternativa al polling 30s global: polling solo while banner visible, como `useEffect` con cleanup en `EmailVerificationBanner`. Plan mode decide.
- `actionCodeSettings.url` con `/verify-email` route handler que muestre "✅ Email verificado" queda fuera del MVP — el link default de Firebase ya muestra confirmación en su dominio.

---

### F5: Cross-provider conflict — mensaje genérico unificado

**Qué:** Cuando un usuario intenta sign-up email/password con un email ya registrado (cualquier provider), o Google sign-in choca con cuenta email/password preexistente, Firebase devuelve `auth/email-already-in-use` o `auth/account-exists-with-different-credential`. **Email Enumeration Protection está habilitada en Firebase Console** — esto bloquea `fetchSignInMethodsForEmail` y altera los errores para no revelar qué provider tiene la cuenta. Por ende, el mensaje queda **genérico**: "Ya existe una cuenta con este email. Probá iniciar sesión o usar Google." Sin auto-switch, sin prefill, sin pre-check. El usuario decide manualmente el siguiente paso. NO se implementa linking automático (diferido a fase 2).

**Criterio de done:**

- [ ] Sign-up flow: error `email-already-in-use` post-create-attempt → mensaje genérico "Ya existe una cuenta con este email. Probá iniciar sesión o usar Google." debajo del form.
- [ ] Google sign-in flow: error `account-exists-with-different-credential` post-popup → mismo mensaje genérico, mostrado debajo del botón Google.
- [ ] Error mapping centralizado en `src/lib/authErrors.ts` con los dos códigos apuntando al mismo string unificado.
- [ ] NO se llama `fetchSignInMethodsForEmail` en ningún flow del SPEC.
- [ ] NO hay auto-switch de tab tras error — el usuario manualmente decide entre el tab Sign-in o el botón Google.
- [ ] Sin prop `prefillEmail` cruzando componentes para handoff.

**Archivos a crear/modificar:**

- `src/lib/authErrors.ts` — extender mapping con los dos códigos apuntando al mismo string genérico.
- `src/hooks/useAuth.ts` — `signUpWithEmail` captura `email-already-in-use` post-attempt; `signIn` (Google) captura `account-exists-with-different-credential` post-popup. Ambos delegan al mapper. SIN pre-check `fetchSignInMethodsForEmail`.
- `src/components/auth/SignInForm.tsx` + `SignUpForm.tsx` — handlers muestran el mensaje genérico mapeado debajo del form/botón.

**Notas de implementación:**

- **Email Enumeration Protection** (Firebase Auth setting): habilita defense contra enumeration attacks alterando los códigos de error para no revelar si un email está registrado. `fetchSignInMethodsForEmail` retorna array vacío con EEP activa → no sirve para diferenciar provider. Es un trade-off de seguridad: mensajes UX menos precisos a cambio de evitar enumeration. Se respeta — desactivarla sería downgrade de seguridad por marginal UX gain.
- Google login fail con `account-exists-with-different-credential` PUEDE incluir `customData.email` y `credential` recuperable vía `GoogleAuthProvider.credentialFromError(error)` aún con EEP activa — guardar el `credential` para futuro linking (fase 2). Por ahora se descarta.
- F5 se simplificó drásticamente vs propuesta inicial (que asumía `fetchSignInMethodsForEmail` operativo). Sin pre-check round-trip, sin auto-switch — el flow es 100% reactivo post-error con mensaje único.

---

### F6: User capacity limit gate ("Beta llena")

**Qué:** Antes de permitir sign-up nuevo, verificar que la cantidad de cuentas registradas no exceda el límite configurable. Doc Firestore `config/app` con `{ maxUsers, signupsEnabled, userCount }` — `userCount` lo mantienen triggers Auth `onCreate` (increment) y `onDelete` (decrement), evitando `auth.listUsers()` paginado en cada check. Cliente lee `config/app` directo de Firestore (rules permiten read público) — sin CF callable intermedia. Hook `useSignupCapacity()` se ejecuta lazy al click en tab "Crear cuenta". UI muestra estado bloqueado con mensaje "Beta llena · {userCount}/{maxUsers} cuentas registradas".

**Por qué triggers + counter (vs `auth.listUsers()` paginado):** la cuota Firebase Auth `100 reads/hour/IP` es rate limit no cap total — F6 sigue necesario como UX gate. Pero `listUsers()` es O(n) per call y costoso si users crece a >1000. Counter mantenido es O(1) read + O(1) increment per signup.

**Criterio de done:**

- [ ] Doc Firestore `config/app` creado con `{ maxUsers: 50, signupsEnabled: true, userCount: <real-count-seed> }`. `maxUsers` y `signupsEnabled` editables desde Firebase Console; `userCount` mantenido por triggers (NO editar manual post-seed).
- [ ] `firestore.rules` permite read público de `config/{configId}` (incluso sin auth — el LoginPage no tiene user al verificar capacidad), write deny client-side (solo Admin SDK / triggers).
- [ ] CF trigger v1 `onUserCreated` (`functions.auth.user().onCreate`) en `src/functions/src/userCountTriggers.ts` → `FieldValue.increment(1)` sobre `config/app.userCount`.
- [ ] CF trigger v1 `onUserDeleted` (`functions.auth.user().onDelete`) en el mismo archivo → `FieldValue.increment(-1)` sobre `config/app.userCount`.
- [ ] Ambos triggers desplegados en `us-central1` (consistente con resto del proyecto).
- [ ] Hook `useSignupCapacity()` hace `getDoc(doc(db, 'config', 'app'))` (one-shot, no `onSnapshot`) al primer click en tab "Crear cuenta" — NO al mount inicial del LoginPage. Computa local: `canSignUp = userCount < maxUsers && signupsEnabled === true`.
- [ ] Cache del result en `sessionStorage` por 60s (evita refetch en cada click de tab dentro de la misma sesión).
- [ ] Tab "Crear cuenta" muestra:
  - **Loading**: skeleton del form + texto "Verificando disponibilidad...".
  - **`canSignUp === false` y `signupsEnabled === false`**: mensaje "Registro deshabilitado temporalmente" + form disabled.
  - **`canSignUp === false` y `signupsEnabled === true`**: mensaje "Beta llena · {userCount}/{maxUsers} cuentas registradas. Volvé pronto." + form disabled.
  - **`canSignUp === true`**: form normal (F2).
- [ ] El form sign-up nunca submitea si `canSignUp === false` — botón Crear cuenta visualmente disabled + `aria-disabled="true"`.
- [ ] Defense in depth: `useAuth.signUpWithEmail` re-lee `config/app` ANTES de `createUserWithEmailAndPassword` (race window documentada como aceptable).
- [ ] Seed inicial obligatorio: ANTES del deploy de triggers en producción, ejecutar one-shot (script local o función temporal) que inicialice `userCount` con la cantidad real de users existentes en Auth. Sino el contador comienza en 0 y los users pre-F47 no cuentan.

**Archivos a crear/modificar:**

- `src/functions/src/userCountTriggers.ts` — **nuevo**. Exporta `onUserCreated` y `onUserDeleted` (firebase-functions v1 `functions.auth.user().onCreate/onDelete`).
- `src/functions/src/index.ts` — exportar los dos nuevos triggers.
- `firestore.rules` — sumar regla `match /config/{configId}` con `allow read: if true; allow write: if false`.
- Firebase Console manual: crear doc `config/app` con `{ maxUsers: 50, signupsEnabled: true, userCount: <count-actual> }` antes del deploy de triggers.
- `src/hooks/useSignupCapacity.ts` — **nuevo** hook con `useState` + lazy `getDoc` + cache 60s en `sessionStorage`.
- `src/components/auth/SignupCapacityGate.tsx` — **nuevo** wrapper que envuelve `<SignUpForm />` y renderiza estados (loading/blocked/enabled).
- `src/hooks/useAuth.ts` — `signUpWithEmail` re-lee `config/app` antes del create (defense in depth).

**Notas de implementación:**

- **Why v1 triggers (no v2 blocking):** `firebase-functions` v7 sigue soportando v1 namespace para Auth (`functions.auth.user().onCreate/onDelete`). v2 blocking (`beforeUserCreated`) requiere upgrade a Identity Platform (costo $$$). v1 triggers son async (post-create) — race con counter posible pero benigna (ver siguiente punto).
- **Race aceptada**: dos users intentan registrarse cuando hay 1 slot libre. Ambos leen `userCount: 49`, ambos pasan el check, ambos crean cuenta. Trigger `onUserCreated` se dispara 2 veces async → `userCount` queda en 51. Beta excedida por 1 puntualmente. Trade-off explícito para single-user-ish beta. Si se vuelve crítico, mover a `beforeUserCreated` blocking (Identity Platform).
- **Seed inicial obligatorio (riesgo operativo)**: al primer deploy F6, el doc `config/app.userCount` debe inicializarse con `auth.listUsers()` ejecutado UNA VEZ (script local o función `seedUserCount` callable temporal eliminada post-deploy). De lo contrario, comienza en 0 y todos los users pre-F47 no cuentan hasta que se borren y recreen (no va a pasar). Plan mode confirma el método del seed.
- **Trigger dispara siempre, también para Google sign-ups**: counter incluye TODOS los providers, no solo email/password. Consistente con la intención del gate (beta llena = no más cuentas, indistinto del provider).
- `firestore.rules` con read público requiere que NO haya info sensible en `config/app` (`maxUsers`, `signupsEnabled`, `userCount` son no-sensibles — OK).
- Tras deploy: seed manual → `npm run deploy:rules` → `npm run deploy:functions`. Doc `config/app` se crea manual desde Console (no en código — config de runtime).

---

## Orden de implementación

1. **F1 — LoginPage shell + sign-in.** Foundation visual + funcional. Sin esto los demás features no tienen dónde vivir. Mayor delta de líneas (refactor + design system completo).
2. **F2 — Sign-up tab.** Extiende el card de F1 con el segundo tab activo. Depende del shell visual de F1.
3. **F5 — Account linking errors.** Solo extiende `useAuth` y los error handlers de F1+F2. Independiente del visual; puede paralelizar con F3 una vez F2 está listo.
4. **F3 — Reset password.** Necesita SignInForm de F1 (para el link "¿Olvidaste tu contraseña?") + el patrón de switch tabs/reset en LoginCard.
5. **F4 — Email verification banner.** Independiente del LoginPage — vive en Layout. Paralelizable con F3 tras F2 listo (Google users no lo ven; solo email/password genera el caso de `emailVerified: false`).
6. **F6 — Capacity gate.** Depende de F2 (SignUpForm) para envolverlo. Más costoso (CF + rules + hook). Cierra la phase.

**Razón del orden:** maximizar valor entregado por commit. Tras F1+F2 ya hay email/password funcional usable. F3-F5 son polish del flow. F6 es producto-specific (beta gate) y mejor al final cuando el resto está estable + sirve de validación end-to-end del deploy de CF nueva.

---

## Estructura de archivos

```
src/
├── app/
│   ├── login/
│   │   └── page.tsx                            # refactor completo (F1, F2)
│   └── layout.tsx                              # mount EmailVerificationBanner (F4)
├── components/
│   └── auth/                                   # NUEVA carpeta
│       ├── LoginCard.tsx                       # card central + tabs container (F1, F2, F3)
│       ├── SignInForm.tsx                      # form sign-in (F1, F3, F5)
│       ├── SignUpForm.tsx                      # form sign-up (F2, F5)
│       ├── ResetPasswordForm.tsx               # panel reset inline (F3)
│       ├── GoogleSignInButton.tsx              # botón Google secondary (F1)
│       ├── EmailVerificationBanner.tsx         # banner post-login (F4)
│       └── SignupCapacityGate.tsx              # wrapper gate beta (F6)
├── hooks/
│   ├── useAuth.ts                              # extender (F1-F5)
│   └── useSignupCapacity.ts                    # nuevo hook (F6)
├── lib/
│   └── authErrors.ts                           # mapping codes → español (F1, F5)
└── functions/
    └── src/
        ├── userCountTriggers.ts                # CFs v1 onCreate/onDelete (F6)
        └── index.ts                            # exportar los nuevos triggers (F6)

firestore.rules                                 # sumar regla config/{configId} read public (F6)
```

---

## Definiciones técnicas

### Mapping de errores Firebase Auth (`src/lib/authErrors.ts`)

| Firebase code                                   | Mensaje UX (español)                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/invalid-email`                            | "Email inválido."                                                                                                                                 |
| `auth/wrong-password`                           | "Contraseña incorrecta."                                                                                                                          |
| `auth/user-not-found`                           | (sign-in) "No existe una cuenta con ese email." / (reset) genérico                                                                                |
| `auth/user-disabled`                            | "Esta cuenta está deshabilitada."                                                                                                                 |
| `auth/email-already-in-use`                     | "Ya existe una cuenta con este email. Probá iniciar sesión o usar Google." (F5)                                                                   |
| `auth/weak-password`                            | "Mínimo 8 caracteres con al menos un número." (política Firebase Console)                                                                         |
| `auth/too-many-requests`                        | "Demasiados intentos. Probá de nuevo en unos minutos."                                                                                            |
| `auth/network-request-failed`                   | "Sin conexión. Verificá tu internet."                                                                                                             |
| `auth/account-exists-with-different-credential` | "Ya existe una cuenta con este email. Probá iniciar sesión o usar Google." (F5, mismo string que `email-already-in-use` — EEP impide diferenciar) |
| `auth/popup-closed-by-user`                     | (ignorar — usuario cerró popup intencional, no toast)                                                                                             |
| `auth/cancelled-popup-request`                  | (ignorar — popup duplicado)                                                                                                                       |

### Validación client-side del sign-up

- Email: `<input type="email" required />` HTML5 + regex JS de respaldo `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Password: `length >= 8` (más estricto que Firebase default de 6, alineado con expectativas modernas).
- Confirm password: `password === confirmPassword`.
- Errores inline en `text-destructive text-sm` debajo del input correspondiente, con `aria-invalid="true"` + `aria-describedby="<field>-error"`.

### Estructura del doc `config/app` en Firestore

```typescript
interface AppConfig {
  maxUsers: number; // Default 50 al crear el doc, editable desde Console
  signupsEnabled: boolean; // Default true, editable desde Console
  userCount: number; // Mantenido por triggers onUserCreated/onUserDeleted; seed inicial obligatorio al deploy
}
```

Path: `config/app`. Creado manual desde Firebase Console al deploy con seed inicial de `userCount`. NO se sincroniza vía TinyBase (es config global, no per-user).

### Shape derivado en `useSignupCapacity` (cliente)

```typescript
interface SignupCapacity {
  userCount: number;
  maxUsers: number;
  signupsEnabled: boolean;
  canSignUp: boolean; // userCount < maxUsers && signupsEnabled === true
}
```

El hook hace `getDoc(doc(db, 'config', 'app'))` → toma `AppConfig` → computa `canSignUp` localmente. Cache 60s en `sessionStorage`. SIN CF callable intermedia — el cliente lee Firestore directo (rules permiten read público de `config/{configId}`).

---

## Checklist de completado

Al terminar esta fase, TODAS estas condiciones deben ser verdaderas:

- [ ] La app compila sin errores TypeScript ni warnings ESLint.
- [ ] `/login` renderiza el nuevo diseño en dark + light mode, mobile + desktop (375 / 768 / 1280).
- [ ] Usuario puede crear cuenta nueva con email + password y queda logueado.
- [ ] Usuario puede iniciar sesión existente con email + password.
- [ ] Usuario puede pedir reset de password y recibe email.
- [ ] Usuario con `emailVerified: false` ve el banner en el Layout y puede reenviar el email.
- [ ] Errores Firebase Auth muestran mensajes claros en español per tabla mapeada.
- [ ] Google sign-in sigue funcionando en web + Tauri + Capacitor (sin regresión vs main pre-F47).
- [ ] Conflictos cross-provider muestran mensaje genérico unificado ("Ya existe una cuenta con este email. Probá iniciar sesión o usar Google.") — EEP impide identificar provider específico, comportamiento documentado.
- [ ] Sign-up se bloquea con UI clara cuando `useSignupCapacity` devuelve `canSignUp: false`.
- [ ] Triggers `onUserCreated`/`onUserDeleted` desplegados en `us-central1` y manteniendo `config/app.userCount` consistent con Firebase Auth.
- [ ] Seed inicial de `userCount` ejecutado antes del deploy de triggers — `userCount` refleja la cantidad real de users en Auth.
- [ ] `firestore.rules` permite read público de `config/{configId}` y rechaza writes client-side.
- [ ] Doc `config/app` existe en Firestore con `maxUsers`, `signupsEnabled` y `userCount` setteados.
- [ ] Tests E2E con Playwright MCP cubren: sign-in success + sign-in error + sign-up success + sign-up bloqueado por beta full + reset password flow completo + verification banner visible + reenvío con cooldown.
- [ ] Sin regresión en flows existentes — `useAuth.signIn` (Google) sigue siendo backward-compatible.

---

## Siguiente fase

Habilita (no incluido en F47, futuro F48+): account management page (cambiar password ya logueado, eliminar cuenta, ver providers conectados), **account linking automático** Google ↔ email/password vía `linkWithCredential`, MFA SMS (Firebase Console lo ofrece habilitable), anonymous auth / guest mode para explorar sin login.
