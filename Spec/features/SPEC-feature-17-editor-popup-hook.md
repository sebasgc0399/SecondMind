# SPEC — Feature 17: useEditorPopup — Hook unificado para popups del editor

> Alcance: refactor arquitectónico del editor TipTap. Unifica los dos popups custom (`SlashMenu` para `/`, `WikilinkMenu` para `@`) bajo un único hook React `useEditorPopup` que encapsula posicionamiento (Floating UI), close-on-scroll, listener pattern y lifecycle completo. Resuelve el bug F17 (slash menu persigue al user en scroll) como propiedad emergente del refactor, no como patch.
> Dependencias: `@floating-ui/dom@^1.7.6` (ya instalado), TipTap StarterKit (slash y wikilink suggestions ya configurados). Nueva dep dev: `@testing-library/react` para tests del hook.
> Estimado: 1-2 sesiones (refactor + 2 migraciones + tests + E2E).
> Stack relevante: React 19 hooks + `@floating-ui/dom` + TipTap Suggestion API + Vitest 4.1.

---

## Objetivo

Cuando el usuario abre cualquier popup del editor (slash menu o wikilink menu) y luego scrollea el documento, el popup se cierra de inmediato — alineado con el comportamiento de Notion/Linear/Slack. Adicionalmente, ambos popups comparten una misma base de positioning vía `@floating-ui/dom` con `flip` y `shift`, eliminando la divergencia actual donde el wikilink popup queda desalineado tras scroll y el slash popup persigue al user. Beneficio meta: cualquier popup futuro del editor (autocompletado de tags, bloques de código sugeridos, etc.) hereda el comportamiento correcto al consumir el mismo hook.

---

## Features

### F1: Hook `useEditorPopup<TItem>` con lifecycle encapsulado

**Qué:** Crear un hook React genérico sobre `TItem` que encapsula toda la mecánica común a los popups del editor: mount/unmount del listener pattern, posicionamiento con Floating UI (`computePosition` + `autoUpdate` con `ancestorScroll: false`), keyboard navigation básica (ArrowUp/Down/Enter/Escape), close-on-scroll (handler `scroll` registrado en `document` con `{ capture: true, passive: true }`), y cleanup completo en unmount/onExit. Los consumidores le pasan únicamente la función `setXMenuListener` y el filtrado de items; reciben de vuelta el state listo para renderizar.

**Criterio de done:**

- [ ] El hook vive en [src/components/editor/hooks/useEditorPopup.ts](src/components/editor/hooks/useEditorPopup.ts) (directorio nuevo).
- [ ] La firma exporta `interface UseEditorPopupParams<TItem>`, `interface UseEditorPopupReturn<TItem>`, `interface PopupListener<TItem>` (genérico, reemplaza `SlashMenuListener` y `WikilinkMenuListener` específicos).
- [ ] El hook **no acepta callbacks de cleanup desde el consumer** — todo el lifecycle es interno. Esto incluye: setListener registration, autoUpdate teardown, scroll listener removal, state reset en `onExit`.
- [ ] `autoUpdate` se invoca con `{ ancestorScroll: false, elementResize: true, layoutShift: true }` — el popup se adapta a resize y layout shift pero **no se mueve en scroll**.
- [ ] Handler de scroll en `document` con `capture: true, passive: true` cierra el popup en cualquier scroll mientras está abierto. Se registra solo cuando `isOpen === true` y se limpia al cerrar.
- [ ] Keyboard nav: ArrowUp/Down navegan circularmente, Enter ejecuta el comando del item seleccionado, Escape cierra. Implementado dentro del hook como `onKeyDown` interno; el consumer no lo expone.
- [ ] Filter de items: el consumer pasa una `queryItems(query: string) => TItem[]` puramente síncrona; el hook la corre en cada `onUpdate` y guarda el resultado en `items`.
- [ ] Posicionamiento: el hook construye un `VirtualElement` con `getBoundingClientRect: () => clientRect()` (función, no snapshot — alineado con el gotcha F14 ya documentado) y lo pasa a `computePosition` + `autoUpdate`. Default `placement: 'bottom-start'`, `offset(6)`, `flip()`, `shift({ padding: 8 })` — overridables vía params.

**Archivos a crear:**

