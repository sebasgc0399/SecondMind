# SPEC F22 — Distill Levels Descubribilidad

> Status: SPEC vigente, pre-implementación.
> Branch: `feat/notes-distill-discoverability`.
> Fecha: 2026-04-25.
> Ciclo: SDD canónico — SPEC → Plan mode → branch → commits → merge → deploy → archivar.

---

## Objetivo

Resolver la fricción del subsistema Progressive Summarization (F4) detectada en el discovery post-F21:

- El badge L0 es visualmente invisible (`bg-muted/40 text-muted-foreground`), no invita a interactuar.
- El usuario descubrió `Ctrl+B = L1` y `Ctrl+Shift+H = L2` por accidente; nunca entendió L3.
- El popover educativo ya existe en `DistillIndicator.tsx` con tip por nivel + botón "Escribir resumen L3" — el problema NO es ausencia de explicación, es **descubribilidad cero**.

Hacer descubrible la mecánica sin instalar dependencias nuevas, sin alterar la lógica de niveles (`computeDistillLevel.ts`), y sin tocar los marks (bold/highlight) como triggers.

---

## Discovery (estado pre-código)

| Pieza                               | Ubicación                                                                                                                     | Comentario                                                                                                                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Badge + popover educativo           | [`src/components/editor/DistillIndicator.tsx`](../../src/components/editor/DistillIndicator.tsx)                              | `LEVEL_META` ya tiene label + tip por nivel. L0 muted, L1 azul, L2 amarillo, L3 verde.                                              |
| Mount del badge                     | [`src/app/notes/[noteId]/page.tsx:94`](../../src/app/notes/%5BnoteId%5D/page.tsx)                                             | Pasado al `headerSlot` del `<NoteEditor>`. Recibe `onOpenSummary` para expandir el textarea L3.                                     |
| Cómputo de nivel                    | [`src/lib/editor/computeDistillLevel.ts`](../../src/lib/editor/computeDistillLevel.ts)                                        | Walk recursivo. summaryL3 → 3, highlight → 2, bold → 1, default 0. Persiste vía autosave 2s.                                        |
| Textarea L3                         | [`src/components/editor/SummaryL3.tsx`](../../src/components/editor/SummaryL3.tsx)                                            | Placeholder actual: `"Resumen ejecutivo — ¿cuál es la idea central?"`. Genérico.                                                    |
| Preferencias usuario (cross-device) | [`src/lib/preferences.ts`](../../src/lib/preferences.ts) + [`src/hooks/usePreferences.ts`](../../src/hooks/usePreferences.ts) | Doc-único reactivo `users/{uid}/settings/preferences`. Hoy 1 campo (`trashAutoPurgeDays`). Margen para 2 flags más sin sobreinflar. |
| Sistema de toasts                   | —                                                                                                                             | **No existe**. `grep toast\|sonner\|react-hot src/` = 0 matches. F3 se implementa inline sin dep nueva.                             |

---

## Sub-features

### F1 — Badge L0 con affordance estática descubrible

**Qué.** Cambiar la visual del badge cuando `level === 0`: borde dashed + Sparkles violet sutil + label invitante. **Sin pulse animado** — un pulse permanente es ruido visual en una herramienta de escritura. Solo se modifica `LEVEL_META[0]`; L1/L2/L3 conservan su color discriminante.

**Criterio.** Inspección visual a 375 y 1280, light + dark:

- El badge L0 ya no se confunde con un elemento "muted/desactivado".
- Contraste suficiente en ambos temas (WCAG AA mínimo).
- Hover state evidente (cursor pointer, transición de fondo).

**Archivo.** `src/components/editor/DistillIndicator.tsx`.

**Cambio puntual.** En `LEVEL_META[0].badgeClass`:

```diff
- badgeClass: 'bg-muted/40 text-muted-foreground'
+ badgeClass: 'border border-dashed border-violet-400/60 bg-violet-500/5 text-violet-700 dark:border-violet-300/40 dark:text-violet-300'
```

Ajustar tono fino tras revisión visual (los valores son punto de partida, no canon).

---

### F2 — Auto-popover one-time en primera apertura de nota

