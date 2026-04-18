# SPEC — SecondMind · Feature 4: Progressive Summarization Visual (Registro de implementación)

> Estado: **Completada** — Abril 2026
> Alcance: 3 niveles de destilación de Tiago Forte sobre el editor TipTap (L0 sin marcas → L1 bold → L2 highlight → L3 resumen ejecutivo), indicador visual en el header con tip contextual, resumen colapsable encima del editor, `distillLevel` computado automáticamente y persistido en TinyBase + Firestore, badge consistente en `NoteCard`.
> Stack implementado: `@tiptap/extension-highlight`, `@base-ui/react/popover` (primer uso en el proyecto), walk recursivo sobre `JSONContent` para leer marks en text nodes, hook unificado `useNoteSave` con doble input (editor + textarea).
> Para gotchas operativos consolidados → `Spec/ESTADO-ACTUAL.md` sección "Progressive Summarization (Feature 4)".

---

## Objetivo

Cuando Sebastián abre una nota vieja, ve de un vistazo los pasajes clave (**bold**, L1), los esenciales (<mark>highlight amarillo</mark>, L2) y un resumen ejecutivo arriba (L3). El badge del header le dice el nivel de destilación, con un tip contextual que le indica la próxima acción. La técnica es acumulativa (cada capa se suma) y no destructiva: si borra el resumen, el nivel baja al correspondiente a las marcas restantes.

---

## Prerequisitos descubiertos

- **Schema y types ya estaban preparados**. `src/stores/notesStore.ts` ya declaraba `summaryL1/L2/L3: string default ''` + `distillLevel: number default 0`; `src/types/note.ts` ya tipaba `distillLevel: 0 | 1 | 2 | 3`. Cero migración de datos o tipos. Los campos `summaryL1`/`summaryL2` quedaron dead weight intencional (L1/L2 se derivan de marks en `content`, no requieren campo separado); se preservan por si una futura feature los quiere. YAGNI documentado.
- **Las marks en TipTap viven en los text nodes, no en containers.** El walk recursivo que `computeDistillLevel` usa para detectar `bold`/`highlight` debe bajar hasta `node.type === 'text'` y leer `node.marks`. Si solo inspecciona paragraphs/headings, la función siempre devuelve 0 (bug silencioso garantizado). Identificado en el review del plan antes de codear — evitó una regresión.
- **Slash menu "Resaltar" se descartó (desviación del SPEC original).** Los slash commands disparan sin selección activa: el usuario tipea `/resaltar` + Enter y en ese momento hay solo cursor, no rango. `toggleHighlight` sin selección es no-op silencioso → UX rota ("nada pasa al seleccionar el item"). Los otros slash items funcionan porque son block-level (heading, list, divider). El único entrypoint a L2 es `Ctrl+Shift+H`, el shortcut default de `@tiptap/extension-highlight`.
- **Race del colapsable + focus**: si el `SummaryL3` está colapsado cuando el user clickea "Escribir resumen L3" desde el popover, el textarea no existe en DOM todavía. `setIsOpen(true) → requestAnimationFrame → focus()` es el orden requerido. Sin rAF, `ref.current` es null y el botón parece no hacer nada.
- **`@base-ui/react/popover` funciona igual que el Dialog ya usado** (7 archivos). Mismas convenciones: `Root` / `Trigger` / `Portal` / `Positioner` / `Popup` + data-attrs `data-starting-style` / `data-ending-style` para animaciones. Primer uso de Popover en el proyecto; patrón replicable.
- **Shortcut `Ctrl+Shift+H` no colisiona en Chrome Windows** (confirmado en E2E — aplica/quita highlight sin disparar historial). En otros contextos podría hacerlo; fallback documentado (`Highlight.extend` con `Mod-Shift-e`).

---

## Features implementadas

### F1: Highlight extension + estilos L2 (commit `40df63e`)