- `src/components/editor/hooks/useEditorPopup.ts` — el hook + interfaces exportadas.
- `src/components/editor/hooks/useEditorPopup.test.ts` — tests Vitest del hook (ver F4).

**Notas de implementación:**

- El hook es agnóstico al item shape — generic `<TItem>` evita acoplar a `SlashMenuItem` o `WikilinkSuggestionItem` específicos.
- El hook **NO renderiza JSX**. Devuelve `position`, `items`, `selectedIndex`, `isOpen`, etc. + un `menuRef: RefObject<HTMLDivElement | null>` que el consumer asigna al div raíz del popup. Cero acoplamiento al markup.
- `onKeyDown` del listener se sobrescribe por el hook — necesita resolver `Suggestion props.command` cuando el user hace Enter. El consumer le pasa una función `executeCommand: (item, props) => void` para inyectar la lógica de inserción.
- El hook reusa la convención del repo: `interface UseEditorPopupReturn<TItem>` con tipos explícitos — alineado con `useNoteSearch`/`useStoreInit`.
- **Por qué `document` y no `window` para el scroll listener:** los eventos `scroll` no burbujean por design del DOM. Un listener en `window.addEventListener('scroll')` SÍ atrapa scrolls de descendants, pero solamente porque `window` recibe el evento por la fase de capture. Registrar en `document` con `{ capture: true }` es semánticamente más explícito (decir "quiero atrapar scrolls de cualquier descendant durante capture phase") y robusto si el viewport scroll viene de un `<main>` interno en lugar de `<body>`. Si en E2E mobile descubrimos que el touch scroll desde `<main>` no se atrapa (edge case), fallback a `getOverflowAncestors` de `@floating-ui/dom` para registrar el listener en cada ancestor scrollable del editor.

---

### F2: Migración de `SlashMenu.tsx` al hook + cleanup del type local

**Qué:** Refactorizar `SlashMenu.tsx` para que consuma `useEditorPopup` y solo conserve la responsabilidad UI (markup + categorías agrupadas + items con icon/label/description). Eliminar el `useEffect` del listener, el `useLayoutEffect` del autoUpdate, el state local de `MenuState`, y el `position` state — todo lo absorbe el hook. En paralelo, actualizar `slash-command-suggestion.ts` para reemplazar `interface SlashMenuListener` por `import type { PopupListener } from '@/components/editor/hooks/useEditorPopup'`.

**Criterio de done:**

- [ ] `SlashMenu.tsx` reduce su tamaño aproximadamente 40-50%.
- [ ] La función `clientRect` viaja como referencia (no snapshot) — gotcha F14 preservado vía el hook.
- [ ] Comportamiento E2E idéntico: keyboard nav, click outside via TipTap, Escape, click item, ejecución del comando, agrupación por categoría.
- [ ] Bug F17 resuelto: scroll mientras menú abierto cierra el menú inmediatamente.
- [ ] `slash-command-suggestion.ts` usa `PopupListener<SlashMenuItem>` en vez de la interface local. La interface `SlashMenuListener` se elimina del archivo.
- [ ] `setSlashMenuListener` mantiene su nombre (para que el consumer lea natural) pero su firma es `setSlashMenuListener(listener: PopupListener<SlashMenuItem> | null): void`.

**Archivos a modificar:**

- `src/components/editor/menus/SlashMenu.tsx` — refactor para consumir el hook.
- `src/components/editor/extensions/slash-command-suggestion.ts` — reemplazo del type local por el genérico.

**Notas de implementación:**

- La data del item (`SlashMenuItem`) y `filterSlashMenuItems` se conservan tal cual en `slashMenuItems.ts`.
- El consumer le pasa al hook: `setListener: setSlashMenuListener`, `queryItems: filterSlashMenuItems`, `executeCommand: (item, props) => props.command(item)`.
- La agrupación visual por categoría (Texto / Listas / Bloques / Menciones / Templates) sigue siendo responsabilidad del componente — el hook solo da el array filtrado.

---

### F3: Migración de `WikilinkMenu.tsx` al hook + cleanup del type local

**Qué:** Refactorizar `WikilinkMenu.tsx` para que consuma `useEditorPopup`, eliminando el posicionamiento manual con `inline style` y conectando el popup al sistema de Floating UI con flip/shift. Resuelve el bug previo del wikilink (popup queda desalineado en scroll, sin perseguir). En paralelo, actualizar `wikilink-suggestion.ts` igual que F2: reemplazar `interface WikilinkMenuListener` por `PopupListener<WikilinkSuggestionItem>`.

