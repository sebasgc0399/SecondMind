# SPEC — SecondMind · Feature 4: Progressive Summarization Visual

> Alcance: Implementar los 3 niveles de destilación de Tiago Forte en el editor TipTap con capas visuales distinguibles, resumen ejecutivo L3, e indicador de nivel de destilación.
> Dependencias: Features 1–3 completadas. TipTap con StarterKit (bold ya disponible).
> Estimado: 1 semana solo dev
> Stack relevante: TipTap, @tiptap/extension-highlight, React 19, TinyBase, Firestore

---

## Objetivo

El usuario abre una nota que ya escribió hace semanas. En vez de releerla entera, ve de un vistazo los pasajes clave en **bold** (L1), los más importantes resaltados en **highlight amarillo** (L2), y un resumen ejecutivo arriba (L3). El indicador "L2" en el header le dice qué tan destilada está la nota. Cada vez que revisita, puede destilar más — es acumulativo, no destructivo. El "yo del futuro" puede usar cualquier nota en 30 segundos.

---

## Contexto: Progressive Summarization (Tiago Forte)

```
L0: Nota original completa (sin marcas)
L1: Pasajes clave resaltados con bold — "¿qué es importante aquí?"
L2: Los highlights más importantes marcados con highlight — "de lo importante, ¿qué es esencial?"
L3: Resumen ejecutivo en tus propias palabras — "¿cuál es la idea central en 2 oraciones?"
```

L1 y L2 son marcas IN-CONTENT (bold y highlight sobre el texto existente). L3 es un bloque separado arriba del contenido. El `distillLevel` (0–3) se computa automáticamente de lo que existe en la nota.

---

## Features

### F1: TipTap Highlight Extension + Capas visuales L1/L2

**Qué:** Agregar la extensión `@tiptap/extension-highlight` al editor para que el usuario pueda marcar texto como L2 (highlight). L1 ya funciona con bold (StarterKit). Ajustar los estilos CSS para que ambas capas sean visualmente distinguibles y se comporten como capas acumulativas (texto puede ser bold, highlight, o ambos).

**Criterio de done:**
- [ ] `@tiptap/extension-highlight` instalado y registrado en `NoteEditor.tsx`
- [ ] Seleccionar texto + shortcut `Ctrl+Shift+H` aplica/quita highlight (toggle)
- [ ] Bold (L1) tiene estilo visual claro: `font-weight: 700` (ya funciona via StarterKit)
- [ ] Highlight (L2) tiene estilo visual: fondo amarillo sutil `bg-yellow-500/20` en dark mode, `bg-yellow-300/40` en light mode
- [ ] Texto con ambos (bold + highlight) se ve con ambas marcas simultáneamente
- [ ] Highlight aparece en el slash menu como item: `/highlight` → aplica highlight a la selección actual
- [ ] Highlight funciona en mobile (tap selección + toolbar button)
- [ ] El JSON de ProseMirror persiste el mark `highlight` correctamente (auto-save lo maneja, cero cambios en `useNoteSave`)

**Archivos a crear/modificar:**
- `src/components/editor/NoteEditor.tsx` — agregar Highlight extension a `useEditor`
- `src/components/editor/menus/slashMenuItems.ts` — agregar item "Resaltar" con ícono Highlighter
- `src/index.css` — estilos `.ProseMirror mark[data-highlight]` o `.ProseMirror .highlight` según la clase que emita la extensión

**Notas de implementación:**
`@tiptap/extension-highlight` es oficial, emite `<mark>` en el HTML del editor. El CSS default puede necesitar override para dark mode — el amarillo estándar es ilegible en fondos oscuros. Usar `color-mix` o variables del theme. La extensión soporta `multicolor: true` pero no lo necesitamos (un solo color para L2).

Shortcut: TipTap Highlight incluye `Mod-Shift-h` por default. Verificar que no colisione con otros shortcuts del editor o del browser.

---

### F2: Barra de destilación en el editor header

**Qué:** Un indicador visual en el header del editor que muestra el nivel actual de destilación (L0/L1/L2/L3) y da acceso rápido a las acciones de destilación. No es un toolbar separado — es una extensión del header existente (donde ya están ⭐ Favorito, PARA select, indicador de guardado).

