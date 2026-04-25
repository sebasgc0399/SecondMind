# SPEC — F18: Notas favoritas y eliminación (Registro de implementación)

> Estado: Completada abril 2026
> Commits: `b8db255` SPEC, `a1a19c0` F1 schema+repo+tests, `032e82c` F2 filtros lectura, `56a6d14` F3 AlertDialog+ConfirmDialog, `8dc36d7` F4 NoteCard cluster, `8328790` F5 sort+filtro favoritas, `475568a` merge a main
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

Permitir al usuario marcar notas como favoritas (estrella amarilla persistente) y eliminarlas con confirmación destructive desde la lista. Las favoritas se anclan al tope; las eliminadas desaparecen sin perderse físicamente (soft delete con `deletedAt`). Reemplaza el flujo donde la única forma de "limpiar" notas era ignorarlas.

## Qué se implementó

- **F1 — Schema + repo (`a1a19c0`):** agregado `deletedAt: number | null` al dominio `Note` (sentinel `0` en TinyBase porque Cell no soporta null). Métodos `toggleFavorite`, `softDelete`, `restore` en `notesRepo` replicando el patrón sync→async de `tasksRepo.completeTask`. 6 tests Vitest cubren orden sync→async, valores resultantes, auth guard. Archivos tocados: `src/types/note.ts`, `src/stores/notesStore.ts`, `src/infra/repos/notesRepo.ts`, `src/infra/repos/notesRepo.test.ts`.
- **F2 — Filtrar notas eliminadas en lecturas (`032e82c`):** `NoteOramaDoc` y `NOTES_SCHEMA` suman `isFavorite` + `deletedAt`. Cada consumer excluye `deletedAt > 0`: `useHybridSearch.getNoteDoc`, `useNoteSearch` (rebuild + post-search), `useGlobalSearch` (rebuild + recents), `RecentNotesCard`, `wikilink-suggestion`. Archivos tocados: `src/lib/orama.ts`, `src/hooks/useHybridSearch.ts`, `src/hooks/useNoteSearch.ts`, `src/hooks/useGlobalSearch.ts`, `src/components/dashboard/RecentNotesCard.tsx`, `src/components/editor/extensions/wikilink-suggestion.ts`.
- **F3 — AlertDialog Base UI + ConfirmDialog (`56a6d14`):** `npx shadcn@latest add alert-dialog` con style `base-nova` generó el componente sobre `@base-ui/react/alert-dialog` correctamente (no Radix). `ConfirmDialog` wrapper con API `{open, onOpenChange, title, description, confirmLabel, variant, onConfirm}` reusable más allá de notas. Archivos tocados: `src/components/ui/alert-dialog.tsx`, `src/components/ui/confirm-dialog.tsx`.
- **F4 — NoteCard con cluster estrella + papelera (`8dc36d7`):** cluster top-right con estrella (toggle inline, amber filled cuando favorita) y trash (abre `ConfirmDialog`). Buttons usan `e.preventDefault() + e.stopPropagation()` para no navegar. Hover-reveal con breakpoint Tailwind `md:` en lugar de `@media(hover:hover)` por bug detectado en E2E (ver Rondas de fix). Archivos tocados: `src/components/editor/NoteCard.tsx`.
- **F5 — Sort favoritos + filtro "Solo favoritas" (`8328790`):** sin query, las favoritas se anclan al tope (sort estable mantiene `updatedAt desc` dentro de cada grupo). Toggle chip al lado del search alterna `isFavorite`-only. Empty state diferenciado preservando controles cuando filtro activo y sin matches. Archivos tocados: `src/app/notes/page.tsx`.

## Decisiones clave

| Decisión                              | Opciones                                                                          | Elegida                      | Razón                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Estrategia de delete                  | A) hard delete con confirm, B) soft con `deletedAt` nuevo, C) reusar `isArchived` | B                            | Mantiene Archivar como acción separada futura; habilita papelera con restore en F19 sin migración de datos.                            |
| Sentinel para `deletedAt` en TinyBase | A) `null` directo, B) `0` con helper                                              | B internamente, A en dominio | TinyBase Cell types no soportan `null`. Helper `isDeleted(row) = row.deletedAt > 0` encapsula la traducción persistencia↔dominio.      |
| Ubicación del cluster en la card      | A) top-right hover-reveal, B) inline al título, C) kebab `⋮` dropdown             | A                            | Affordance descubrible sin click extra; patrón consolidado de Linear/GitHub Issues/Notion list. El user lo sugirió en la screenshot.   |
| AlertDialog: shadcn add vs manual     | A) `npx shadcn add alert-dialog` y verificar, B) construcción manual              | A primero, fallback a B      | Style `base-nova` resolvió correctamente con Base UI primitives. Ahorra reescribir el wrapper completo si el output ya es el correcto. |

## Rondas de fix

**`@media (hover: hover)` se evalúa por input device, no por viewport.** El plan inicial ocultaba el cluster con `[@media(hover:hover)]:opacity-0` para que touch siempre los viera y desktop hiciera hover-reveal. En E2E con Playwright a 375px los iconos quedaban invisibles: Chromium headless con mouse simulator reporta `(hover: hover) === true` sin importar el viewport. El media query distingue por capacidad del input primary device, no por ancho de pantalla. Fix: `md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100` (breakpoint Tailwind ≥768px). Mobile real con teclado/mouse externo también queda cubierto correctamente. Detectado solo porque la verificación E2E mobile estaba en el checklist; sin ella, el bug se hubiera filtrado a producción invisible para el usuario táctil más usuario-mouse.

## Gotchas escalados

Las lecciones operacionales de F18 viven en docs vigentes; este SPEC solo conserva la traza:

- `@media (hover: hover)` por input device, no viewport → `CLAUDE.md` "Gotchas universales".
- `npx shadcn add` con `base-nova` genera Base UI → `Spec/ESTADO-ACTUAL.md` "UI y componentes".
- TinyBase Cell sin `null` (sentinel `0` + check) → `Spec/ESTADO-ACTUAL.md` "TinyBase + Firestore sync".
- CFs disparadas en cada write incluyendo toggles de flags → `Spec/ESTADO-ACTUAL.md` "Cloud Functions > Guards y edge cases".
- `vi.mock` hoist + `import/order` con vi.mock como separador → `Spec/ESTADO-ACTUAL.md` "Patrones establecidos".

## Habilita

**F19 — Papelera con restore** sobre el campo `deletedAt` ya en producción. Sin migración: vista `/notes/trash` listando notas con `deletedAt > 0`, action restore (limpiar timestamp), action "eliminar definitivamente" (hard delete + cleanup de embeddings vía CF onDelete).