**Criterio de done:**

- [ ] `WikilinkMenu.tsx` ya no calcula `top`/`left` inline — el `position` viene del hook.
- [ ] El popup ahora usa `flip()` + `shift({ padding: 8 })` — si el cursor `@` está cerca del borde inferior, el popup flipea arriba (antes era forzado a `top: rect.bottom + 6`).
- [ ] Scroll cierra el popup (mismo comportamiento que slash post-F17).
- [ ] Comportamiento E2E preservado: filtro por título, max 8 resultados, ordenadas por updatedAt desc, no archivadas, inserción correcta del wikilink `[[nota]]` al seleccionar item.
- [ ] `wikilink-suggestion.ts` usa `PopupListener<WikilinkSuggestionItem>`. La interface `WikilinkMenuListener` se elimina.
- [ ] `setWikilinkMenuListener` mantiene su nombre, firma `setWikilinkMenuListener(listener: PopupListener<WikilinkSuggestionItem> | null): void`.

**Archivos a modificar:**

- `src/components/editor/menus/WikilinkMenu.tsx` — refactor para consumir el hook.
- `src/components/editor/extensions/wikilink-suggestion.ts` — reemplazo del type local por el genérico.

**Notas de implementación:**

- El cambio de **snapshot rect** a **función rect** se absorbe en el hook (todos los popups pasan por la misma virtualización). El consumer ya no toca `clientRect`.
- La inserción del wikilink (con noteId/noteTitle attrs) sigue viviendo donde vive hoy — `executeCommand` del consumer simplemente delega a `props.command(item)` que dispara la inserción del Node.

---

### F4: Tests Vitest del hook

**Qué:** Suite de tests unitarios sobre `useEditorPopup` que cubre los 4 scenarios críticos: lifecycle del listener (registro/desregistro), filtrado de items, keyboard nav, close-on-scroll. Requiere instalar `@testing-library/react` para `renderHook`.

**Criterio de done:**

- [ ] `@testing-library/react` agregado a devDependencies (`^16.x` para React 19).
- [ ] `useEditorPopup.test.ts` con suite que pasa los 4 cases:
  - **L1 — Listener lifecycle:** mount registra el listener, unmount lo limpia, no leak entre instancias.
  - **L2 — Filtrado:** `onUpdate` con query `"foo"` → `queryItems("foo")` se invoca, resultado en `items`.
  - **L3 — Keyboard nav:** ArrowDown circula al siguiente, Enter llama `executeCommand`, Escape cierra.
  - **L4 — Close on scroll:** simular scroll en `document` con popup abierto → `isOpen === false` después.
- [ ] `npm test` verde.

**Archivos a crear:**

- `src/components/editor/hooks/useEditorPopup.test.ts`.

**Archivos a modificar:**

- `package.json` — agregar `@testing-library/react` a devDependencies.

**Notas de implementación:**

- Mock del listener registry (`setListener`) — el test usa un setter dummy y verifica que `useEditorPopup` lo invoca correctamente al mount/unmount.
- Los tests del autoUpdate de Floating UI son difíciles de hacer fielmente sin DOM real — quedan fuera de scope. La verificación del positioning va en el E2E (F5).
- Vitest environment para este test: `jsdom` (necesario para `renderHook` y para que `document.addEventListener` funcione). Si el environment global del proyecto es `node` para los tests existentes (`baseRepo.test.ts`, `tinybase.test.ts`), agregar la directiva `// @vitest-environment jsdom` al inicio del archivo.

---

### F5: E2E Playwright sobre ambos popups + bug F17 + regresión wikilink

**Qué:** Validación E2E con Playwright de ambos popups en mobile (375px) y desktop (1280px), cubriendo el escenario que origina la feature (scroll cierra menú), regresión funcional, y dos escenarios específicos pedidos en el draft del SPEC: (a) inserción correcta del wikilink post-selección, (b) touch scroll desde un `<main>` scrollable en mobile.

**Criterio de done:**