**Criterio de done:**
- [ ] Indicador de nivel visible en el header del editor: badge con "L0" / "L1" / "L2" / "L3" + color progresivo
- [ ] Colores del badge: L0 = `muted` (gris), L1 = `blue-500`, L2 = `yellow-500`, L3 = `green-500`
- [ ] Tooltip en el badge explica qué significa cada nivel: "Sin destilación" / "Pasajes clave marcados" / "Esenciales resaltados" / "Resumen escrito"
- [ ] Click en el badge abre un dropdown con:
  - Estado actual (ej: "L2 — Esenciales resaltados")
  - Tip contextual: si L0 → "Selecciona y aplica bold a los pasajes clave"; si L1 → "Resalta lo esencial con Ctrl+Shift+H"; si L2 → "Escribe un resumen ejecutivo arriba"
  - Botón "Escribir resumen L3" que abre/foca el campo de resumen (F3)
- [ ] El nivel se computa automáticamente: ver F4

**Archivos a crear/modificar:**
- `src/components/editor/DistillIndicator.tsx` — nuevo: badge + dropdown
- `src/app/notes/[noteId]/page.tsx` — montar DistillIndicator en el header del editor (vía `headerSlot` o junto a los controles existentes)

**Notas de implementación:**
El dropdown puede ser un `@base-ui/react` `Popover` simple (no Dialog). El estado del nivel viene de F4 (`useDistillLevel`). Los tips contextuales guían al usuario en el flujo de destilación sin documentación — el badge mismo enseña la técnica.

---

### F3: Resumen ejecutivo L3

**Qué:** Un campo de texto colapsable encima del contenido del editor donde el usuario escribe su resumen ejecutivo en 1–3 oraciones. Representa el nivel 3 de Progressive Summarization: la destilación máxima en sus propias palabras.

**Criterio de done:**
- [ ] Campo de texto colapsable arriba del editor TipTap, visible cuando existe contenido L3 o cuando el usuario lo abre manualmente
- [ ] Placeholder: "Resumen ejecutivo — ¿cuál es la idea central?"
- [ ] Auto-save con debounce (mismo patrón que el editor: 2s inactividad)
- [ ] El resumen se guarda en el campo `summaryL3` del doc de la nota en Firestore (campo ya definido en el schema)
- [ ] TinyBase `notesStore` no almacena `summaryL3` (es contenido largo, patrón idéntico a `content`: Firestore directo)
- [ ] Colapsable: header "Resumen" con toggle chevron. Abierto por default si `summaryL3` tiene contenido, cerrado si está vacío
- [ ] Estilo visual distinguido del editor principal: borde izquierdo `border-l-2 border-green-500`, fondo `bg-green-500/5`, tipografía ligeramente más pequeña
- [ ] "Escribir resumen L3" desde el dropdown de F2 abre el campo y lo enfoca
- [ ] Mobile: campo full-width arriba del editor, colapsable

**Archivos a crear/modificar:**
- `src/components/editor/SummaryL3.tsx` — nuevo: campo de resumen colapsable
- `src/app/notes/[noteId]/page.tsx` — montar SummaryL3 arriba del NoteEditor
- `src/hooks/useNoteSave.ts` — extender para leer/escribir `summaryL3` del doc de Firestore (junto con `content`)

**Notas de implementación:**
`summaryL3` se lee en `useNote` (el `getDoc` one-shot que ya carga `content`) y se escribe en `useNoteSave` (el `updateDoc` debounced). NO es un campo de TinyBase — sigue el patrón de `content` (Firestore directo, fuera del store). El campo puede ser un `<textarea>` simple con auto-resize, no necesita TipTap — el resumen es texto plano deliberadamente (fuerza la síntesis, no la decoración).

Alternativa: usar un segundo mini-editor TipTap para el resumen. Descartada — overkill para 2–3 oraciones, agrega complejidad, y el punto del L3 es que sea conciso en texto plano.

---

### F4: Computación automática del `distillLevel`

