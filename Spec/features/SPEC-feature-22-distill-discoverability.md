# SPEC F22 — Distill Levels Descubribilidad (Registro de implementación)

> Estado: Completada Abril 2026
> Commits: `02886db` SPEC, `245fb09` F1 badge L0, `0ea807d` F4 copy L3+tips, `ded21ef` infra preferences (isLoaded + 2 flags + tests), `e8dd274` F2 auto-popover, `a1f3dc6` F3 banner, `3efcff3` fix dot-notation + timer cleanup, `2f55794` fix mock erasableSyntaxOnly. Merge `65d8ba1`.
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

Resolver la fricción del subsistema Progressive Summarization (F4) detectada en el discovery post-F21:

- El badge L0 era visualmente invisible (`bg-muted/40 text-muted-foreground`), no invitaba a interactuar.
- El usuario descubrió `Ctrl+B = L1` y `Ctrl+Shift+H = L2` por accidente; nunca entendió L3.
- El popover educativo ya existía en `DistillIndicator.tsx` con tip por nivel — el problema NO era ausencia de explicación, era **descubribilidad cero**.

Hacer descubrible la mecánica sin instalar dependencias nuevas, sin alterar la lógica de niveles (`computeDistillLevel.ts`), y sin tocar los marks (bold/highlight) como triggers.

## Qué se implementó

- **F1 — Badge L0 con affordance estática:** `LEVEL_META[0].badgeClass` cambió de muted gris a `border-dashed border-violet-400/60 bg-violet-500/5 text-violet-700` (más variantes dark). Sin pulse animado por decisión explícita del user. Archivos tocados: `src/components/editor/DistillIndicator.tsx`.
- **F2 — Auto-popover one-time:** `Popover.Root` controlado con `open` prop, auto-abre en primer mount cuando `isLoaded && !distillIntroSeen`, persiste tras cualquier dismiss vía `setPreferences(uid, { distillIntroSeen: true })`. Click en "Escribir resumen L3" cierra popover + abre summary (doble side-effect). Archivos tocados: `src/components/editor/DistillIndicator.tsx`, `src/types/preferences.ts`, `src/lib/preferences.ts`, `src/hooks/usePreferences.ts`.
- **F3 — Mini-banner inline al subir nivel:** componente nuevo `DistillLevelBanner.tsx` montado en `NoteEditor` después de `<SummaryL3>`. Detecta transición ascendente comparando `useCell('notes', noteId, 'distillLevel')` contra `useRef<number | undefined>` (primer mount captura sin disparar). Muestra 3s con `animate-in fade-in slide-in-from-top-1`, `role="status" aria-live="polite"`. Persistencia per-nivel cross-device vía helper `markDistillBannerSeen(uid, level)` con dot-notation Firestore. Archivos tocados: `src/components/editor/DistillLevelBanner.tsx`, `src/components/editor/NoteEditor.tsx`, `src/types/preferences.ts`, `src/lib/preferences.ts`.
- **F4 — Copy del placeholder L3 y tips:** placeholder del textarea pasa de "Resumen ejecutivo — ¿cuál es la idea central?" a "¿Qué le explicarías a tu yo del futuro sobre esto? 1-2 frases." Tips L2 y L3 reformulados en torno al "para qué" (la nota lista para tu yo del futuro). Voseo "vos" reemplazado por "tu yo del futuro" — neutro y consistente con gotcha F15. Archivos tocados: `src/components/editor/SummaryL3.tsx`, `src/components/editor/DistillIndicator.tsx`.

Adicional infra del commit `ded21ef`: `usePreferences` ahora expone `isLoaded` (callback firma de `subscribePreferences` cambió a `(prefs, isLoaded)`); `parsePrefs` exportado y con defensive parsing para `distillIntroSeen` (boolean coerce con `=== true`) y `distillBannersSeen` (shape parcial → completa con defaults). 10 tests unitarios nuevos en `src/lib/preferences.test.ts`.

## Decisiones clave

| #   | Decisión                                                             | Razón                                                                                                                                                        |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Pulse animado descartado en badge L0                                 | Ruido visual permanente en herramienta de escritura. Affordance se logra con borde dashed + color sutil estático.                                            |
| D2  | `UserPreferences` sobre `localStorage` para flags de onboarding      | Cross-device + abre la puerta a más flags futuros sin fragmentar la persistencia. Acepta el costo de sumar 2 campos al doc único (N=3, dentro del techo).    |
| D3  | Mini-banner inline en lugar de toast global                          | Cero dependencia nueva. Banner anclado al editor conecta visualmente la causa (Ctrl+B) con el efecto (badge cambia + banner) en el mismo viewport.           |
| D4  | Trigger de F3 basado en valor persistido (TinyBase post-autosave 2s) | Coherencia visual garantizada: el badge cambia color en el mismo tick que el banner aparece. El banner anclado al editor desmonta si el user navega antes.   |
| D5  | Helper `markDistillBannerSeen` específico, no generalizado           | Type-safe (level: 1 \| 2 \| 3), scope claro. Si emerge un segundo caso de flag-map one-time, refactor a `markBooleanFlagSeen(uid, path)` cuando aparezca.    |
| D6  | F4 del draft (entry point `/notes`) explícitamente fuera             | El popover de DistillIndicator ya cubre la educación; duplicarlo en `/notes` agrega mantenimiento sin cubrir un gap real. Follow-up si emerge fricción real. |