- [ ] **Slash menu desktop 1280px:** abrir con `/`, scrollear (mouse wheel) → menú se cierra. Sin scroll, keyboard nav y selección funcionan idéntico a pre-F17.
- [ ] **Wikilink menu desktop 1280px:** abrir con `@`, escribir 2-3 chars del título de una nota existente, scrollear → menú se cierra. Sin scroll, keyboard nav y selección funcionan idéntico.
- [ ] **Inserción wikilink (regresión F3):** abrir `@`, seleccionar una nota del menú con Enter o click → en el editor aparece un wikilink Node con `data-note-id` y `data-note-title` correctos, el cursor queda después del wikilink, y el siguiente char tipeado va a un text node (no dentro del wikilink). Validar que `[[título]]` se renderiza en el DOM como `<span data-note-id="..." class="...">...título...</span>`.
- [ ] **Wikilink flip arriba:** abrir `@` cerca del borde inferior del viewport con espacio insuficiente abajo → popup flipea arriba del cursor (verificar que `position.top < rect.top` en el `getBoundingClientRect` del popup). Comportamiento nuevo, no existía pre-F17.
- [ ] **Mobile 375px touch scroll desde `<main>`:** abrir `/` o `@`, simular touch scroll **dentro del `<main>` scrollable** (no del `<body>`) → menú se cierra. Si el listener en `document` con `capture: true` no atrapa este scroll por edge case, agregar listener al ancestor scrollable del editor (helper `getOverflowAncestors` de `@floating-ui/dom`) y volver a validar.
- [ ] **Regresión F14:** paste sanitization sigue funcionando (`<p style="...">` → `<p>...</p>`); padding-bottom 50vh del editor preservado.

---

## Orden de implementación

1. **F1** → fundación. Sin el hook no hay refactor. Construir aislado, sin tocar `SlashMenu`/`WikilinkMenu` todavía. Ambos popups siguen funcionando con el código actual. Incluye instalación de `@testing-library/react` (precondición para F4).
2. **F4** → tests del hook antes de migrar consumers. Cristaliza el contrato antes de que haya código en producción dependiendo de él. Si la API necesita un ajuste, sale del test; si emerge de la migración, ya es tarde.
3. **F2** → migrar slash menu. Es el más complejo (categorías, keyboard nav con groups, popup ya con Floating UI). Si rompe, F3 todavía no se tocó.
4. **F3** → migrar wikilink menu. Más simple, pero implica el cambio mayor de positioning (manual → Floating UI). Aprovecha los learnings de F2.
5. **F5** → E2E final. Cubre golden path, regresión F14 + funcional, escenarios específicos del wikilink y mobile touch scroll.

---

## Estructura de archivos

```
src/components/editor/
├── hooks/                                    ← NUEVO directorio
│   ├── useEditorPopup.ts                     ← NUEVO
│   └── useEditorPopup.test.ts                ← NUEVO
├── menus/
│   ├── SlashMenu.tsx                         ← MODIFICADO (-40-50% LoC)
│   └── WikilinkMenu.tsx                      ← MODIFICADO (-30% LoC, gana flip)
└── extensions/
    ├── slash-command-suggestion.ts           ← MODIFICADO (type → PopupListener<SlashMenuItem>)
    └── wikilink-suggestion.ts                ← MODIFICADO (type → PopupListener<WikilinkSuggestionItem>)
```

---

## Definiciones técnicas

### API exacta del hook

```typescript
import type { Placement } from '@floating-ui/dom';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';

export interface PopupListener<TItem> {
  onStart: (props: SuggestionProps<TItem>) => void;
  onUpdate: (props: SuggestionProps<TItem>) => void;
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
  onExit: () => void;
}

export interface UseEditorPopupParams<TItem> {
  setListener: (listener: PopupListener<TItem> | null) => void;
  queryItems: (query: string) => TItem[];
  executeCommand: (item: TItem, suggestionProps: SuggestionProps<TItem>) => void;
  placement?: Placement; // default 'bottom-start'
  offset?: number; // default 6
  shiftPadding?: number; // default 8
}

export interface UseEditorPopupReturn<TItem> {
  isOpen: boolean;
  items: TItem[];
  selectedIndex: number;
  position: { top: number; left: number } | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  selectItem: (item: TItem) => void;
}

export function useEditorPopup<TItem>(
  params: UseEditorPopupParams<TItem>,
): UseEditorPopupReturn<TItem>;
```

### Decisiones clave