**Qué:** Computar el nivel de destilación de la nota automáticamente basado en lo que contiene: si tiene bolds → L1, si tiene highlights → L2, si tiene summaryL3 → L3. Persistir el nivel en TinyBase + Firestore para mostrar en listados sin tener que cargar el contenido completo.

**Criterio de done:**
- [ ] `computeDistillLevel(editorJSON, summaryL3)` retorna `0 | 1 | 2 | 3`
- [ ] Lógica: L3 si `summaryL3` tiene texto, L2 si el JSON tiene marks `highlight`, L1 si el JSON tiene marks `bold`, L0 si nada de lo anterior
- [ ] El nivel más alto gana (si hay highlight pero no summary → L2; si hay summary → L3 independientemente de marks)
- [ ] `distillLevel` se persiste en `notesStore` (TinyBase) + Firestore en cada auto-save (junto con el resto de metadata)
- [ ] `NoteCard` en la lista de notas muestra el badge de distill level (L0 no se muestra, L1/L2/L3 sí)
- [ ] El badge en `NoteCard` usa los mismos colores que `DistillIndicator` (consistencia visual)
- [ ] El grafo puede usar `distillLevel` como criterio de filtro futuro (no implementar el filtro ahora, solo persistir el dato)

**Archivos a crear/modificar:**
- `src/lib/editor/computeDistillLevel.ts` — nuevo: función pura que recorre el JSON buscando marks
- `src/hooks/useNoteSave.ts` — llamar `computeDistillLevel` en cada save, persistir en `notesStore.setPartialRow` + `updateDoc`
- `src/components/editor/NoteCard.tsx` — mostrar badge L1/L2/L3 condicionalmente
- `src/stores/notesStore.ts` — verificar que `distillLevel` ya está en el schema (debería estar, ya definido en la arquitectura)

**Notas de implementación:**
`computeDistillLevel` es una función pura que recorre recursivamente el JSON del doc TipTap:
```typescript
function computeDistillLevel(doc: JSONContent, summaryL3?: string): 0 | 1 | 2 | 3 {
  if (summaryL3?.trim()) return 3;
  let hasBold = false;
  let hasHighlight = false;
  // Recorrer recursivamente doc.content buscando marks
  walk(doc, node => {
    node.marks?.forEach(mark => {
      if (mark.type === 'bold') hasBold = true;
      if (mark.type === 'highlight') hasHighlight = true;
    });
  });
  if (hasHighlight) return 2;
  if (hasBold) return 1;
  return 0;
}
```
El walk es un helper trivial (~10 líneas) que visita nodos recursivamente. Alternativa: `extractLinks` ya hace algo similar — reusar el patrón de traversal.

**Nota sobre bold:** StarterKit usa `bold` como mark type. Hay un matiz: el usuario puede usar bold para énfasis normal, no para Progressive Summarization. No hay forma de distinguir "bold de L1" vs "bold de énfasis" a nivel de marca — son el mismo mark. Esto es aceptable y coherente con cómo Tiago Forte lo describe: cualquier bold ES destilación L1. Si el usuario usa bold como estilo decorativo, el `distillLevel` reportará L1 — correcto desde la perspectiva del sistema.

---

## Orden de implementación

1. **F1** → Primero: instalar Highlight, agregar al editor, CSS. Sin esto no hay L2 visual.
2. **F4** → Segundo: la función de cómputo es pura y testeable. Integrarla en `useNoteSave` valida que el distillLevel se computa y persiste.
3. **F2** → Tercero: el indicador consume `distillLevel` del store. Necesita F4 para mostrar datos reales.
4. **F3** → Cuarto: el resumen L3 es la feature más aislada. Al tener F4 ya integrado, escribir un resumen actualiza `distillLevel` a 3 automáticamente.

---

## Estructura de archivos

