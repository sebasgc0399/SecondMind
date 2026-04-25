# SPEC — SecondMind · F18: Notas favoritas y eliminación

> Alcance: Activar acciones inline de favorito y eliminación en cada nota desde la lista `/notes`, con sort priorizado por favoritos y filtro opcional.
> Dependencias: F10 (capa de repos)
> Estimado: 1-2 días dev solo
> Stack relevante: shadcn/ui (`alert-dialog` sobre Base UI), TinyBase, Firestore, Tailwind v4, Lucide icons

---

## Objetivo

Permitir al usuario marcar notas como favoritas (estrella amarilla persistente) y eliminarlas con confirmación destructive desde la lista. Las favoritas se anclan al tope de la lista; las eliminadas desaparecen sin perderse físicamente (soft delete con `deletedAt`). Reemplaza el flujo actual donde la única forma de "limpiar" notas era ignorarlas.

---

## Features

### F1: Schema + repo — campo `deletedAt` y métodos toggle/soft-delete/restore

**Qué:** Extender el schema de `Note` con `deletedAt: number | null` (timestamp ms; `0` en TinyBase como sentinel de "no eliminada"). Agregar `toggleFavorite(id)`, `softDelete(id)` y `restore(id)` a `notesRepo` reusando el patrón sync→async de `tasksRepo.completeTask`.

**Criterio de done:**

- [ ] `Note` interface incluye `deletedAt: number | null` con default `null`
- [ ] `NoteRow` (TinyBase) incluye `deletedAt: number` con default `0` en `createNote` y `createFromInbox`
- [ ] `notesRepo.toggleFavorite(id)`: lee row local, flip `isFavorite`, llama `repo.update`
- [ ] `notesRepo.softDelete(id)`: setea `deletedAt: Date.now()`, llama `repo.update`
- [ ] `notesRepo.restore(id)`: setea `deletedAt: 0`, exportado pero no usado en UI esta fase
- [ ] Tests Vitest en `src/infra/repos/notesRepo.test.ts` cubren los 3 métodos (orden sync→async, valores resultantes)

**Archivos a crear/modificar:**

- [src/types/note.ts](src/types/note.ts) — agregar `deletedAt: number | null`
- [src/infra/repos/notesRepo.ts](src/infra/repos/notesRepo.ts) — agregar campo a `NoteRow`, default en `createNote` + `createFromInbox`, métodos `toggleFavorite`, `softDelete`, `restore`
- `src/infra/repos/notesRepo.test.ts` — nuevo, ~6 tests

**Notas de implementación:**

- TinyBase no soporta `null` en Cell — usar `0` como sentinel. Helper interno `isDeleted(row)` = `row.deletedAt > 0`.
- Las CFs (`autoTagNote`, `generateEmbedding`) se dispararán en cada toggle. Aceptable: ambas tienen guards (`aiProcessed`, hash de content) y el body de la nota no cambia con un toggle.
- Tests viven adyacentes al archivo (patrón ya establecido en `baseRepo.test.ts`, `tinybase.test.ts`, `useEditorPopup.test.ts`).

---

### F2: Filtrar notas eliminadas en lectura

**Qué:** Toda lectura de notas (lista, dashboard, búsqueda híbrida, Orama) debe excluir las que tienen `deletedAt > 0`. Agregar el filtro centralizado.

**Criterio de done:**

- [ ] `NoteOramaDoc` incluye `deletedAt: number` y `rowToOramaDoc` lo mapea
- [ ] `useHybridSearch.getNoteDoc` filtra `deletedAt > 0` (junto al `isArchived` actual)
- [ ] `useNoteSearch` excluye eliminadas del índice Orama o de los resultados
- [ ] `RecentNotesCard` agrega condición `deletedAt === 0` al `.filter`
- [ ] `NotesListPage` (vía `useHybridSearch`) ya hereda el filtro de F2
- [ ] Verificar que la nota eliminada no aparece en CommandPalette si lo usa

**Archivos a crear/modificar:**

- [src/lib/orama.ts](src/lib/orama.ts) — `NoteOramaDoc` + `rowToOramaDoc` + posible filtro al indexar
- [src/hooks/useHybridSearch.ts](src/hooks/useHybridSearch.ts) — filtro en `getNoteDoc`
- [src/hooks/useNoteSearch.ts](src/hooks/useNoteSearch.ts) — filtro en pipeline si aplica
- [src/components/dashboard/RecentNotesCard.tsx](src/components/dashboard/RecentNotesCard.tsx) — filtro en `.filter`

---

### F3: Confirmación destructive con shadcn `alert-dialog` sobre Base UI

**Qué:** Generar (o construir manual) un `AlertDialog` sobre `@base-ui/react` y crear wrapper reusable `<ConfirmDialog>` para destructive actions.

**Criterio de done:**