**Qué.** La primera vez que el usuario abre cualquier nota tras estar autenticado (lifetime, no per-session), el popover de `DistillIndicator` abre automáticamente con su contenido educativo actual. Tras cualquier dismiss (click fuera, Escape, click en el botón "Escribir resumen L3"), persistir `distillIntroSeen: true` en `UserPreferences` para que NO reaparezca cross-device.

**Criterio.**

- User con `distillIntroSeen = false` abre `/notes/[X]` → popover abierto auto tras mount.
- Cualquier dismiss → `setPreferences(uid, { distillIntroSeen: true })` (única escritura).
- Mismo user en otro device → popover NO se auto-abre.
- Dismiss + reload misma nota → popover NO se auto-abre.
- User con `distillIntroSeen = true` desde el inicio → comportamiento idéntico al actual (popover abre solo on-click).

**Archivos.**

- `src/types/preferences.ts` — extender `UserPreferences` con `distillIntroSeen: boolean`. Actualizar `DEFAULT_PREFERENCES` con `false`.
- `src/lib/preferences.ts` — `parsePrefs` valida el campo nuevo (boolean coerce, default `false`).
- `src/hooks/usePreferences.ts` — exponer `isLoaded` además de `preferences`. Sin esto, el popover puede auto-abrir contra defaults antes de que llegue el primer `onSnapshot` (race con valor real `true`).
- `src/components/editor/DistillIndicator.tsx` — controlar `Popover.Root` con `open` prop. State local `controlledOpen`. Auto-open via efecto guardado por `initialAutoOpenedRef` (dispara una sola vez por mount, descarta dep loops).

**Notas técnicas.**

- `usePreferences().isLoaded` debe consumir `entry.isLoaded` interno de `subscribePreferences` (ya existe en cache, solo no se expone). El hook debe propagar el flag al consumer.
- El `useEffect` de auto-open NO debe depender de `preferences` directamente (re-entry post-set). Pattern: `if (!isLoaded || preferences.distillIntroSeen || initialAutoOpenedRef.current) return;` + `initialAutoOpenedRef.current = true; setControlledOpen(true);`.
- Persistencia: dentro del `onOpenChange={(next) => { ... }}` del Popover, si pasa de `true → false` y `!preferences.distillIntroSeen`, fire `void setPreferences(user.uid, { distillIntroSeen: true })`.

---

### F3 — Mini-banner inline al cambiar de nivel (one-time per nivel por usuario)

**Qué.** Al detectar que `distillLevel` subió de N a N+M (con M > 0), mostrar un mini-banner inline en el editor durante 3 segundos con copy contextual:

- L0 → L1: "Subiste a **L1** · Pasajes clave marcados"
- L1 → L2: "Subiste a **L2** · Esenciales resaltados"
- L2 → L3: "Llegaste a **L3** · Nota destilada"

Una sola vez por nivel por usuario. Sin toast library — banner inline con `animate-in/animate-out`, posición arriba del editor (debajo del headerSlot), `setTimeout(3000)` para dismiss, persistencia cross-device en `UserPreferences`.

**Criterio.**

- User sin marcas aplica Ctrl+B en el editor → tras autosave (2s), banner aparece "Subiste a L1" durante 3s con fade. Tras dismiss, persiste.
- Reload misma nota, vuelve a aplicar Ctrl+B en otra nota → banner NO aparece.
- Sube a L2 después → banner "Subiste a L2" aparece (1ra vez para ese nivel).
- Cross-device: si ya vio banner L1 en desktop, NO aparece en mobile.
- Transición descendente (L3 → L2 al borrar summaryL3) → no banner.
- Skip de niveles (L0 → L3 si pegó marks + texto + summary en una operación, hipotético) → banner del nivel destino mostrado solo si no fue visto antes; intermedios NO se muestran.

**Archivos.**

