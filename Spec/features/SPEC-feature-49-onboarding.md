# SPEC Feature 49 — Onboarding (Registro de implementación)

> Estado: Completada mayo 2026 · 100% client-side (no toca CFs, rules ni schemas de dominio)
> Commits: `acf5c91` flags preferences · `9f15a30` hook useOnboarding · `7875c2e` WelcomeModal · `c83dc8d` OnboardingChecklist · `c35dc1f` corrección hito ③/4-4 · `3c57d37` ancho fijo CTAs
> Desplegada a prod (secondmind.web.app). Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

Guiar al usuario nuevo en sus primeros pasos con SecondMind, **sin interrumpir ni bloquear**, mediante dos piezas complementarias:

1. **Welcome modal de 1 paso** al primer login: el "qué es esto" (propósito del producto + invitación a empezar).
2. **Checklist "Primeros pasos" persistente en el dashboard**: 4 hitos que se autocompletan al detectar acciones reales del usuario, con la **configuración de la API key BYOK como hito central** (sin ella la IA de generación está deshabilitada — F48).

División de roles: el **modal da contexto**, el **checklist guía las acciones**.

## Qué se implementó

- **F1 — Flags de onboarding:** se agregaron `onboardingWelcomeSeen` y `onboardingChecklistDismissed` a `UserPreferences` como booleanos aditivos retrocompatibles (parseados con `data?.x === true`), sin bumpear `PREFERENCES_SCHEMA_VERSION`. Archivos tocados: `src/types/preferences.ts`, `src/lib/preferences.ts`.
- **F2 — Hook `useOnboarding`:** centraliza el gate triple de hidratación, la completitud reactiva de los 4 hitos, la detección de "cuenta vacía" y la persistencia de flags. Los componentes solo renderizan estado derivado. Archivos tocados: `src/hooks/useOnboarding.ts` (nuevo).
- **F3 — `WelcomeModal`:** modal base-ui de 1 paso (bienvenida + propósito + 3 pilares + CTA "Empezar"), auto-open one-shot a cuentas nuevas (patrón `DistillIndicator`), persiste `onboardingWelcomeSeen` al cerrar. Archivos tocados: `src/components/onboarding/WelcomeModal.tsx` (nuevo), `src/app/layout.tsx` (montaje en overlays globales).
- **F4 — `OnboardingChecklist`:** card "Primeros pasos" en el dashboard con barra de progreso, hitos reactivos (✓/○), resaltado del próximo hito pendiente, CTAs por hito y descarte. A 4/4 muestra estado de logro + "Cerrar" (no se auto-oculta). Archivos tocados: `src/components/onboarding/OnboardingChecklist.tsx` (nuevo), `src/app/page.tsx` (montaje entre Greeting y el grid).
- **F5 — Polish:** ancho fijo (`w-28`) de los CTAs para alinearlos en columna; copys en español; `aria-label` en el descarte; íconos `aria-hidden`. Verificado E2E con cuenta nueva real: welcome 1x, checklist 0/4→1/4 reactivo (creación de tarea), persistencia tras reload, descarte persistente.

## Decisiones clave

- **D1 — No bumpear `PREFERENCES_SCHEMA_VERSION`.** Los flags aditivos se parsean con `data?.x === true` → `false` para docs viejos = default deseado. Bumpear caería los docs `_schemaVersion: 1` a `DEFAULT_PREFERENCES`, purgando sidebar/split-pane/distill de los usuarios actuales. Solo se bumpea ante cambios de tipo/meaning, no ante adición. Precedente: `splitPaneLayout` (F46 D7).
- **D2 — `onboardingWelcomeSeen` como proxy de "candidato de onboarding".** El welcome solo aparece a cuentas nuevas/vacías; el checklist se gatea por `welcomeSeen === true`. Así un usuario existente (que nunca vio el welcome) jamás ve ninguna de las dos piezas, sin comparar fechas.
- **D3 — Gate triple de hidratación (riesgo #1).** `prefsLoaded && keysLoaded && !isHydrating` antes de evaluar visibilidad y "cuenta vacía". Sin él, "cuenta vacía" se mide contra stores pre-snapshot → welcome parpadea a usuarios existentes.
- **D4 — Completitud reactiva** vía `useTable` + `useMemo` + `.some(...)`. ① `apiKeys.anthropic.configured`; ② nota con `!isArchived && !deletedAt`; ③ inbox con `aiProcessed === true`; ④ tarea con `!isArchived` (tasks no tiene `deletedAt`).
- **D5 — Modal base-ui** (`@base-ui/react/dialog`): `Dialog.Root/Portal/Backdrop/Popup` con `data-starting-style`/`data-ending-style` (no Radix `data-state`; `animate-in` de tw-animate-css no aplica).
- **D6 — CTAs por hito:** ① `Link` a `/settings#api-keys` · ② `Link` a `/notes` (no crear nota directo, evita huérfanas) · ③ button → `useQuickCapture().open()` · ④ `Link` a `/tasks`.
- **D7 — El welcome no embebe la config de la key.** 1 paso conceptual; configurar la key vive en el hito ① del checklist.
- **D8 — Toda la lógica en `useOnboarding`.** Los componentes solo renderizan estado derivado.
- **D9 — Persistencia vía `setPreferences(uid, {...})` directo** (como `distillIntroSeen`); mergea e inyecta `_schemaVersion`, con guard `isLoaded` previo.
- **4/4 (Opción A):** a 4/4 la card muestra logro + "Cerrar" manual; **no se auto-oculta**. Única ruta de desaparición = `onboardingChecklistDismissed` por acción del usuario.

## Lecciones

- **Validar las condiciones de completitud contra el flujo REAL del backend, no contra el modelo mental.** El SPEC original definía el hito ③ como `aiProcessed === true && status !== 'pending'` — contradictorio: la CF `processInboxItem` marca `aiProcessed: true` dejando el item en `status: 'pending'` (ese ES el aha, con la sugerencia visible); el status solo cambia al convertir/descartar. La condición correcta es `aiProcessed === true` a secas, además monótona porque las rows del inbox nunca se borran (`inboxRepo` las conserva con `markProcessed`/`dismiss`). Se detectó trazando el repo + la CF en el audit (step 2), no codeando a ciegas.
- **`user.reload()` NO refresca el ID token de Firebase.** Detectado verificando F49: tras verificar el email de una cuenta nueva email/password, `reload()` actualiza la propiedad cliente `emailVerified` pero el ID token sigue con `email_verified=false` → las security rules deniegan TODA lectura Firestore (preferences, apiKeys y datos), no solo el onboarding. La app aparece "vacía" hasta re-loguear (token fresco). Cualquier feature gateada por un claim del token necesita `getIdToken(true)`, no solo `reload()`. → fix en `fix/verify-email-token-refresh`.
- **Gate de hidratación antes de evaluar "el usuario no tiene datos".** Cualquier UI condicionada a cuenta vacía debe esperar a que los stores hidraten; si no, el estado pre-snapshot da falso-vacío. El layout ya retiene el boot splash hasta `!isHydrating`, pero `prefsLoaded`/`keysLoaded` (snapshots Firestore independientes) pueden seguir cargando después — por eso el gate triple.
- **CTAs de ancho variable según su texto quedan desalineados en columna.** Ancho fijo (`w-28`) los empareja; el resaltado del próximo paso se mantiene con color, no con tamaño.
- **base-ui dialog auto-open one-shot:** mismo patrón que `DistillIndicator` (ref guard + `setOpen` en `useEffect` post-hidratación + persistir en `onOpenChange`), con el `eslint-disable react-hooks/set-state-in-effect` justificado.
