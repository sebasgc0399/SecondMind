# SPEC — SecondMind · Fase 1: MVP — Captura + Notas + Links (Completada)

> Registro de lo implementado en la primera versión usable del producto.
> Completada: Abril 2026

---

## Objetivo

Primera versión usable diariamente: el usuario abre SecondMind y puede capturar una idea con `Alt+N` en menos de 3 segundos, escribir notas atómicas con `[[wikilinks]]` que generan links bidireccionales automáticamente, ver backlinks en un panel lateral, buscar notas instantáneamente con FTS, procesar el inbox manualmente, y ver un dashboard con inbox pendiente + notas recientes. Reemplaza la captura y las notas del Segundo Cerebro de Notion.

---

## Features implementadas

### F1: React Router — Navegación base

React Router con `createBrowserRouter` en `src/app/router.tsx`. Layout compartido con Sidebar + `<Outlet />` en `src/app/layout.tsx` (guarda auth y muestra "Cargando..." mientras `useAuth` resuelve). Rutas `/`, `/inbox`, `/notes`, `/notes/:noteId`, `/settings`, `/login`, fallback 404. Sidebar usa `NavLink` y resalta el item activo automáticamente.

### F2: TinyBase stores — Notas, Links, Inbox

Schemas completos en `notesStore`, `linksStore` e `inboxStore` con todos los campos del dominio (ver `Docs/01-arquitectura-hibrida-progresiva.md` sección 3). Persister refactorizado a factory `createFirestorePersister({ store, collectionPath, tableName })` reutilizable para los 3 stores. Helpers `parseIds`/`stringifyIds` para arrays serializados como JSON strings. Types en `src/types/{note,link,inbox}.ts`. El campo `content` de notas (TipTap JSON) se mantiene fuera del schema de TinyBase — va directo a Firestore.

### F3: Quick Capture — Modal global

Modal con `@base-ui/react/dialog` accesible desde cualquier ruta via shortcut global `Alt+N`. El textarea se enfoca automáticamente al abrir. Enter guarda como `InboxItem` en `inboxStore.setRow` con `source: 'quick-capture'`, `status: 'pending'` y cierra con animación de check `lucide-react:Check` durante 300ms. Shift+Enter inserta línea, Escape cierra sin guardar. El shortcut keyboard listener vive en `QuickCaptureProvider`, registrado via `useEffect` con cleanup.

### F4: TipTap Editor — Nota atómica con WikiLinks

Editor TipTap en `/notes/:noteId` con `StarterKit` + `Placeholder` + Node custom `wikilink`. `useNote` carga content desde Firestore vía `getDoc` one-shot (sin `onSnapshot` para evitar loops save/load). `useNoteSave` corre `editor.on('update')` → debounce `AUTOSAVE_DEBOUNCE_MS = 2000` → `updateDoc` del `content` (JSON stringificado) + `contentPlain` + `title` (primera línea del plain text) + `updatedAt`, luego `notesStore.setPartialRow` con la metadata. Autocompletado al escribir `[[` usa `@tiptap/suggestion` con `char: '[['` directo. Popup renderizado con `createPortal` + virtual anchor construido del `clientRect()` — sin tippy.js. Click en wikilink navega vía event delegation en el wrapper del editor (detecta `data-note-id`). Indicador `Guardando...` / `✓ Guardado` / `Sin cambios` en el header del editor. Flush on unmount si hay cambios pendientes.

### F5: Sync de links bidireccionales

`syncLinks` util (`src/lib/editor/syncLinks.ts`) llamada desde `useNoteSave` después del `updateDoc` del content. Diff entre `extractLinks(editor.getJSON())` y los links existentes del `linksStore` filtrados por `sourceId`. Link IDs determinísticos `${sourceId}__${targetId}` para dedup trivial. Self-links (`targetId === sourceId`) se filtran antes del write. `setDoc` para creates, `deleteDoc` para removes, en paralelo. `incomingLinkIds` de los targets afectados se actualiza con `notesStore.setPartialRow` (el persister propaga a Firestore con `merge: true`). Retorna `{ outgoingLinkIds, linkCount }` que `useNoteSave` escribe junto al resto de metadata. Last-write-wins sin manejar conflictos concurrentes. Hook `useBacklinks` expuesto para F7.

### F6: Lista de notas con búsqueda