- `src/types/preferences.ts` — extender con `distillBannersSeen: { l1: boolean; l2: boolean; l3: boolean }`. Default todo `false`.
- `src/lib/preferences.ts` — `parsePrefs` valida la shape del objeto (validar 3 campos boolean independientes con default `false`; tolerar shapes parciales legacy).
- `src/components/editor/DistillLevelBanner.tsx` — componente nuevo. Recibe `noteId`. Suscribe `useCell('notes', noteId, 'distillLevel')`. Compara `current` vs `previousRef.current` por render; si subió y el nivel destino no está en `distillBannersSeen`, muestra banner + setTimeout 3s + persiste.
- `src/components/editor/NoteEditor.tsx` — render `<DistillLevelBanner noteId={noteId} />` arriba del `<EditorContent>`, debajo del header con DistillIndicator + SaveIndicator.

**Edge cases / decisiones.**

- **Trigger se basa en valor persistido** (TinyBase row tras autosave 2s), no en estado live del editor. Garantiza coherencia con el badge — el banner aparece junto con el cambio visual del badge, no antes.
- **Race con F2**: si el user es nuevo (`distillIntroSeen=false`), abre una nota L0 y aplica Ctrl+B antes de cerrar el popover, F2 está abierto Y F3 dispararía. Decisión: ambos pueden coexistir visualmente — el banner aparece debajo del header, el popover sale del badge. No solapan. Acceptable.
- **Nota recién creada arranca en L0** → no banner inicial (el `previousRef.current` es undefined al primer render, tratamos `undefined → 0` como no-transición).
- **Persistencia atómica**: una sola `setPreferences` por banner mostrado, fire-and-forget. Si falla la write, el user verá el banner otra vez en otro device — acceptable.

---

### F4 — Copy del textarea L3 + tip del popover L2

**Qué.** Reescribir dos pedazos de copy clave:

1. `SummaryL3.tsx` placeholder del textarea — pasar de "Resumen ejecutivo — ¿cuál es la idea central?" a algo más concreto que invite la voz del futuro: _"Si tuvieras que explicarle esto a vos en 1 año, ¿qué dirías? 1-2 frases."_
2. `DistillIndicator.tsx` `LEVEL_META[2].tip` — agregar el "para qué" del L3 al tip del nivel 2: _"Escribe un resumen ejecutivo en tus palabras para subir a L3 — la nota queda lista para el vos del futuro, sin tener que releer todo."_

**Criterio.** Texto leído con sentido de propósito; el usuario entiende **para qué** sirve un L3, no solo qué es.

**Archivos.**

- `src/components/editor/SummaryL3.tsx` — `placeholder` del textarea.
- `src/components/editor/DistillIndicator.tsx` — `LEVEL_META[2].tip`.

---

## Out of scope explícito

Estas piezas NO entran en F22 aunque aparezcan en el draft del roadmap o emerjan como tangenciales:

- **Entry point conceptual desde `/notes`** (F4 del draft `Spec/drafts/DRAFT-roadmap-inbox-notas.md`). El popover de `DistillIndicator` ya cubre la educación; duplicarlo en `/notes` agrega mantenimiento sin cubrir un gap real (el caso edge es "user en /notes que nunca abre una nota"). Si emerge fricción real post-F22, follow-up.
- **Toast library** (`sonner`, `react-hot-toast`, etc.). F3 implementado inline sin dependencia nueva.
- **Cambios en `computeDistillLevel.ts`**. Lógica L0-L3 intacta.
- **Cambios en marks (bold/highlight) como triggers**. Mecánica intacta.
- **Pulse animado en badge L0**. Decidido por usuario: ruido visual en herramienta de escritura.
- **Banner para transiciones descendentes** (L3 → L2, etc.). El user no necesita celebrar bajadas.
- **Reset/re-show del onboarding** desde `/settings`. Si emerge necesidad, follow-up.

---

## Orden de implementación

1. **F1** — badge L0 affordance. Cambio CSS-only sobre `LEVEL_META[0]`.
2. **F4** — copy textarea L3 + tip popover L2. Cambios estáticos, independientes.
3. **F2** — auto-popover + flag `distillIntroSeen`. Schema migration + control imperativo del Popover + `isLoaded` en `usePreferences`.
4. **F3** — mini-banner inline + flag `distillBannersSeen`. Componente nuevo + render en `NoteEditor`. Reusa el `usePreferences.isLoaded` introducido en F2.

