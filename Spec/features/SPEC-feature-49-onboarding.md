# SPEC Feature 49 — Onboarding

**Estado:** Draft (paso 1 SDD — pendiente de aprobación)
**Rama:** `feat/onboarding`
**Tipo:** 100% client-side (no toca Cloud Functions, rules ni schemas Firestore de dominio)

---

## Objetivo

Guiar al usuario nuevo en sus primeros pasos con SecondMind, **sin interrumpir ni bloquear**, mediante dos piezas complementarias:

1. **Welcome modal de 1 paso** al primer login: el "qué es esto" (propósito del producto + invitación a empezar).
2. **Checklist "Primeros pasos" persistente en el dashboard**: 4 hitos que se autocompletan al detectar acciones reales del usuario, con la **configuración de la API key BYOK como hito central** (sin ella la IA de generación está deshabilitada — D2 de F48).

División de roles (decisión del usuario): el **modal da contexto**, el **checklist guía las acciones**.

---

## Contexto

- **F48 (BYOK)** dejó la IA de generación deshabilitada cuando no hay API key Anthropic configurada (sin fallback al secret del proyecto). El onboarding convierte esa configuración en el primer hito y momento clave.
- **Patrón de flags one-time ya existente** (a reusar): `distillIntroSeen` / `distillBannersSeen` en `UserPreferences`, persistidos en `users/{uid}/settings/preferences`, leídos reactivos vía `usePreferences()` con gate `isLoaded`.
- **Patrón de nudge ya existente** (a reusar): banner en `/inbox` (`src/app/inbox/page.tsx:133-149`) que aparece con `aiKeysLoaded && !configured` y deep-linkea a `/settings#api-keys` con scroll smooth.
- **Estado de la key reactivo:** `useApiKeys()` → `{ apiKeys, isLoaded, saving, error, saveKey, removeKey }`; el hito se lee de `apiKeys.anthropic.configured` (gate `isLoaded`).

---

## Alcance

**IN:**

- Welcome modal de 1 paso (bienvenida + propósito + CTA "Empezar"), una sola vez por usuario nuevo.
- Checklist de 4 hitos en orden: ① API key → ② primera nota → ③ capturar + procesar inbox con IA (el "aha") → ④ primera tarea.
- Detección **reactiva** de completitud de cada hito desde los stores TinyBase / `useApiKeys`.
- Persistencia de flags (`onboardingWelcomeSeen`, `onboardingChecklistDismissed`) reusando el patrón de preferences.
- Descartable: el usuario puede ocultar el checklist permanentemente.

**OUT (explícito):**

- **Grafo como hito** — descartado: un grafo vacío en día 1 es anticlimático (decisión del usuario).
- Wizard modal multi-step bloqueante.
- Coachmarks / tooltips contextuales anclados a la UI.
- Embeber `<ApiKeysSection />` inline en un paso del checklist (mejora futura; MVP deep-linkea a Settings, patrón ya probado por el nudge).
- Multi-provider BYOK (reservado para una feature posterior).

---

## Decisiones de diseño

**D1 — NO bumpear `PREFERENCES_SCHEMA_VERSION`.**
Los dos flags nuevos son booleanos **aditivos retrocompatibles**: `parsePrefs` los lee con `data?.x === true`, que da `false` para docs viejos sin el campo — exactamente el default deseado. Bumpear haría que `parsePrefs` (`src/lib/preferences.ts:70-73`) rechace los docs `_schemaVersion: 1` existentes y los caiga a `DEFAULT_PREFERENCES`, **purgando** sidebar/split-pane/distill de todos los usuarios actuales. Precedente directo: `splitPaneLayout` (F46 D7) hizo lo mismo. Solo se bumpea ante cambios de **tipo/meaning** de un campo existente, no ante adición.

**D2 — `onboardingWelcomeSeen` actúa como proxy de "candidato de onboarding".**
Problema: un usuario **existente** (con datos previos al deploy) también tiene el flag en `false` por default; no debe ver onboarding. Solución sin comparar fechas:

- **Welcome modal** se muestra solo si la cuenta es **nueva/vacía** (ver D3). Al cerrarlo se persiste `onboardingWelcomeSeen: true`.
- **Checklist** se gatea por `onboardingWelcomeSeen === true` (es decir: "este usuario pasó por el welcome de cuenta nueva"). Así persiste mientras el usuario completa hitos (aunque la cuenta deje de estar vacía), y un usuario existente —que nunca vio el welcome— jamás lo ve.

**D3 — Gate de hidratación triple antes de evaluar visibilidad y "cuenta vacía".**
`usePreferences().isLoaded` **&&** `useApiKeys().isLoaded` **&&** `useStoreHydration().isHydrating === false`. Sin esto, "cuenta vacía" se evalúa contra stores pre-snapshot y un usuario existente vería el welcome por un instante (falso positivo). Es el riesgo #1 de la feature.