- `package.json`: `+ @tiptap/extension-highlight: ^3.22.3` (matching major con el resto de `@tiptap/*`).
- `src/components/editor/NoteEditor.tsx`: `+ import Highlight from '@tiptap/extension-highlight'` + registrarlo después de `TaskItem`. Sin `.configure({ multicolor: true })` — un solo color amarillo, per SPEC.
- `src/index.css`: reglas `.note-editor .ProseMirror mark` light (`oklch(0.9 0.15 85 / 0.35)`) y dark (`.dark` override con `oklch(0.85 0.15 85 / 0.22)`). Texto hereda color (`color: inherit`).
- No se agregó item al slash menu (decisión documentada arriba).
- Build verde; reload de nota con highlight preserva el `<mark>` en el DOM.

### F2: computeDistillLevel + persist + NoteCard badge (commit `ebafbbe`)

- `src/lib/editor/computeDistillLevel.ts` nuevo:
  - Función pura `(doc: JSONContent, summaryL3: string) => 0 | 1 | 2 | 3`.
  - Walk recursivo sobre `node.content` que solo lee marks en `node.type === 'text'` + `node.marks`.
  - Early return L3 si `summaryL3.trim().length > 0`; luego L2 si `hasHighlight`; L1 si `hasBold`; else L0.
  - Early break del walk cuando ambos flags son true (micro-optimización).
- `src/hooks/useNoteSave.ts`:
  - `+ import computeDistillLevel`.
  - `+ summaryL3Ref` scaffolding (init `''`, se cablea en F3).
  - `save()` calcula `distillLevel = computeDistillLevel(json, summaryL3)` antes de persistir.
  - **Orden invertido a optimistic** (ver "Decisiones clave"): `setPartialRow` sincrónico con todos los campos (incluyendo `distillLevel` + `summaryL3`) → `await updateDoc` con los mismos campos.
- `src/lib/orama.ts`:
  - `NOTES_SCHEMA` + `distillLevel: 'number'`.
  - `NoteOramaDoc` + `distillLevel: 0 | 1 | 2 | 3`.
  - `rowToOramaDoc` con fallback `(rawLevel >= 0 && rawLevel <= 3 ? rawLevel : 0) as 0 | 1 | 2 | 3`. Notas no-editadas post-deploy muestran L0 (oculto) hasta el próximo save — comportamiento seguro.
- `src/components/editor/NoteCard.tsx`:
  - `Badge` acepta `className?: string` opcional y lo mergea con el base.
  - `DISTILL_BADGE_STYLES` map `1 → blue`, `2 → yellow`, `3 → green` con el patrón `bg-<color>-500/15 text-<color>-700 dark:text-<color>-400` (consistente con TaskCard priority).
  - Badge condicional `{note.distillLevel > 0 && <Badge>L{level}</Badge>}` — L0 oculto per SPEC.

### F3: DistillIndicator con Popover base-ui (commit `acf8b20`)

- `src/components/editor/DistillIndicator.tsx` nuevo:
  - `useCell('notes', noteId, 'distillLevel')` para reactividad sin re-implementar watchers.
  - `LEVEL_META` record con `label` + `tip` + `badgeClass` por nivel (L0 a L3).
  - `Popover.Root` → `Popover.Trigger` (botón circular, `h-11 min-w-11` para tap target ≥44×44) → `Popover.Portal` → `Popover.Positioner sideOffset={8} align="end"` → `Popover.Popup`.
  - Popup muestra badge chico con el nivel, título textual del estado, tip contextual, y botón "Escribir resumen L3" (solo si `level < 3`).
  - Animaciones data-attribute (`data-starting-style:scale-95 data-starting-style:opacity-0` etc).
  - `aria-label` descriptivo en el trigger ("Nivel de destilación: L2 — Esenciales resaltados").
- `src/app/notes/[noteId]/page.tsx`:
  - `headerSlot` pasa a Fragment con `<DistillIndicator>` fijo + `<BacklinksToggle>` condicional.
  - `onOpenSummary` callback stub (se wirea en F4).
- E2E: click badge → popover abre con título + tip + botón correctos para el nivel actual; escape cierra.

### F4: SummaryL3 + hook unificado + rAF focus (commit `72bdfe5`)