Vista `/notes` con FTS client-side vía Orama. `src/lib/orama.ts` define el schema + helper `rowToOramaDoc`. `useNoteSearch` crea un índice Orama en `useRef`, hace `insertMultiple` inicial desde `notesStore`, y re-indexa con full rebuild en cada `addTableListener('notes')` (~50ms para ~100 notas, más simple que incremental). Search restringido a `title + contentPlain` con `limit: 50`. Sin query: ordena por `updatedAt desc` desde TinyBase directo. Con query: ordena por relevancia BM25. `NoteCard` muestra título + snippet + badges (noteType/paraType) + linkCount + fecha relativa. Botón "Nueva nota" genera `crypto.randomUUID()`, escribe a Firestore con `setDoc` primero (await), luego `notesStore.setRow`, luego `navigate`. Empty states diferentes para sin query / sin resultados / sin notas todavía. Skeleton con grace period 200ms al mount.

### F7: BacklinksPanel lateral

`BacklinksPanel` en `/notes/:noteId` que consume `useBacklinks(noteId)` y lista los backlinks con `<Link to={/notes/${sourceId}}>`. Cada item muestra `sourceTitle` (fresco desde `notesStore`, no stale del cache `links/`) + `context` (snippet del párrafo del link, line-clamp-2). Header con "Backlinks (N)" + botón close. Empty state "Sin backlinks aún". Layout flex responsivo en la page: `flex-col` en mobile + `lg:flex-row` en desktop (panel 288px fijo). Estado inicial `isPanelOpen` computado con `window.matchMedia('(min-width: 1024px)')` — default abierto en lg+, cerrado en mobile. `BacklinksToggle` pill aparece en el `headerSlot` del `NoteEditor` cuando el panel está cerrado. `useBacklinks` extendido con join `useTable('notes')` para resolver `sourceTitle` fresco in-memory. `NoteEditor` acepta nueva prop opcional `headerSlot?: React.ReactNode`.

### F8: Vista de Inbox

Vista `/inbox` con lista de items `status === 'pending'` ordenados por `createdAt desc`. `useInbox` expone `{ items, isInitializing, convertToNote, dismiss }`. `usePendingInboxCount` separado para el Sidebar (evita re-render del sidebar en cada cambio de contenido del inbox). `convertToNote(itemId)` genera `crypto.randomUUID()`, construye un TipTap JSON doc donde cada línea del `rawContent` es un paragraph, hace `setDoc` a Firestore + `setRow` en TinyBase, marca el item como `status: 'processed'` con `processedAs: { type: 'note', resultId }`, y navega al editor. `dismiss(itemId)` marca como `'dismissed'`. Items nunca se borran físicamente — preserva historial. `InboxItemCard` muestra rawContent con `whitespace-pre-wrap`, source badge, fecha relativa, botones "Nota" (FileText) y "Descartar" (Trash2). Sidebar agrega badge reactivo `ml-auto` con el count cuando `pendingInboxCount > 0`. Empty state "Inbox limpio 🎉" con tip de `Alt+N`.

### F9: Dashboard mínimo

Dashboard `/` con 4 componentes en `src/components/dashboard/`: `Greeting` (saludo dinámico según hora del día + primer nombre del `user.displayName`), `QuickCaptureButton` (wrapper de `useQuickCapture().open` con kbd hint `Alt+N`), `InboxCard` (reusa `useInbox().items.slice(0, 3)`, link "Procesar →" a `/inbox`), `RecentNotesCard` (lee `useTable('notes')` directo sin Orama — overkill para 5 filas, ordena por `updatedAt desc`, filtra archivadas, reusa `rowToOramaDoc` para el shape display, link "Ver todas →" a `/notes`). Layout grid `lg:grid-cols-2` (stack en mobile). Skeleton independiente por card con grace 200ms. Empty states inline por card — sin Tareas/Proyectos/Objetivos/Hábitos (Fase 2) ni Daily Digest (Fase 4).

---

## Decisiones técnicas que cambiaron vs lo planeado