- **Hook genérico sobre `TItem`** vs uno por popup. Genérico — el shape común es el lifecycle, no los datos. Tener `useSlashPopup` + `useWikilinkPopup` separados duplicaría todo el lifecycle y derrotaría el propósito del refactor.
- **Lifecycle 100% encapsulado** vs exponer cleanup hooks al consumer. Encapsulado — explícito por pedido del user. La filosofía: si el consumer puede olvidarse de algo, eventualmente alguien se va a olvidar y va a leakear.
- **`autoUpdate` con `ancestorScroll: false`** vs handler de scroll separado. El handler separado — `autoUpdate` con scroll true es lo que causa la persecución. Desactivar `ancestorScroll` corta la persecución, y el handler `scroll` en `document` agrega el cierre. Dos responsabilidades diferentes, dos mecanismos.
- **Close on scroll vs close on cursor off-viewport.** Close on scroll — más simple y predecible. Detectar cursor off-viewport requiere computar `getBoundingClientRect` del cursor en cada tick + comparar contra viewport, costoso y subjetivo (¿qué es "off"?). Cualquier scroll = abandoné el flujo.
- **Scroll listener en `document` capture vs `window` capture.** `document` capture — semánticamente explícito ("quiero scroll events de cualquier descendant"). `window` también funcionaría por la misma capture phase, pero `document` es más natural en el mental model. Si E2E mobile revela edge case con `<main>` scrollable, fallback a `getOverflowAncestors` de `@floating-ui/dom`.
- **Filter `queryItems` síncrono** vs async. Síncrono — todos los items actuales (slash items hardcoded, wikilink notes desde TinyBase) son in-memory. Si en el futuro hay un popup que necesite async (ej. embeddings), se extiende el hook entonces, no especulativamente ahora.
- **`PopupListener<TItem>` único** vs preservar `SlashMenuListener` y `WikilinkMenuListener` como aliases. Único — los específicos quedan como deuda visual sin agregar valor (mismo shape, distinto nombre). Eliminarlos completa la unificación a nivel tipo.
- **Tests con `@testing-library/react`** vs componente dummy. `@testing-library/react` con `renderHook` — es el patrón estándar de la industria, hace los tests legibles, y la dependencia se va a usar para futuros hooks tests del proyecto.

### Scope explícito: fuera

- BubbleToolbar (F5 — usa `<BubbleMenu>` de `@tiptap/react/menus` que abstrae Floating UI internamente — no es popup custom).
- Command Palette (Ctrl+K) — vive en su propio sistema, no usa Floating UI.
- Click-outside handler explícito — TipTap Suggestion plugin ya cierra el popup cuando el cursor sale del rango. Si en el futuro se detecta una edge case, se evalúa por separado.
- Animaciones de entrada/salida del popup — no las hay hoy, no se introducen.
- Refactor del listener registry pattern (`activeListener` module-level) — se preserva tal cual, el hook lo consume.

---

## Checklist de completado

- [ ] F1: hook + interfaces creados, lifecycle encapsulado, sin warnings TS.
- [ ] F4: tests Vitest pasan, `@testing-library/react` instalado.
- [ ] F2: SlashMenu refactorizado, comportamiento original preservado, F17 bug resuelto, type local eliminado.
- [ ] F3: WikilinkMenu refactorizado con flip dinámico, type local eliminado.
- [ ] F5: E2E Playwright pasa en mobile y desktop, incluyendo regresión wikilink y touch scroll desde `<main>`.
- [ ] `npm run lint` + `npm run build` verdes.
- [ ] Commits atómicos por sub-feature: `feat(editor): hook useEditorPopup`, `test(editor): tests del hook`, `refactor(editor): SlashMenu consume useEditorPopup`, `refactor(editor): WikilinkMenu consume useEditorPopup`.
- [ ] Merge `--no-ff` a `main`. Deploy solo-hosting (refactor 100% client-side).
- [ ] SPEC convertido a registro de implementación (step 8 SDD).

---

## Siguiente fase

Habilita futuros popups del editor (ej. autocompletado de tags `#`, sugerencias de bloques de código por lenguaje, lookup de fórmulas) con comportamiento UX consistente desde el día uno. También deja el camino preparado para agregar el click-outside handler de manera unificada si se detecta una edge case post-refactor (un solo punto de cambio en lugar de dos).
