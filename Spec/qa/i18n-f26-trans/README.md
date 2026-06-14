# Evidencia visual — F2.6 i18n: render de los 2 `<Trans>` con email real

**Fecha:** 2026-06-13 · **SPEC:** SPEC-58 F2.6 (i18n auth + onboarding + admin)

Capturas del render in-vivo de los dos únicos `<Trans>` del dominio que interpolan
un email del usuario dentro de la frase. Prueban que i18next sustituye
`<1>{{email}}</1>` en la **posición castellana correcta**, con el email **en negrita**
(`font-medium text-foreground`) y **sin markup crudo** `<1>`.

| Archivo                                          | Pantalla                          | Key                            | Frase verificada                                                    |
| ------------------------------------------------ | --------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| `verify-email-1280.png` / `verify-email-375.png` | `/verify-email`                   | `auth.verify.body`             | "Para activar tu cuenta verificá **\<email\>**. Revisá tu bandeja…" |
| `reset-action-1280.png` / `reset-action-375.png` | `/auth/action?mode=resetPassword` | `auth.action.reset.forAccount` | "Elegí una nueva contraseña — Para la cuenta **\<email\>**."        |

Viewports: **1280** (desktop) y **375** (mobile).

## Cómo se generaron

- **Cuenta yopmail descartable** (`secondmind-f26-trans@yopmail.com`) creada en
  **producción** vía el form de signup, sólo para satisfacer los gates de cada pantalla
  (`/verify-email` requiere un user password sin verificar; `/auth/action` requiere un
  `oobCode` de reset válido). El email mostrado es el de esa cuenta de prueba.
- **`oobCode` de reset** generado con `generatePasswordResetLink` (Admin SDK, SA key
  efímera) — equivalente al del correo real, que ya quedó validado E2E vía yopmail en la
  sesión de cierre de F2.6 (correo en español, `callbackUri` → `secondmind.web.app/auth/action`,
  `oobCode` válido cross-origin en localhost).
- **Limpieza verificada server-side al cierre:** Auth user borrado (`getUserByEmail` →
  not-found), `config/app.userCount` == baseline, sin `users/{uid}`, `allowlist/` intacta.
  La SA key se revocó y se borró tras el QA.

## Nota

Esta evidencia acompaña al baseline de captura de `Spec/qa/i18n-baseline/` y cae bajo la
decisión **P9 de F4.3** sobre versionado de artefactos visuales de QA i18n.