| Planeado                                                                  | Implementado                                                               | Razón                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick Capture shortcut `Ctrl+Shift+N`                                     | `Alt+N`                                                                    | `Ctrl+Shift+N` choca con "Nueva ventana de incógnito" de Chrome y otros bindings del sistema. `Alt+N` queda libre y es memorable                                                                                              |
| Persister TinyBase con `setDoc(ref, row)`                                 | `setDoc(ref, row, { merge: true })`                                        | Fix crítico descubierto testing F4. Sin merge, el persister borraba el campo `content` (escrito por `useNoteSave.updateDoc`) en cada sync de metadata. Ahora los campos fuera del schema de TinyBase sobreviven al round-trip |
| Popup de wikilinks con `tippy.js` (según docs oficiales de TipTap)        | `createPortal` + virtual anchor del `clientRect()` + listener module-level | `tippy.js` habría sido una dep extra y un segundo portal system. El proyecto ya usa `@base-ui/react` — se implementó el puente entre Suggestion plugin y React state con ~30 líneas, sin deps nuevas                          |
| `char: '[['` con fallback a `findSuggestionMatch` custom                  | `char: '[['` directo                                                       | TipTap v3 acepta strings multi-char en el campo `char` del plugin Suggestion sin workarounds. El fallback regex quedó innecesario                                                                                             |
| Fresh `sourceTitle` en backlinks — backfill con Cloud Function (post-MVP) | Join in-memory con `useTable('notes')` dentro de `useBacklinks`            | F7 descubrió que el problema se resuelve en UI sin tocar los docs cacheados de `links/`. Cero infra backend, cero stale titles, reactivo a cambios del source title                                                           |
| `syncLinks` sin filtro de self-links                                      | Filtro explícito `targetId !== sourceId` al inicio del diff                | Se detectó durante la revisión del plan de F5. Una nota con `[[titulo-propio]]` poluye el grafo sin valor semántico. Filtro agregado antes del write                                                                          |
| `formatRelative` inline en `NoteCard`                                     | Lift a `src/lib/formatDate.ts` reutilizado por `InboxItem` y `dashboard/*` | F8 necesitó la misma función. Una función compartida con Intl.RelativeTimeFormat nativo evita duplicación sin deps                                                                                                            |
| Orama sync incremental (`update`/`remove` por row)                        | Full rebuild del índice on `addTableListener`                              | Full rebuild es <50ms para ~100 notas y evita edge cases de detección de deletes. Más simple, correcto, y aceptable para MVP — se puede optimizar si el corpus crece >1k                                                      |

---

## Archivos creados — por feature

**F1 — Router:**

- `src/app/router.tsx`, `src/app/layout.tsx`, `src/app/not-found.tsx`
- `src/app/inbox/page.tsx`, `src/app/notes/page.tsx`, `src/app/notes/[noteId]/page.tsx`, `src/app/settings/page.tsx` (inicialmente placeholders, algunos sobreescritos en fases posteriores)

**F2 — Stores:**

- `src/stores/linksStore.ts`, `src/stores/inboxStore.ts`
- `src/types/note.ts`, `src/types/link.ts`, `src/types/inbox.ts`
- `src/stores/notesStore.ts` — ampliado con schema completo
- `src/lib/tinybase.ts` — refactor a factory `createFirestorePersister` + helpers
- `src/hooks/useStoreInit.ts`

**F3 — Quick Capture:**

- `src/components/capture/QuickCapture.tsx`, `src/components/capture/QuickCaptureProvider.tsx`
- `src/hooks/useQuickCapture.ts`

**F4 — Editor TipTap:**

- `src/components/editor/NoteEditor.tsx`
- `src/components/editor/extensions/wikilink.ts`, `src/components/editor/extensions/wikilink-suggestion.ts`
- `src/components/editor/menus/WikilinkMenu.tsx`
- `src/hooks/useNote.ts`, `src/hooks/useNoteSave.ts`
- `src/lib/editor/extractLinks.ts`
- Estilos ProseMirror + `.wikilink` agregados a `src/index.css`

**F5 — Sync de links:**

- `src/lib/editor/syncLinks.ts`
- `src/hooks/useBacklinks.ts`

**F6 — Lista de notas + búsqueda:**

- `src/lib/orama.ts`, `src/hooks/useNoteSearch.ts`
- `src/components/editor/NoteCard.tsx`
- `src/app/notes/page.tsx` — sobrescrito con lista completa

**F7 — Backlinks panel:**

- `src/components/editor/BacklinksPanel.tsx` (exporta también `BacklinksToggle`)
- `src/components/editor/NoteEditor.tsx` — extendido con prop `headerSlot`
- `src/app/notes/[noteId]/page.tsx` — refactor con layout flex responsivo + state `isPanelOpen`
- `src/hooks/useBacklinks.ts` — extendido con join a `notesTable`