**D4 — Detección reactiva de completitud de hitos** (sin hook `useRowCount`; patrón canónico `useTable` + `useMemo`):

| Hito            | Fuente                       | Condición de "completo"                     |
| --------------- | ---------------------------- | ------------------------------------------- |
| ① API key       | `useApiKeys()`               | `isLoaded && apiKeys.anthropic.configured`  |
| ② Primera nota  | `useTable('notes')`          | ≥1 row con `!isArchived && deletedAt === 0` |
| ③ Inbox con IA  | `useTable('inbox', 'inbox')` | ≥1 row con `aiProcessed === true`           |
| ④ Primera tarea | `useTable('tasks', 'tasks')` | ≥1 row con `!isArchived`                    |

> **Corrección (audit step 2, confirmado con el usuario):** el hito ③ NO lleva `&& status !== 'pending'`. La CF `processInboxItem` setea `aiProcessed: true` dejando el item en `status: 'pending'` (ese ES el momento aha, con la sugerencia visible); el status solo cambia a `processed`/`dismissed` al convertir/descartar. `aiProcessed === true` es además monótono porque la row del inbox nunca se borra (`inboxRepo` la conserva).

**D5 — Modal con primitiva base-ui** (`@base-ui/react/dialog`), siguiendo el patrón canónico de `QuickCapture` / `ProjectCreateModal`: `Dialog.Root/Portal/Backdrop/Popup` con animación vía `data-starting-style` / `data-ending-style` (NO `data-state` de Radix; las clases `animate-in` de tw-animate-css **no** aplican a base-ui — ver memoria del proyecto).

**D6 — CTA / navegación por hito** (cada fila navega a la acción; la completitud se detecta sola):

- ① API key → `<Link to="/settings#api-keys">` (reusa deep-link del nudge).
- ② Primera nota → ruta/acción de creación de nota _(confirmar el trigger exacto en implementación: ruta `/notes` + "nueva nota" vs editor directo)_.
- ③ Inbox con IA → abrir Quick Capture (`useQuickCapture`) o `/inbox`; al capturar, la CF `processInboxItem` lo procesa y marca `aiProcessed`.
- ④ Primera tarea → `/tasks` (inline create).

**D7 — El welcome modal NO embebe la configuración de la key.** Es 1 solo paso conceptual: bienvenida + propósito + "Empezar". La acción de configurar la key vive en el checklist (hito ①). Mantiene el modal corto y no intrusivo.

**D8 — Toda la lógica vive en un hook `useOnboarding`**, no en los componentes (regla del proyecto: >10 líneas de lógica → hook). Los componentes solo renderizan estado derivado.

**D9 — Persistencia de flags vía `setPreferences` directo** (como `distillIntroSeen`), sin helper dedicado nuevo salvo que mejore legibilidad. `setPreferences` ya inyecta `_schemaVersion` y mergea.

---

## Sub-features

### F1 — Flags de onboarding en `UserPreferences`

- **Qué:** agregar `onboardingWelcomeSeen: boolean` y `onboardingChecklistDismissed: boolean`.
- **Criterio de done:** ambos flags persisten en `users/{uid}/settings/preferences` y se leen reactivos vía `usePreferences()`; un doc `_schemaVersion: 1` existente **conserva** todas sus prefs (verificado: sin bump).
- **Archivos:**
  - `src/types/preferences.ts` — añadir 2 campos a la interface + a `DEFAULT_PREFERENCES` (ambos `false`), con comentario "campo aditivo — NO bumpear" análogo a `splitPaneLayout`.
  - `src/lib/preferences.ts` — añadir 2 líneas a `parsePrefs` (`onboardingWelcomeSeen: data?.onboardingWelcomeSeen === true`, idem dismissed). **NO** tocar `PREFERENCES_SCHEMA_VERSION` (D1).

### F2 — Hook `useOnboarding`

- **Qué:** centralizar elegibilidad, completitud de los 4 hitos y acciones.
- **Criterio de done:** expone estado derivado reactivo; ningún componente calcula completitud por su cuenta; respeta el gate triple de D3.
- **Archivos:** `src/hooks/useOnboarding.ts` (nuevo).
- **API tentativa:**
  ```ts
  interface OnboardingStep {
    id: 'apiKey' | 'firstNote' | 'inboxAi' | 'firstTask';
    label: string;
    description: string;
    done: boolean;
    ctaTo?: string; // deep-link, si aplica
    ctaAction?: () => void; // ej. abrir Quick Capture
  }
  interface UseOnboardingReturn {
    steps: OnboardingStep[];
    completedCount: number; // 0..4
    allComplete: boolean;
    shouldShowWelcome: boolean; // D2 + D3 (cuenta nueva, no vista, hidratado)
    shouldShowChecklist: boolean; // welcomeSeen && !dismissed (NO !allComplete — Opción A)
    markWelcomeSeen: () => Promise<void>;
    dismissChecklist: () => Promise<void>;
  }
  ```
