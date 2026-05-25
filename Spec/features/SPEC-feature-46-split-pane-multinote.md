# SPEC — Feature 46: Split-pane multi-nota tipo Windows snap

> Alcance: posibilitar visualización y edición simultánea de DOS notas lado a lado en desktop (≥1024px), con handle resizable, persistencia del ratio en preferences, y prevención de races por edición de la misma nota en ambos panes.
> Dependencias: F45 (NodeView React patrón, no bloqueante), `usePreferences` (F36.F8 schema versioning), `useBreakpoint` (F35), `useNoteSave` (queue centralizado post-F10 repos).
> Stack relevante: React 19 + TipTap 3.22 + `react-resizable-panels` (nueva dep) + `@base-ui/react` 1.3 + React Router 7.14.

## Objetivo

Hasta F46 el editor de notas ocupa todo el viewport — comparar dos notas, escribir A mirando B, o reorganizar ideas entre notas requiere abrir tabs paralelos del browser (sin estado compartido del cliente — autosave, preferences, sidebar duplicados → pérdida de UX coherente y consumo de memoria 2x). F46 introduce un layout split-pane horizontal nativo: el usuario abre una segunda nota lado a lado dentro de la misma sesión, con handle resizable persistente, validación anti-conflicto (no permitir la misma nota en ambos panes), y degradación clean en tablet/mobile (single pane). El estado del split vive en URL (`?split=noteId`) — bookmarkeable, refresh-safe, share-friendly.

## Discovery (decisiones cerradas pre-SPEC)