**F8 — Inbox:**

- `src/hooks/useInbox.ts` (exporta también `usePendingInboxCount`)
- `src/components/capture/InboxItem.tsx`
- `src/lib/formatDate.ts` (lifted desde `NoteCard`)
- `src/app/inbox/page.tsx` — sobrescrito con lista completa
- `src/components/layout/Sidebar.tsx` — badge reactivo en el NavLink del Inbox

**F9 — Dashboard:**

- `src/components/dashboard/Greeting.tsx`
- `src/components/dashboard/QuickCaptureButton.tsx`
- `src/components/dashboard/InboxCard.tsx`
- `src/components/dashboard/RecentNotesCard.tsx`
- `src/app/page.tsx` — sobrescrito (placeholder de Fase 0 reemplazado)

---

## Checklist de completado

- [x] `npm run build` compila sin errores ni warnings de TypeScript
- [x] La app despliega correctamente en Firebase Hosting
- [x] El usuario puede capturar una idea con `Alt+N` en < 3 segundos
- [x] El usuario puede crear, editar y guardar notas con contenido rico
- [x] Al escribir `[[` aparece autocompletado y se insertan wikilinks funcionales
- [x] Click en un wikilink navega a la nota destino
- [x] Los backlinks aparecen en el panel lateral del editor
- [x] La búsqueda de notas devuelve resultados en < 50ms
- [x] Los items del inbox se pueden convertir en notas o descartar
- [x] El dashboard muestra inbox pendiente y notas recientes
- [x] Los datos persisten en Firestore después de recargar la página
- [x] La app funciona con datos cacheados en TinyBase (tolerante a latencia de red)
- [x] Todos los componentes usan tokens del design system
- [x] Dark mode funciona correctamente como modo por defecto (ya era default de Fase 0)
- [x] Skeleton loading en todas las vistas (no spinners)
- [x] Commits limpios con Conventional Commits en español

---

## Gotchas descubiertos

Conocimiento nuevo que salió de la implementación y que futuras fases deben respetar:

1. **Persister con `merge: true`** — precondición para cualquier feature que escriba campos a un doc Firestore fuera del schema de TinyBase. Sin merge, el persister sobrescribe el doc completo en el próximo sync y borra los campos externos. Documentado inline en `src/lib/tinybase.ts` y en CLAUDE.md sección "Gotchas"
2. **Auto-save de notas es el único punto que escribe `content`** — `useNoteSave` es el único lugar que toca el campo `content` (TipTap JSON) en Firestore. Nuevas features que manipulen notas no deben tocar `content` por fuera de este flujo
3. **`useBacklinks` auto-refresca sourceTitle** al cambiar el título del source en `notesStore` (join in-memory con `useTable('notes')`). No hay que re-sincronizar el cache de `links/` para refrescar títulos en UI — el join resuelve el stale-title problem sin round-trip
4. **Creación de notas: orden estricto** — `await setDoc(Firestore)` primero, `notesStore.setRow` después, `navigate` al final. Evita race con `useNote.getDoc` en la siguiente página. Pattern en `notes/page.tsx:handleCreate` y `useInbox.ts:convertToNote`
5. **Items de inbox nunca se borran físicamente** — se marcan `status: 'processed'` (con `processedAs` apuntando al recurso creado) o `'dismissed'`. El filter de pending los oculta. Preserva historial para features futuras como undo o historial de procesamiento
6. **`addTableListener` + full rebuild** es el pattern más simple para derivar índices (Orama en F6, backlinks counts en Sidebar, preview cards en dashboard). Aceptable <1k filas; si el corpus crece se optimiza a updates incrementales

---

## Dependencias agregadas

```
@tiptap/react @tiptap/starter-kit @tiptap/core @tiptap/pm @tiptap/suggestion @tiptap/extension-placeholder
@orama/orama
```

(No se agregó `tippy.js` — el popup de wikilinks se implementó sin esa dep)

---

## Siguiente fase

Continuar con **Fase 2 — Ejecución:** Tareas + Proyectos + Objetivos + Habit Tracker. El SPEC vive en `Spec/SPEC-fase-2-ejecucion.md`. Fase 1 desbloquea el sistema de notas y captura; Fase 2 agrega la capa de ejecución que conecta las notas con acciones concretas.