```
src/
├── components/
│   └── editor/
│       ├── NoteEditor.tsx              # MOD — +Highlight extension
│       ├── DistillIndicator.tsx         # NUEVO — badge + dropdown
│       ├── SummaryL3.tsx                # NUEVO — campo resumen colapsable
│       ├── NoteCard.tsx                 # MOD — badge distill level
│       └── menus/
│           └── slashMenuItems.ts        # MOD — +item "Resaltar"
├── lib/
│   └── editor/
│       └── computeDistillLevel.ts       # NUEVO — función pura
├── hooks/
│   └── useNoteSave.ts                   # MOD — computar + persistir distillLevel, leer/escribir summaryL3
├── stores/
│   └── notesStore.ts                    # VERIFICAR — distillLevel en schema
├── app/
│   └── notes/
│       └── [noteId]/
│           └── page.tsx                 # MOD — montar DistillIndicator + SummaryL3
└── index.css                            # MOD — highlight mark styling dark/light
```

---

## Definiciones técnicas

### Estilos de las capas

| Capa | Mark TipTap | Estilo visual | Significado |
|---|---|---|---|
| L0 | ninguno | Texto normal | Sin destilar |
| L1 | `bold` | `font-weight: 700` | Pasajes clave |
| L2 | `highlight` | Fondo amarillo sutil (dark: `oklch(0.85 0.15 85 / 0.2)`, light: `oklch(0.9 0.15 85 / 0.35)`) | Lo esencial de lo importante |
| L3 | — (campo separado) | Bloque con borde verde izquierdo, fondo verde sutil | Resumen ejecutivo |

### Shortcut stack del editor

| Shortcut | Acción | Origen |
|---|---|---|
| `Ctrl+B` / `⌘B` | Toggle bold (L1) | StarterKit (existente) |
| `Ctrl+Shift+H` / `⌘⇧H` | Toggle highlight (L2) | @tiptap/extension-highlight |
| `@` | Mencionar nota | Feature 2 (existente) |
| `/` | Slash menu | Feature 2 (existente) |

### Persistencia de `summaryL3`

Sigue el patrón de `content` — Firestore directo, fuera de TinyBase:
- **Lee:** `useNote` → `getDoc` → incluir `summaryL3` en el return
- **Escribe:** `useNoteSave` → `updateDoc` → incluir `summaryL3` en el payload
- **NO en TinyBase:** vectores grandes y texto libre no van al store in-memory

`distillLevel` SÍ va en TinyBase (es un número 0–3, sirve para listados y filtros sin cargar el contenido).

### Decisión: ¿AI-assisted distillation?

Fuera de scope para esta feature. El valor de Progressive Summarization es que el proceso manual de destilar fuerza la comprensión. Automatizarlo con AI anula el beneficio cognitivo. Si se implementa después, sería como "sugerencia" (la AI propone qué resaltar, el usuario acepta/rechaza) — no como auto-distillation.

---

## Checklist de completado

Al terminar esta feature, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run build` pasa sin errores
- [ ] Seleccionar texto + `Ctrl+Shift+H` aplica highlight amarillo visible en dark mode
- [ ] Bold + highlight pueden coexistir en el mismo texto (ambas marcas)
- [ ] `/highlight` en el slash menu funciona (aplica highlight a selección)
- [ ] Badge L0/L1/L2/L3 visible en el header del editor con color progresivo
- [ ] Click en el badge muestra dropdown con estado + tip contextual
- [ ] Campo de resumen L3 visible arriba del editor (colapsable)
- [ ] Escribir un resumen → `summaryL3` persiste en Firestore → `distillLevel` sube a 3
- [ ] Aplicar bold a texto → `distillLevel` sube a 1 automáticamente
- [ ] Aplicar highlight a texto → `distillLevel` sube a 2
- [ ] `distillLevel` visible como badge en `NoteCard` en la lista de notas
- [ ] `distillLevel` persiste en TinyBase + Firestore (sobrevive a reload)
- [ ] Notas existentes sin marks reportan `distillLevel: 0` (no rompe nada)
- [ ] Mobile (375px): highlight funcional, resumen colapsable, badge visible
- [ ] Deploy a Firebase Hosting funciona

---

## Siguiente feature

Con Progressive Summarization visual, el conocimiento tiene capas de profundidad. Candidatos para la próxima iteración: AI-suggested links (la CF sugiere conexiones entre notas basadas en embeddings), `#tag` inline recognition en el editor, o distribución (code signing Windows, Play Store).