| ID  | Decisión                                                                                            | Razón                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Estado del split en URL (`?split=noteId`) + persistencia del RATIO en preferences (no de qué notas) | Bookmarkeable, refresh-safe, share-friendly. La URL es contextual a la nota navegada — persistir notas across sesiones genera estados confusos. El ratio sí es preferencia global del user.                       |
| D2  | Prohibir la misma nota en ambos panes (validación al abrir; toast "ya está abierta")                | `useNote` es one-shot (no `onSnapshot`) y `useNoteSave` debouncing por noteId — permitir misma nota requeriría rediseñar a sync reactivo (riesgo de loops save→load + complejidad fuera de scope MVP).            |
| D3  | `react-resizable-panels` sobre custom DOM                                                           | Lib mantenida (Vercel/shadcn ecosystem), API React-idiomática, accessibility + keyboard resize built-in, persistencia API nativa. Custom resize agregaría ~80 líneas de pointer tracking sin valor diferencial.   |
| D4  | Sin snap zones (33/67, 50/50, 67/33) en MVP — drag libre con default 50/50                          | Snap requiere lógica de threshold + animación post-release. MVP valida si el feature aporta valor real; snap es polish posterior.                                                                                 |
| D5  | Único atajo MVP: `Cmd/Ctrl+\` (toggle split). Cerrar pane individual = botón X en header del pane   | `Cmd+W` colisiona con browser (cierra tab), `Cmd+]/Cmd+[` colisionan con browser history + TipTap indent. Focus entre panes = click directo. Shortcuts de focus se evalúan post-MVP si emerge fricción.           |
| D6  | Solo desktop (≥1024px). Tablet/mobile ignoran `?split=`, renderizan single pane                     | Espacio horizontal en tablet (768-1023px) genera panes <500px cada uno — incómodos para edición. Mobile sin chance. Botón split hidden en <1024px.                                                                |
| D7  | NO bumpear `PREFERENCES_SCHEMA_VERSION` al agregar `splitPaneRatio` (campo aditivo opcional)        | Bumpear purga preferences existentes (gotcha F36.F8). `splitPaneRatio?: number` con default `?? 0.5` en el getter evita migración y preserva otras prefs del user (sidebarHidden, distillIntroSeen, etc.).        |
| D8  | Modal del picker con `@base-ui/react/dialog` directo (sin wrapper shadcn)                           | Consistente con patrón F45 (`@base-ui/react/select` directo). `src/components/ui/` no tiene Dialog base-ui (solo alert-dialog Radix). Evita crear wrapper temprano sin segundo caller que justifique abstracción. |

## Features

### F46.1 — Hook `useSplitPanes` + sync URL ↔ state ↔ preferences

**Qué:** hook centralizado que gestiona el state del split (qué nota a la izquierda, cuál a la derecha, ratio), sincronizado bidireccionalmente con `?split=noteId` query param y con `UserPreferences.splitPaneRatio`. Expone API ergonómica para los componentes de layout y los handlers de atajo.

**Criterio de done:**

- [ ] `useSplitPanes(currentNoteId: string)` retorna `{ leftNoteId, rightNoteId, ratio, isOpen, openSplit(noteId), closeSplit(side?: 'left'|'right'), setRatio(value) }`
- [ ] Al navegar a `/notes/X?split=Y`: `leftNoteId === 'X'`, `rightNoteId === 'Y'`, `isOpen === true`
- [ ] `openSplit(Y)` actualiza URL a `/notes/X?split=Y` vía `setSearchParams`
- [ ] `closeSplit('right')` elimina `?split=` de la URL
- [ ] `closeSplit('left')` navega a `/notes/Y` (right se promueve a principal)
- [ ] `setRatio(0.6)` actualiza state local Y persiste con debounce 500ms a `preferences.splitPaneRatio`
- [ ] Intentar `openSplit(X)` cuando `currentNoteId === X` retorna sin efecto + emite toast "Esta nota ya está abierta"
- [ ] Hook tolerante a `?split=` con noteId inexistente: expone `rightStatus: 'loading' | 'ready' | 'not-found'` para que el consumidor renderice feedback (skeleton mientras valida, mensaje de error si no existe). Auto-cierre tras 5s si `not-found` persiste sin acción del usuario

**Archivos:**

- `src/hooks/useSplitPanes.ts` — nuevo
- `src/types/preferences.ts` — agregar `splitPaneRatio?: number` opcional al interface `UserPreferences`
- `src/lib/preferences.ts` — agregar default getter `splitPaneRatio: persisted?.splitPaneRatio ?? 0.5` (sin bumpear `PREFERENCES_SCHEMA_VERSION`, ver D7)

**Notas:**

- Toast vía `sonner` (ya en uso). Mensaje consistente con tono UX del resto del proyecto ("Esta nota ya está abierta en el otro panel").
- Ratio debounced 500ms para no escribir a Firestore en cada `pointermove` del handle (decenas/segundo).
- Validación de noteId inexistente: leer del store TinyBase `notesStore.getRow('notes', noteId)`. Durante los primeros 500ms post-mount, `rightStatus === 'loading'` (TinyBase puede estar hidratando — evita falso positivo). Después, si la fila sigue vacía → `rightStatus === 'not-found'`. El consumidor (`SplitPaneLayout`) decide qué render mostrar — el hook no toca DOM ni cierra por sí solo el split inmediatamente; solo dispara auto-cierre con timer de 5s si el user no actúa.

---

### F46.2 — Componente `SplitPaneLayout` con `react-resizable-panels` (desktop-only gate)

**Qué:** componente contenedor que envuelve el contenido de `NoteDetailPage`. Cuando `isOpen === false` o breakpoint ≠ desktop, renderiza un solo `<NoteEditor>` (pass-through equivalente al comportamiento actual). Cuando `isOpen === true` Y breakpoint === 'desktop', renderiza `PanelGroup` horizontal con dos `<NoteEditor>`, handle al centro, ratio inicial desde `useSplitPanes`.

**Criterio de done:**

- [ ] Sin split o en tablet/mobile: layout idéntico al actual (single pane), sin overhead de mount de `react-resizable-panels`
- [ ] Con split en desktop ≥1024px: dos `<NoteEditor>` montados en paralelo, handle vertical drag-friendly entre ellos
- [ ] Drag del handle ajusta el ancho relativo en tiempo real (sin lag perceptible)
- [ ] Al soltar el handle, el nuevo ratio se persiste vía `setRatio` (debounced)
- [ ] Min size por pane: 30% (handle no permite reducir un pane debajo de eso)
- [ ] Cambio de breakpoint cross-thresh (resize desktop→tablet) cierra el split visualmente sin perder la URL (`?split=` persiste para cuando vuelvan a desktop)
- [ ] Cada `<NoteEditor>` recibe SU propio `noteId` y SU propia `key` para forzar re-mount al cambiar de nota en el pane
- [ ] Pane derecho con `rightStatus === 'loading'` renderiza skeleton (placeholder con altura equivalente al editor, sin spinner — gotcha CLAUDE.md "skeleton siempre"). Con `rightStatus === 'not-found'` renderiza componente vacío centrado con mensaje "Nota no encontrada" + botón "Cerrar panel" que ejecuta `closeSplit('right')`

**Archivos:**

- `src/components/notes/SplitPaneLayout.tsx` — nuevo (~120 líneas)
- `src/app/notes/[noteId]/page.tsx` — refactor para envolver el editor en `SplitPaneLayout` (confirmado via Glob: existen también `src/app/notes/page.tsx` lista y `src/app/notes/graph/page.tsx` grafo, ninguno se toca en F46)
- `package.json` — `react-resizable-panels` (verificar versión actual con context7 antes de instalar; estable mainstream `^2.x`)

**Notas:**

- `<PanelGroup direction="horizontal" autoSaveId={null}>` — no usar `autoSaveId` (la persistencia la maneja `useSplitPanes` vía preferences, no localStorage de la lib).
- `<Panel defaultSize={ratio * 100} minSize={30}>` + `<Panel defaultSize={(1-ratio) * 100} minSize={30}>` con `<PanelResizeHandle>` entre medio.
- Handle styling: barra de 4px de ancho con `bg-border` + `hover:bg-primary/30 transition-colors` + cursor `col-resize`.
- Verificar con context7 (`use context7` en prompt) la API exacta y eventos (`onResize`, `onLayout`) antes de codear.

---

### F46.3 — Header de pane con botón cerrar (solo cuando hay split activo)

**Qué:** cada pane (cuando `isOpen === true`) muestra un header sutil arriba con título de la nota + botón X para cerrar ESE pane específico. Cuando no hay split, el header NO aparece (el editor mantiene su layout actual sin header extra del contenedor).

**Criterio de done:**

- [ ] Header visible solo cuando `isOpen === true` (single pane mode sin header de contenedor)
- [ ] Cada header muestra el `title` de la nota (truncado con `min-w-0 flex-1 truncate` — gotcha CLAUDE.md)
- [ ] Botón X a la derecha de cada header con `aria-label="Cerrar este panel"`
- [ ] Click en X del pane derecho: ejecuta `closeSplit('right')` → URL pierde `?split=`
- [ ] Click en X del pane izquierdo: ejecuta `closeSplit('left')` → URL navega a `/notes/{rightNoteId}`
- [ ] Tooltip al hover del botón X: "Cerrar panel"
- [ ] Altura del header ≤40px para no robar espacio vertical al editor

**Archivos:**

- `src/components/notes/SplitPaneHeader.tsx` — nuevo
- `src/components/notes/SplitPaneLayout.tsx` — integrar `<SplitPaneHeader>` arriba de cada `<NoteEditor>`

**Notas:**

- Header del SplitPane es del CONTENEDOR (representa "este es el pane X"), distinto del header interno del `NoteEditor` (toggle summary, etc.). Coexisten sin colisión.
- Título de la nota: leer reactivo vía `useCell('notes', noteId, 'title')` (patrón TinyBase canónico, no leer del store directo).

---

### F46.4 — Picker modal `SplitPanePicker` para elegir segunda nota

**Qué:** modal con search input + lista de notas filtrables, abierto via atajo `Cmd/Ctrl+\` (cuando no hay split) o via botón del TopBar (F46.5). Excluye de la lista la nota ya abierta en el pane izquierdo. Al click en una nota, ejecuta `openSplit(noteId)` y cierra el modal.

**Criterio de done:**

- [ ] Modal con backdrop `bg-background/80 backdrop-blur-sm` y panel centrado (max-w-lg)
- [ ] Input de search arriba con autofocus al abrir, placeholder "Buscar nota para abrir lado a lado..."
- [ ] Lista debajo con notas filtradas por título (case-insensitive `includes`) — sin necesidad de Orama FTS para MVP
- [ ] La nota actual del pane izquierdo NO aparece en la lista (filtrada por `noteId !== currentNoteId`)
- [ ] Click en item: ejecuta `openSplit(noteId)` + cierra modal
- [ ] Esc o click en backdrop: cierra modal sin acción
- [ ] Atajo `Cmd/Ctrl+\` abre el modal SI NO hay split activo
- [ ] Atajo `Cmd/Ctrl+\` cierra el split SI hay split activo (delega a `closeSplit('right')`)
- [ ] Solo activo en desktop ≥1024px (atajo ignorado en <1024px)

**Archivos:**

- `src/components/notes/SplitPanePicker.tsx` — nuevo
- `src/hooks/useSplitPaneShortcut.ts` — nuevo (sigue patrón de `useSidebarVisibilityShortcut.ts:14-50`)

**Notas:**

- Componente con `@base-ui/react/dialog` directo (sin wrapper shadcn, ver D8). API: `Dialog.Root open={...} onOpenChange={...}` + `Portal/Backdrop/Popup`.
- Guards del shortcut idénticos a `useSidebarVisibilityShortcut`: no disparar si foco está en input/textarea/contenteditable, auth check, breakpoint check.
- Para search performance con >500 notas, evaluar Orama (ya en stack); para MVP, `includes` sobre `notesStore.getRowIds()` mapeado a `{ id, title }` es suficiente (<1ms en sets razonables).

---

### F46.5 — Botón "Split" en TopBar (UX de discovery)

**Qué:** botón discreto en TopBar que sirve de trigger UI alternativo al atajo. Visible solo en desktop ≥1024px. Cambia de apariencia según el estado del split.

**Criterio de done:**

- [ ] Botón visible en `<TopBar>` (que ya solo aparece con sidebar oculta en desktop)
- [ ] Sin split: icono `PanelRightOpen` (lucide-react) + label "Dividir" + tooltip "Abrir nota lado a lado (Cmd+\\)"
- [ ] Con split: icono `PanelRightClose` + label "Cerrar split" + tooltip "Cerrar panel derecho (Cmd+\\)"
- [ ] Click sin split: dispara la apertura del picker (idéntico a `Cmd+\`)
- [ ] Click con split: ejecuta `closeSplit('right')`
- [ ] Hidden en breakpoints <1024px (no renderizado, sin clases `hidden md:flex` — directamente no se monta)

**Archivos:**

- `src/components/layout/TopBar.tsx` — agregar el botón en la zona de actions

**Notas:**

- Mantener visualmente sutil — no compitir con CommandPalette ni breadcrumbs. Estilo `variant="ghost" size="icon"` con tooltip.
- Verificar que `<TopBar>` ya tiene zona de actions o agregar slot. Si no existe, agregar `<div className="ml-auto flex items-center gap-2">` al final.
- **Limitación aceptada para MVP:** `<TopBar>` solo se renderiza cuando la sidebar está oculta (desktop con `sidebarHidden === true`, ver `src/app/layout.tsx:58`). Por lo tanto el botón Split **NO es visible cuando el user tiene la sidebar abierta** — el atajo `Cmd+\` sigue siendo el trigger universal en ese caso. Post-MVP, si emerge fricción de discovery, mover el botón a un slot siempre visible (sidebar header o breadcrumbs area).

---

## Orden de implementación

1. **F46.1** — base de todo (state, URL sync, preferences). Sin esto los componentes no tienen API que consumir.
2. **F46.2** — `SplitPaneLayout` con `react-resizable-panels`. Una vez funcional, se puede testear manualmente navegando a `/notes/X?split=Y` aunque la UI aún no tenga trigger.
3. **F46.3** — header con botón cerrar. Cierra el ciclo visual mínimo del split (abrir manual via URL, cerrar via UI).
4. **F46.4** — picker + atajo `Cmd+\`. Habilita el trigger UX principal.
5. **F46.5** — botón TopBar. Discoverability incremental, dependiente del picker (F46.4) ya funcional.

## Estructura de archivos nuevos

```
src/
├── components/
│   ├── notes/                          # carpeta nueva si no existe
│   │   ├── SplitPaneLayout.tsx         # F46.2
│   │   ├── SplitPaneHeader.tsx         # F46.3
│   │   └── SplitPanePicker.tsx         # F46.4
│   └── layout/
│       └── TopBar.tsx                  # F46.5 (modificación)
├── hooks/
│   ├── useSplitPanes.ts                # F46.1
│   └── useSplitPaneShortcut.ts         # F46.4
├── types/
│   └── preferences.ts                  # F46.1 (modificación)
├── lib/
│   └── preferences.ts                  # F46.1 (modificación)
└── app/notes/                          # F46.2 (modificación de la page existente)

package.json                            # F46.2 (+react-resizable-panels)
```

## Checklist global de cierre F46

Al terminar TODAS las features anteriores, todas estas condiciones deben ser verdaderas:

- [ ] `npm run build` OK sin errores TypeScript
- [ ] `npm run lint` limpio sobre los archivos nuevos/modificados (hook PostToolUse Prettier+ESLint --fix corre auto)
- [ ] E2E Playwright en desktop (1280×800):
  - [ ] Navegar a `/notes/X` (sin split): layout sin regresión vs main
  - [ ] `Cmd+\` abre picker → seleccionar nota Y → URL pasa a `/notes/X?split=Y` y ambos panes montan
  - [ ] Drag del handle ~30% → al soltar, recargar → ratio persistido
  - [ ] Botón X del pane derecho → URL pierde `?split=`, layout vuelve a single
  - [ ] Botón X del pane izquierdo → URL pasa a `/notes/Y`, pane derecho promovido
  - [ ] Intentar abrir misma nota en split → toast "ya está abierta", no se abre split
  - [ ] Editar simultáneamente notas distintas en ambos panes → autosave OK en ambos sin race
  - [ ] Navegar a `/notes/X?split=noteIdInexistente` → pane derecho muestra skeleton inicial y luego mensaje "Nota no encontrada" con botón cerrar
- [ ] E2E Playwright en tablet (768×1024) y mobile (375×667): `?split=Y` ignorado visualmente, single pane funcional, sin botón "Split" en TopBar (verificar ambos viewports con `browser_resize`)
- [ ] Bundle delta razonable: `react-resizable-panels` ~5-10 kB gz esperado (verificar con `npm run build` + chequear tamaño de chunks)
- [ ] Verificación context7 hecha sobre `react-resizable-panels` API antes de codear F46.2 (versión actual + breaking changes desde último mainstream)
- [ ] Sin warnings en consola del browser durante operación normal (split open/close/resize)

## Riesgos identificados

| Riesgo                                                                                             | Mitigación                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `react-resizable-panels` no soporta `direction="horizontal"` con dynamic mount/unmount limpio      | Validar en F46.2 con un caso de `closeSplit` rápido; si emerge issue, key-based remount del `PanelGroup` completo           |
| Dos `<NoteEditor>` paralelos generan picos de memoria por dos instancias TipTap + ProseMirror docs | Aceptable (cada doc TipTap ~1-2 MB heap). Monitor en QA; si >100 MB para 2 notas medianas, evaluar virtualization posterior |
| El gotcha `min-w-0 flex-1 truncate` aplica al título del header — riesgo de overflow si se omite   | Codeado explícitamente en F46.3 criterio + nota                                                                             |
| Bumpear sin querer `PREFERENCES_SCHEMA_VERSION` por reflex purga preferences (gotcha F36.F8)       | D7 explícito en discovery + nota en F46.1                                                                                   |
| El atajo `Cmd+\` colisiona con algún uso futuro del editor (TipTap tiene `Mod-\` para clearMarks)  | Validar en F46.4 con TipTap docs (context7); si conflicto, override en el guard del shortcut o cambiar a `Cmd+Shift+\`      |

## Siguiente fase (no incluido en F46)

Post-MVP, evaluables si la métrica de uso lo justifica:

- Shortcuts de focus entre panes (`Cmd+]/Cmd+[` o alternativos sin colisión browser).
- Snap zones (33/67, 50/50, 67/33) con animación al soltar cerca de esos thresholds.
- Soporte tablet con 50/50 fijo (sin resize handle).
- Permitir la misma nota en ambos panes (requiere rediseñar `useNote` a `onSnapshot` reactivo + protección anti-loop save→load).
- Drag desde sidebar a la zona derecha del editor como trigger alternativo (drop zone + UX explícita).
- Triple pane o más (improbable — split horizontal con 3 panes en <1920px es incómodo).