- **Notas:** `isNewAccount` = cuenta vacía (`notes==0 && tasks==0 && inbox==0`, todos activos) gateada por hidratación. `shouldShowWelcome = prefsLoaded && apiKeysLoaded && !isHydrating && !onboardingWelcomeSeen && isNewAccount`.

### F3 — `WelcomeModal`

- **Qué:** modal base-ui de 1 paso al primer login (bienvenida + propósito + CTA "Empezar").
- **Criterio de done:** aparece una sola vez a cuenta nueva; al cerrar/"Empezar" persiste `onboardingWelcomeSeen: true` y revela el checklist; no reaparece tras reload; un usuario existente nunca lo ve.
- **Archivos:**
  - `src/components/onboarding/WelcomeModal.tsx` (nuevo) — patrón base-ui (D5), consume `useOnboarding`.
  - `src/app/layout.tsx` — montar tras `<InstallPrompt />` (junto a los overlays globales, L163-166).

### F4 — `OnboardingChecklist` (card del dashboard)

- **Qué:** card "Primeros pasos" con los 4 hitos (✓/○), contador/`progress` `n/4`, CTA por hito y botón "Descartar guía".
- **Criterio de done:** visible solo si `shouldShowChecklist`; cada hito refleja completitud reactiva sin recargar; descartar lo oculta permanentemente (`onboardingChecklistDismissed: true`); al llegar a 4/4 muestra estado de logro + botón "Cerrar"; **no se auto-oculta** — la única ruta de desaparición es descartar la guía (Opción A, decisión del usuario).
- **Archivos:**
  - `src/components/onboarding/OnboardingChecklist.tsx` (nuevo) — consume `useOnboarding`; estilo de card del dashboard (`rounded-lg border border-border bg-card`).
  - `src/app/page.tsx` — insertar entre `<header>` (Greeting) y el `<div className="grid ...">`.

### F5 — Polish (mismo branch, opcional según tiempo)

- Copys finales en español, animación de check al completar un hito, `aria-label`s, verificación responsive 375 / 768 / 1280. (El focus-trap del modal lo aporta base-ui.)

---

## Orden de implementación

`F1 → F2 → F3 → F4 → F5` (flags → lógica → modal → checklist → polish). Un commit atómico por sub-feature (Conventional Commits en español).

---

## Verificación E2E (Playwright MCP + Firebase MCP — UID test `gYPP7NIo5JanxIbPqMe6nC3SQfE3`)

1. **Golden path (cuenta nueva vacía):** welcome aparece → "Empezar" → checklist `0/4` (o `1/4` si ya hay key) → configurar key (deep-link a settings, volver) ✓ → crear nota ✓ → Quick Capture + procesar inbox con IA ✓ → crear tarea ✓ → `4/4` estado final → card se auto-oculta.
2. **Persistencia:** reload → welcome no reaparece; checklist refleja el estado persistido.
3. **Regresión usuario existente (con datos):** NO welcome, NO checklist; prefs previas (sidebar/split-pane/distill) intactas (valida D1).
4. **Edge:** descartar el checklist a mitad → no reaparece tras reload.

`TaskStop` al dev server al terminar.

---

## Checklist de cierre (paso 6-8 SDD)

- [ ] F1–F5 con criterio de done verificado
- [ ] `npm run lint` completo en 0 errores (no solo el hook `--fix`)
- [ ] `npm run build` (tsc + vite) verde
- [ ] E2E golden + persistencia + regresión + edge
- [ ] Deploy: `npm run build && npm run deploy` (client-side; **no** CFs/rules; Tauri/Android opcionales — no se toca `src-tauri/` ni `android/`)
- [ ] Merge `--no-ff` a `main` + push
- [ ] Paso 8: archivar SPEC a registro de implementación + escalar gotchas (¿alguno nuevo cross-feature? candidato: "campos aditivos a preferences → no bumpear")

---

## Gotchas / riesgos

- **Falso "cuenta vacía" pre-hidratación → welcome a usuario existente.** Riesgo #1. Mitigado por el gate triple de D3.
- **base-ui data-attributes, no Radix.** `data-starting-style`/`data-ending-style`; `animate-in` de tw-animate-css no aplica (memoria del proyecto).
- **`isLoaded` gate antes de persistir flags** — no disparar `setPreferences` contra defaults pre-snapshot (pisaría el valor real).
- **NO bumpear `PREFERENCES_SCHEMA_VERSION`** (D1) — bumpear es destructivo para prefs no relacionadas.
- **El hito ③ depende de la CF `processInboxItem`**, que requiere la key configurada — coherente con el orden (① antes que ③).