- [ ] `src/components/ui/alert-dialog.tsx` existe e importa de `@base-ui/react/alert-dialog` (NO `@radix-ui`)
- [ ] `<ConfirmDialog>` en `src/components/ui/confirm-dialog.tsx` con props `{ open, onOpenChange, title, description, confirmLabel, onConfirm, variant }`
- [ ] Variant `destructive` usa `bg-destructive` en el botón confirm
- [ ] Cierra con ESC y click fuera (default de Base UI)
- [ ] Animaciones con `data-[starting-style]` y `data-[ending-style]` (NO `animate-in/animate-out` de tw-animate-css — no aplican a Base UI)

**Archivos a crear/modificar:**

- `src/components/ui/alert-dialog.tsx` — generado por shadcn o manual
- `src/components/ui/confirm-dialog.tsx` — wrapper con API simplificada

**Notas de implementación:**

- Approach: ejecutar `npx shadcn@latest add alert-dialog` y verificar que el output importa de `@base-ui/react`. Si genera Radix, descartar y construir manual sobre los primitives de Base UI (`AlertDialog.Root`, `AlertDialog.Portal`, `AlertDialog.Backdrop`, `AlertDialog.Popup`, `AlertDialog.Title`, `AlertDialog.Description`, `AlertDialog.Close`).
- Style configurado en `components.json:3` es `base-nova` — diseñado para Base UI.
- Patrón a seguir: `src/components/ui/button.tsx` ya importa de `@base-ui/react/button`. Replicar la estructura.
- ConfirmDialog NO es específico de notas — reusable en delete project, delete task, etc.

---

### F4: NoteCard con acciones inline (estrella + papelera)

**Qué:** Rediseñar `NoteCard` para incluir cluster de 2 iconos en top-right. Estrella togglea inline; trash abre `<ConfirmDialog>`.

**Criterio de done:**

- [ ] Cluster top-right; click NO navega al detail
- [ ] Estrella: outline (`Star`) cuando `!isFavorite`, filled amber-400 cuando favorita
- [ ] Estrella visible siempre cuando favorita; hover-only cuando no favorita
- [ ] Trash siempre hover-only en desktop (`@media (hover: hover)`), siempre visible en touch
- [ ] Click en estrella o trash usa `e.preventDefault()` + `e.stopPropagation()` para no navegar
- [ ] Click en trash abre `<ConfirmDialog>` con título "¿Eliminar esta nota?" y descripción que indique que la papelera con restore llegará pronto
- [ ] Confirm llama `notesRepo.softDelete(id)`; cancel cierra el dialog
- [ ] Card desaparece inmediato al confirmar (TinyBase reactive + filtro de F2)
- [ ] `NoteOramaDoc` ahora incluye `isFavorite` (necesario para que NoteCard sepa el estado)

**Archivos a crear/modificar:**

- [src/components/editor/NoteCard.tsx](src/components/editor/NoteCard.tsx) — agregar cluster, handlers, estado de dialog
- `src/components/editor/NoteCardActions.tsx` — extraer si NoteCard pasa ~80 líneas (inline si no)
- [src/lib/orama.ts](src/lib/orama.ts) — confirmar `isFavorite` ya está en `NoteOramaDoc`; si no, agregarlo

**Notas de implementación:**

- El Link envuelve toda la card: las actions son `<button>` con `e.preventDefault(); e.stopPropagation()` en el handler.
- Hover-reveal: `group` en el `<a>`, `opacity-0 group-hover:opacity-100 motion-safe:transition-opacity` en el cluster trash. Estrella favorita NO está dentro del wrapper hover-reveal — affordance permanente.
- Estructura propuesta del cluster:
  ```tsx
  <div className="flex items-center gap-1 shrink-0">
    {isFavorite ? (
      <FilledStarButton />
    ) : (
      <OutlineStarButton className="opacity-0 group-hover:opacity-100" />
    )}
    <TrashButton className="opacity-0 group-hover:opacity-100" />
  </div>
  ```