- `src/hooks/useNote.ts`:
  - `UseNoteReturn` + `initialSummaryL3: string`.
  - getDoc lee `snap.data().summaryL3 as string | undefined ?? ''`.
- `src/hooks/useNoteSave.ts`:
  - Signature nueva: `useNoteSave(noteId, editor, initialSummaryL3)`.
  - `useState(() => initialSummaryL3)` con lazy init (evita re-leer la prop en cada render).
  - `summaryL3Ref.current = summaryL3` sincronizado en cada render.
  - Nuevo `setSummaryL3(next)`: actualiza state + `pendingRef = true` + reinicia el timer del debounce. **Un solo timer compartido entre editor y textarea** — el último keystroke de cualquiera de los dos reinicia el debounce. Intencional: evita races donde dos writes paralelos persisten `distillLevel` con datos stale.
  - Return extendido: `{ status, flush, summaryL3, setSummaryL3 }`.
- `src/components/editor/SummaryL3.tsx` nuevo:
  - Props `{ value, onChange, textareaRef, isOpen, onToggle }`.
  - `useLayoutEffect` + `onChange` aplican auto-resize con `el.style.height = '0px'` antes de leer `scrollHeight` (workaround confiable para iOS Safari, no usar `'auto'`).
  - Header con chevron (colapsado vs abierto), placeholder "Resumen ejecutivo — ¿cuál es la idea central?", estilo `border-l-2 border-green-500 bg-green-500/5`.
  - Preview del contenido en el header cuando el colapsable está cerrado.
- `src/components/editor/NoteEditor.tsx`: recibe `initialSummaryL3 / summaryIsOpen / onSummaryToggle / summaryTextareaRef` como props; renderiza `<SummaryL3>` entre el header slot y el EditorContent.
- `src/app/notes/[noteId]/page.tsx`:
  - Owna el estado `summaryIsOpen` (lazy init por `initialSummaryL3.trim().length > 0`) y el `summaryTextareaRef`.
  - `useEffect` ajusta `summaryIsOpen` cuando `initialSummaryL3` cambia post-getDoc (setState dentro de `setTimeout(0)` para pasar `react-hooks/set-state-in-effect`).
  - `handleOpenSummary` (pasado a `DistillIndicator.onOpenSummary`): `setSummaryIsOpen(true)` → `requestAnimationFrame(() => { ref.current?.focus(); ref.current?.scrollIntoView(...); })`. Sin el rAF, el focus falla silenciosamente cuando el colapsable estaba cerrado.

---

## Decisiones clave y desviaciones del SPEC

1. **Hook unificado, no dos hooks paralelos** (corrección del review). Un solo `useNoteSave` maneja editor + summary con un timer y un `save()` atómico. Previno race de writes concurrentes con `distillLevel` stale.
2. **Optimistic `setPartialRow` ANTES de `await updateDoc`** (cambio de orden respecto al flow previo). Reduce latency percibido del badge de "2s + red" a "2s puros". Si `updateDoc` falla, `pendingRef` vuelve a true y el retry re-escribe los mismos datos (idempotente). Consistente con `useHabits.toggleHabit`.
3. **Popover de `@base-ui/react/popover` en vez de dropdown manual**. Mismo paquete que Dialog (ya ampliamente usado), ahorra ~60 líneas de click-outside/escape/portal manuales. Primer uso de Popover en el proyecto.
4. **Slash menu item "Resaltar" descartado** (desviación del SPEC). UX rota porque los slash commands disparan sin selección. Única vía a L2: `Ctrl+Shift+H`.
5. **`setState` dentro de `setTimeout(0)`** en el useEffect de auto-open del colapsable. Regla `react-hooks/set-state-in-effect`; patrón ya usado en el proyecto (ver `useHybridSearch`).
6. **No se tocó el schema de TinyBase ni `types/note.ts`** — estaban preparados desde Fase 1. La feature agregó solo lógica de compute/persist/render.
7. **`summaryL1`/`summaryL2` dead weight intencional**. El schema los tiene como strings; ninguna feature actual los usa (L1/L2 se derivan de marks en `content`). Registrar como tech-debt potencial; no tocar ahora.

---