## Rondas de fix

Dos bugs detectados en el E2E manual con Playwright + Firebase MCP, ambos cerrados en `3efcff3`.

**Bug A — `setDoc({merge:true})` no interpreta dot-notation.** El primer markDistillBannerSeen guardaba el campo literal con punto en la key (`"distillBannersSeen.l1": true` como string top-level), no como path nested. `parsePrefs` nunca lo leía → el banner reaparecía en cada bold/highlight sin persistir efectivamente. Root cause: la doc oficial de Firebase JS SDK aclara que `setDoc({merge:true})` con `{ 'a.b': true }` guarda la key literal; **solo `updateDoc` interpreta dot-notation como path nested**. Fix: `markDistillBannerSeen` usa `updateDoc({ [`distillBannersSeen.l${level}`]: true })`, con fallback a `setDoc({ distillBannersSeen: { [`l${level}`]: true } }, { merge: true })` si el doc no existe (FirebaseError code 'not-found'). Race nulo en el fallback porque no hay objeto previo que pisar. Validado en Firestore: doc ahora tiene `distillBannersSeen: { l1: true }` como `mapValue` nested.

**Bug B — el cleanup del useEffect cancelaba el setTimeout del banner.** El effect que disparaba el banner tenía dep `[level, isLoaded, user, preferences.distillBannersSeen]` y el `clearTimeout` en el cleanup. Cuando `markDistillBannerSeen` resolvía y `onSnapshot` actualizaba `preferences.distillBannersSeen`, el effect re-corría → cleanup cancelaba el timer → banner quedaba visible indefinidamente sin auto-dismiss. Fix: separar el timer en su propio `useEffect` con dep `[visibleLevel]`. El cleanup ahora solo corre cuando el banner cambia de nivel o se desmonta el componente, no cada vez que cualquier prop cambie.

## Lecciones

- **`setDoc({merge:true})` con dot-notation es trampa silenciosa.** El SDK acepta la key, la guarda literal, y nada falla en runtime. La diferencia con `updateDoc` está documentada pero es fácil pasarla por alto. Cualquier persist con path nested debe usar `updateDoc` (con fallback a setDoc nested si el doc no existe). El test unitario del helper detectó el comportamiento esperado pero NO el bug porque mockeaba `setDoc` sin verificar el shape final en Firestore — los tests E2E son los que lo detectaron.
- **Cleanup de useEffect que comparte deps con un setTimeout es anti-patrón.** Si el state que dispara el side-effect es independiente del state que necesita auto-dismiss (`level` vs `visibleLevel`), separá el timer en su propio effect con su propia dep. Aplica a cualquier componente con "show-then-hide": toasts, banners, hover cards con auto-fade, undo prompts.
- **Cache module-level + dedupe por uid** para doc-único reactivo Firestore (patrón de `lib/embeddings.ts` y `lib/preferences.ts`) requiere que el callback exponga `isLoaded` además del valor. Sin esto, los consumers que disparan side-effects basados en flags actúan contra `DEFAULT_PREFERENCES` antes del primer `onSnapshot` real → race con el valor real cuando llega ~100-300ms después. Pattern: callback firma `(value, isLoaded: boolean)`, hook expone ambos en el return.
- **Voseo "vos" como pronombre tónico (no solo en imperativo) marca registro rioplatense.** El gotcha F15 menciona específicamente verbos en imperativo voseante (`Creá`, `Escribí`), pero "vos" como pronombre en frases tipo "explicarle a vos" tiene el mismo efecto. Reemplazar por estructuras neutras como "tu yo del futuro" o "te" antes de commitear cualquier copy nueva.
- **`erasableSyntaxOnly` en tsconfig prohíbe parameter properties.** El proyecto bloquea `class X { constructor(public field: type) {} }` porque es TypeScript-only sintaxis no transpilable a JS estándar. Vitest acepta vía esbuild pero `tsc -b` del build falla con TS1294. Workaround: `field: type;` declaración explícita + asignación en el body del constructor. Aplica a cualquier mock/clase nueva que el typing de TS detectaría como error de build.
- **`erasableSyntaxOnly` no aparece en `tsc --noEmit` directo.** El check pasa cuando se corre `npx tsc --noEmit` desde la raíz, pero `npm run build` (que usa `tsc -b` con project references) lo dispara. Si el linter local pasa pero el build falla, sospechar de configuración split entre tsconfig.json y tsconfig.app.json/tsconfig.build.json.