- Mobile (sin hover): override con `@media (hover: none) { ... opacity-100 }` o usar `@media (hover: hover)` para activar el hover-reveal solo en desktop. CSS-only es preferido sobre `matchMedia` en JS.
- amber-400 (#fbbf24) — hardcodear o usar variable si existe en `src/index.css`.

---

### F5: Sort priorizado por favoritos + filtro "Solo favoritos"

**Qué:** En `/notes`, ordenar la lista con favoritos al top (descendente por `updatedAt`), no-favoritos abajo (mismo orden). Agregar toggle chip "Solo favoritos" al lado del search input.

**Criterio de done:**

- [ ] Sort estable: favoritos pinned arriba sin importar updatedAt absoluto. No-favoritos siguen el orden original
- [ ] Toggle chip "★ Solo favoritos" al lado del search; estado en `useState` local de la página
- [ ] Toggle activo: visualmente amber/filled
- [ ] Toggle activo + búsqueda: ambos filtros aplican (AND)
- [ ] Empty state diferenciado: "No tenés notas favoritas todavía" cuando filtro activo y sin resultados (regla user memory: nunca early-return el control con filtros activos)

**Archivos a crear/modificar:**

- [src/app/notes/page.tsx](src/app/notes/page.tsx) — sort + filtro + chip toggle
- `src/components/notes/FavoritesFilterChip.tsx` — chip toggle (inline si <40 líneas)

---

## Orden de implementación

1. **F1** → Schema y repo. Sin esto nada funciona.
2. **F2** → Filtrar lecturas. Antes de tocar UI, asegurar que `deletedAt > 0` excluya correctamente. Si esto falla, el delete deja la nota visible y el bug no es obvio.
3. **F3** → ConfirmDialog. Necesario antes de F4 porque trash inline depende de él.
4. **F4** → NoteCard con actions. Acá conecta todo: F1 (repo) + F3 (dialog) + UI nueva.
5. **F5** → Sort y filtro. Cosmético una vez F4 funciona; no bloqueante.

F3 podría hacerse en paralelo con F1/F2 si hay capacidad; en solo dev, secuencial es óptimo.

---

## Estructura de archivos

```
src/
├── components/
│   ├── editor/
│   │   ├── NoteCard.tsx              [modificado]
│   │   └── NoteCardActions.tsx       [nuevo, opcional]
│   ├── notes/
│   │   └── FavoritesFilterChip.tsx   [nuevo, opcional]
│   └── ui/
│       ├── alert-dialog.tsx          [nuevo, sobre @base-ui/react]
│       └── confirm-dialog.tsx        [nuevo wrapper]
├── infra/repos/
│   ├── notesRepo.ts                  [modificado]
│   └── notesRepo.test.ts             [nuevo]
├── types/
│   └── note.ts                       [modificado]
├── lib/
│   └── orama.ts                      [modificado: NoteOramaDoc + rowToOramaDoc]
├── hooks/
│   ├── useHybridSearch.ts            [modificado: filtro en getNoteDoc]
│   └── useNoteSearch.ts              [modificado: filtro en pipeline si aplica]
├── components/dashboard/
│   └── RecentNotesCard.tsx           [modificado: filtro]
└── app/notes/
    └── page.tsx                      [modificado: sort + filter + chip]
```

---

## Definiciones técnicas

### Soft delete vs hard delete vs reusar `isArchived`

- **Opciones:** (A) hard delete con confirmación, (B) soft delete con `deletedAt` nuevo, (C) soft delete reusando `isArchived`
- **Decisión:** B
- **Razón:** A pierde la opción de papelera futura sin migración de datos. C contamina la semántica de archivar (acción legítima futura distinta de eliminar). B mantiene flexibilidad: ahora "delete sin restore visible" en MVP, luego "papelera con restore" en F19 sin cambios al schema.

### `null` vs `0` como sentinel en TinyBase

- **Opciones:** (A) `deletedAt: number | null` con `null` en TinyBase, (B) `deletedAt: number` con `0` en TinyBase
- **Decisión:** B internamente, A en el dominio
- **Razón:** TinyBase Cell types no soportan `null`. El interface `Note` (dominio) expone `deletedAt: number | null`; el `NoteRow` (capa persistencia) usa `0` como sentinel. Helper `isDeleted(row)` = `row.deletedAt > 0` para encapsular.

### Ubicación del cluster de acciones en la card

- **Opciones:** (A) top-right hover-revealed, (B) inline al lado del título, (C) menú kebab `⋮` que abre dropdown
- **Decisión:** A
- **Razón:** El user lo sugirió en la screenshot (rect rojo top-right). C agrega un click extra y oculta affordance. B compite visualmente con el título. A es el patrón de Linear, GitHub Issues, Notion list.

### shadcn AlertDialog: comando vs construcción manual

- **Opciones:** (A) `npx shadcn@latest add alert-dialog` y verificar output, (B) construcción directa sobre `@base-ui/react/alert-dialog`
- **Decisión:** A primero, fallback a B
- **Razón:** Si el style `base-nova` resuelve `alert-dialog` correctamente, ahorramos la construcción. Si genera Radix (importa de `@radix-ui`), descartamos y vamos manual sobre Base UI primitives.

---

## Checklist de completado

- [ ] `npm run lint` y `npm run build` pasan sin errores
- [ ] `npm test` pasa (incluyendo tests nuevos de notesRepo)
- [ ] E2E con Playwright: usuario marca/desmarca favorito, persiste tras recarga
- [ ] E2E: usuario elimina nota, confirma dialog, card desaparece, recarga y sigue ausente
- [ ] E2E: filtro "Solo favoritos" funciona; combinado con búsqueda, ambos filtros aplican
- [ ] E2E mobile (375px): cluster de actions visible sin hover, click funciona
- [ ] La nota eliminada NO aparece en Dashboard (RecentNotesCard) ni búsqueda híbrida ni lista principal
- [ ] Verificación Firebase MCP: el doc tiene `deletedAt > 0` después del delete (no fue removido del store)
- [ ] Deploy a Hosting + smoke test en producción

---

## Siguiente fase

**F19 — Papelera con restore:** vista `/notes/trash` que lista notas con `deletedAt > 0`, acción restore (limpiar `deletedAt`), acción "eliminar definitivamente" (hard delete + cleanup de embeddings vía CF onDelete). Habilitada por F18 sin migración de datos.