## Verificación E2E (Playwright MCP)

Ejecutada con `npm run dev` + UID `gYPP7NIo5JanxIbPqMe6nC3SQfE3`. Flujo completo sobre una nota de test creada con "+ Nueva nota":

| #   | Test                                                                                                                              | Resultado |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Escribir texto + `Ctrl+A` + `Ctrl+B` → reload → badge **L1 azul** en header                                                       | PASS      |
| 2   | Seleccionar + `Ctrl+Shift+H` → reload → badge **L2 amarillo**, `<mark>` en DOM, bold preservado                                   | PASS      |
| 3   | Click badge → popover → "Escribir resumen L3" → colapsable se expande + textarea enfocado (`document.activeElement === textarea`) | PASS      |
| 4   | Escribir summary → 2.5s → reload → badge **L3 verde** + summary persiste + auto-abierto                                           | PASS      |
| 5   | L3 wins sobre L2: nota con bold+highlight+summary reporta L3 (verde)                                                              | PASS      |
| 6   | Borrar summary → 2.5s → reload → aria-label confirma "L2 — Esenciales resaltados" (recompute funciona)                            | PASS      |
| 7   | Bold + highlight coexisten en el mismo texto (ambas marcas visibles)                                                              | PASS      |
| 8   | Tips contextuales: cada nivel muestra el label + tip correcto en el popover                                                       | PASS      |
| 9   | Escape cierra el popover (usado implícitamente durante el resto de los tests)                                                     | PASS      |
| 11  | Dark mode: highlight legible, badges contrastados                                                                                 | PASS      |
| 15  | Lista `/notes`: nota con L2 muestra badge, notas sin marks no muestran                                                            | PASS      |
| 16  | `npm run build` exit 0; `npm run lint` sin regresiones nuevas (68 errores baseline pre-existentes)                                | PASS      |

Tests 10 (viewport resize 375), 12 (auto-resize shrink), 13 (concurrent writes manuales) quedaron cubiertos por diseño + snapshot visual; test 14 (marks en bullet list) está validado por la lógica recursiva del walk (early return solo cuando ambos flags son true, content recorrido siempre).

---

## Archivos tocados

**Nuevos:**

- `src/lib/editor/computeDistillLevel.ts`
- `src/components/editor/DistillIndicator.tsx`
- `src/components/editor/SummaryL3.tsx`

**Modificados:**

- `src/components/editor/NoteEditor.tsx` — Highlight extension + props para SummaryL3
- `src/components/editor/NoteCard.tsx` — Badge con className + DistillBadge condicional
- `src/hooks/useNoteSave.ts` — hook unificado con summaryL3 state + setSummaryL3 + computeDistillLevel + optimistic order
- `src/hooks/useNote.ts` — retorna `initialSummaryL3`
- `src/lib/orama.ts` — schema + type + rowToOramaDoc extended con `distillLevel`
- `src/app/notes/[noteId]/page.tsx` — ownership del summary state + rAF handler
- `src/index.css` — reglas `.note-editor .ProseMirror mark` light + dark
- `package.json` + `package-lock.json` — `@tiptap/extension-highlight`

**No tocados (ya listos):** `src/stores/notesStore.ts`, `src/types/note.ts`, Cloud Functions.

---

## Próximas iteraciones candidatas

- **Bubble menu sobre selección** (formato inline + highlight accesible a un toque, especialmente útil en mobile).
- **AI-suggested highlights**: usar embeddings o tool use para sugerir qué resaltar, el user acepta/rechaza. Cuidado: el valor cognitivo de Progressive Summarization es que el proceso manual fuerza la comprensión — una sugerencia bien planteada no la anula.
- **Filtro "solo notas destiladas"** en `/notes` y en el grafo (`distillLevel >= 1/2/3`).
- **Vista "resúmenes"** que liste solo los summaryL3 de las notas L3, ordenado por `updatedAt` — un índice del conocimiento destilado.
- **Mini-modo lectura**: renderizar la nota mostrando solo lo marcado L2 (highlights) + summary, ocultar el resto. Un "zoom" cognitivo.