**Razón del orden.** F1 y F4 son cambios estáticos sin schema migration — bajo riesgo, alto progreso. F2 introduce el primer flag de "first-time UX" en `UserPreferences` y el `isLoaded` expuesto; F3 reusa esa infra con un segundo flag. Hacer F2 antes que F3 evita schema migration doble.

---

## Decisiones clave (registradas para el archivado futuro)

- **Pulse animado descartado.** Ruido visual permanente en herramienta de escritura. Affordance se logra con borde dashed + color sutil estático.
- **`UserPreferences` sobre `localStorage`** para los dos flags nuevos (`distillIntroSeen`, `distillBannersSeen`). Cross-device + abre la puerta a más flags de onboarding sin fragmentar la persistencia. Acepta el costo de sumar 2 campos al doc único (gotcha vigente "considerar migrar a TinyBase si N>3" — quedamos en N=3, todavía dentro del techo).
- **Mini-banner inline en lugar de toast global.** Cero dependencia nueva. Banner anclado al editor conecta visualmente la causa (acción de bold) con el efecto (cambio de nivel + feedback) en el mismo viewport.
- **Trigger de F3 basado en valor persistido**, no en estado live del editor. Garantiza coherencia con el badge.
- **F4 del draft (entry point /notes) explícitamente fuera**. Si tras dogfooding F22 emerge fricción real para el caso "user en /notes que nunca abre una nota", follow-up. No anticipar.

---

## Verificación E2E

Tras F4 implementada, validar con Playwright + Firebase MCP en viewports 375 + 1280, light + dark:

1. **Usuario nuevo** (con doc preferences inexistente):
   - Abrir `/notes/[X]` → popover auto-abre.
   - Verificar `distillIntroSeen` se persiste a `true` tras dismiss.
   - Aplicar Ctrl+B → tras autosave 2s, banner "Subiste a L1" aparece 3s y se dismisea.
   - Verificar `distillBannersSeen.l1 === true` en Firestore.
   - Aplicar Ctrl+Shift+H → banner "Subiste a L2".
   - Verificar `distillBannersSeen.l2 === true`.
   - Click "Escribir resumen L3" + escribir + close summary → banner "Llegaste a L3".
2. **Usuario con preferencias seteadas** (`distillIntroSeen=true`, `distillBannersSeen.{l1,l2,l3}=true`):
   - Abrir nota → popover NO auto-abre.
   - Aplicar bold → banner NO aparece.
3. **Cross-device** simulado: user dismissó popover en sesión A; entrar en sesión B con mismo uid (otro browser/incognito) → popover NO auto-abre.
4. **Visual L0**: badge L0 visible en light/dark, contraste suficiente vs muted/desactivado.
5. **Mobile 375**: banner cabe sin overflow horizontal; popover no se desborda.

---

## Checklist

- [ ] **F1** — Badge L0 con borde dashed + Sparkles violet sutil. Validar contraste 375/1280 light/dark.
- [ ] **F4** — Placeholder textarea L3 + tip L2 actualizados.
- [ ] **F2** — `usePreferences` expone `isLoaded`. `UserPreferences.distillIntroSeen` agregado + `parsePrefs` valida. `DistillIndicator` controlado + auto-open one-time + persistencia post-dismiss.
- [ ] **F3** — `UserPreferences.distillBannersSeen` agregado + `parsePrefs` valida shape. `DistillLevelBanner` componente nuevo. Render en `NoteEditor`. setTimeout 3s + animate-in/animate-out + persistencia per-nivel.
- [ ] E2E Playwright en `/notes/[X]` viewports 375 + 1280, light + dark, todos los flujos de la sección "Verificación".
- [ ] `tsc` + `eslint` pasan tras cada commit (PostToolUse hook ya formatea).
- [ ] Deploy hosting (`npm run build && npm run deploy`). Tauri / Android opcionales (cambios 100% client-side, recogidos automáticamente por auto-updater + WebView móvil).
- [ ] Merge `--no-ff` a main con commit descriptivo.
- [ ] Archivar SPEC vía skill `archive-spec`.
- [ ] Escalar gotchas a `Spec/ESTADO-ACTUAL.md` si emergen patrones reusables (candidato: patrón "mini-banner one-time per-evento via UserPreferences flag-map", patrón "exposing isLoaded en hook reactivo doc-único").
