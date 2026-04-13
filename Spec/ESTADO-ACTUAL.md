# Estado Actual — SecondMind (Snapshot consolidado)

> Última actualización: Fase 4 (Abril 2026)
> Este archivo consolida el conocimiento no-obvio de todas las fases completadas.
> Se actualiza al cerrar cada fase. Para detalle de features → README.md.
> Para detalle de implementación → Spec/SPEC-fase-X.md individual.

---

## Fases completadas

- **Fase 0** — Setup base: Vite + React 19 + TS strict + Tailwind v4 + Firebase + TinyBase v8
- **Fase 0.1** — Toolkit: MCPs (Firebase, Context7, Playwright, Brave), hooks Prettier/ESLint, protección main
- **Fase 1** — MVP: Quick Capture (Alt+N), TipTap editor con wikilinks, backlinks, Orama FTS, inbox, dashboard
- **Fase 2** — Ejecución: tareas con prioridad/fecha, proyectos con progreso, objetivos con deadline, habit tracker semanal
- **Fase 3** — AI Pipeline: CF processInboxItem + autoTagNote con Claude Haiku, InboxProcessor one-by-one, Command Palette (Ctrl+K)
- **Fase 3.1** — Schema Enforcement: tool use con JSON Schema en ambas CFs, eliminó nulls/stripJsonFence/fallbacks
- **Fase 4** — Grafo + Resurfacing: Knowledge graph (Reagraph), embeddings (OpenAI), notas similares, FSRS spaced repetition, Daily Digest

---

## Arquitectura y decisiones vigentes

### TinyBase + Firestore sync

- **Persister con `merge: true` es precondición global.** Sin merge, el persister borra campos escritos fuera del schema TinyBase (como `content` de notas, campos `ai*` de CFs). Descubierto en Fase 1; aplica a todo persister nuevo.
- **Content largo de notas (TipTap JSON) va directo a Firestore, NO en TinyBase.** `useNoteSave` es el único punto que escribe `content`. Nuevas features no deben tocar ese campo.
- **Creación de recursos: orden estricto** — `await setDoc(Firestore)` → `store.setRow(TinyBase)` → `navigate()`. Invertir causa race con `useNote.getDoc` en la página destino.
- **Items de inbox nunca se borran físicamente** — se marcan `status: 'processed'` o `'dismissed'`. El filter pending los oculta. Preserva historial.

### Relaciones entre entidades

- **Vinculaciones 1:N: el lado singular es autoritativo.** `project.objectiveId === objective.id` es más robusto que `objective.projectIds.includes(projectId)` para render. Evita drift visual si el usuario reasigna.
- **Links bidireccionales con IDs determinísticos** — `source__target` como docId en `links/`. `extractLinks()` se ejecuta en cada save del editor y sincroniza la colección.

### Optimistic updates

- **Local-first: `setPartialRow` sync ANTES de `setDoc` async.** Invertir causa races en clicks rápidos porque click N+1 lee `existingRow` stale. Bug encontrado en `useHabits.toggleHabit` (Fase 2). Los demás hooks mantienen orden inverso pero deberían revisarse si aparecen síntomas similares.

### IDs y timestamps

- **ID determinístico YYYY-MM-DD para hábitos** — como `rowId` en TinyBase Y `docId` en Firestore. Docs creados implícitamente al primer toggle. Patrón reutilizable para time-indexed entities.
- **Timestamps siempre `serverTimestamp()`** para `createdAt`/`updatedAt` en Firestore.

---

## Cloud Functions

### Estado del deployment

3 Cloud Functions v2 desplegadas en `us-central1`, todas con `retry: false`, `timeoutSeconds: 60`:

- **processInboxItem** — `onDocumentCreated('users/{userId}/inbox/{itemId}')`. Llama a Claude Haiku con tool `classify_inbox` + `INBOX_CLASSIFICATION_SCHEMA`. Escribe 6 campos flat `aiSuggested*` + `aiProcessed: true`.
- **autoTagNote** — `onDocumentWritten('users/{userId}/notes/{noteId}')`. Llama a Claude Haiku con tool `tag_note` + `NOTE_TAGGING_SCHEMA`. Escribe `aiTags`, `aiSummary`, `aiProcessed: true`.
- **generateEmbedding** — `onDocumentWritten('users/{userId}/notes/{noteId}')`. Genera embedding con OpenAI `text-embedding-3-small` (1536 dims). Guard por `contentPlain` vacío + `contentHash` SHA-256 para evitar regeneraciones. Escribe a `users/{userId}/embeddings/{noteId}`.

### Tool use con schema enforcement (Fase 3.1)

Ambas CFs usan `tools` + `tool_choice: { type: 'tool', name: '...' }` para forzar JSON válido. Los `enum` y `required` del JSON Schema garantizan valores a nivel de decoder — no depende de obediencia al prompt. Schemas compartidos en `src/functions/src/lib/schemas.ts`.

### Guards y edge cases

- **`aiProcessed` guard en autoTagNote:** `if (after.aiProcessed) return` — evita re-procesamiento en cada update de la nota. Early return sin log (frecuente).
- **`onDocumentWritten` en vez de `onDocumentCreated`:** las notas desde `/notes` se crean con `contentPlain: ''` y el texto llega en el auto-save (2s después). `onDocumentWritten` detecta el primer write con contenido.
- **`convertToNote` setea `aiProcessed: true` cuando hay tags del inbox.** Sin esto, autoTagNote sobrescribiría los tags que el usuario aceptó. Condición: `aiProcessed: !!(overrides?.tags?.length > 0)`.
- **Secret management:** `defineSecret('ANTHROPIC_API_KEY')` / `defineSecret('OPENAI_API_KEY')` + `secrets: [...]` en el trigger. `.value()` dentro del handler, no top-level.
- **`contentHash` guard en generateEmbedding:** compara SHA-256 del `contentPlain` actual con el hash almacenado en el embedding existente. Si coinciden, early return. No usa `aiProcessed` — a diferencia de autoTagNote, los embeddings deben regenerarse cuando el contenido cambia.

---

## Gotchas activos — Aplicación

### Data y state

1. **`isInitializing` de hooks (200ms) no es suficiente para gates de redirect.** Solo evita skeleton flash. Full-reload directo por URL tarda >200ms en hidratar. Para "¿recurso existe? → redirect" usar grace dedicado de 1500ms o observar `items.length > 0` como signal real.

2. **Orama sync: full rebuild en cada `addTableListener` es el patrón.** <50ms para ~100 notas. Evita edge cases de sync incremental. Aceptable hasta ~1k filas.

3. **`useBacklinks` auto-refresca sourceTitle** vía join in-memory con `useTable('notes')`. No hay que re-sincronizar cache de `links/`.

### UI y componentes

4. **Base-UI Dialog usa `data-starting-style` / `data-ending-style`**, no `data-state` como Radix. Las clases `animate-in`/`animate-out` de `tw-animate-css` no aplican a base-ui.

5. **`Intl.DateTimeFormat('es', { weekday: 'narrow' })`** devuelve "X" para miércoles, no "M". Usar resultado de Intl directamente, no hardcodear array de labels.

6. **Quick Capture shortcut es `Alt+N`** (no `Ctrl+Shift+N` que choca con Chrome incógnito).

7. **`React.FormEvent` deprecated en React 19.** Poner handler inline `onSubmit={(event) => { event.preventDefault(); void submit(); }}` para que TypeScript infiera el tipo sin importar el type deprecated.

### Data y links

8. **Self-links filtrados en `syncLinks`:** `targetId !== sourceId` es un guard activo. Sin este filtro, una nota que se referencia a sí misma con `[[wikilink]]` poluciona el grafo con loops. Aplica a cualquier refactor que toque `extractLinks` o `syncLinks`.

### Knowledge Graph y filtros

9. **Ruta `notes/graph` ANTES de `notes/:noteId` en router.tsx.** Si va después, React Router captura "graph" como noteId. Orden crítico en flat routes con parámetros dinámicos.

10. **Empty state con filtros activos: no hacer early return.** Renderizar siempre los controles de filtro y diferenciar mensaje: "sin datos" vs "filtros sin resultados" con botón de reseteo inline. Aplica a cualquier vista con filtros.

### Embeddings y similares

11. **Embeddings NO van en TinyBase.** Vectores de 1536 floats (~6KB c/u) son demasiado grandes para store in-memory. Carga on-demand desde Firestore con cache en `useRef`. Para <500 notas (~1.2MB total), fetch all es viable.

### FSRS y resurfacing

12. **FSRS opt-in requiere botón explícito.** Sin "Activar revisión periódica", la feature es invisible porque notas nuevas no tienen `fsrsDue`. ReviewBanner tiene 4 estados: activar, due, próxima fecha, confirmación post-review.

13. **`Math.random()` no es seedable en JavaScript.** Para orden determinístico diario de hubs en Daily Digest, usar hash numérico de `noteId + dateString`: `[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)`.

### Cloud Functions

14. **firebase-functions v7 obligatorio.** La v6 fallaba con timeout en el discovery protocol de la CLI. Importante al elegir versiones.

15. **`.gitignore` de functions: `/lib/` con anchor.** Sin anchor, matchea `src/lib/` (sources) además de `lib/` (compiled).

---

## Gotchas activos — Tooling de desarrollo

16. **TypeScript LSP plugin requiere patch en Windows.** `child_process.spawn()` sin `shell: true` no resuelve wrappers `.cmd` de npm global. Fix: parchear `marketplace.json` con `command: "node"` + ruta absoluta a `typescript-language-server/lib/cli.mjs`. Se pierde si Claude Code actualiza el marketplace.

17. **Firebase MCP: `node` directo al CLI local, no `npx`.** `npx firebase@latest` falla con "Invalid Version". Configurado en `.mcp.json`.

18. **Brave Search: `BRAVE_API_KEY` como variable de sistema Windows**, no en `.env.local`.

19. **ui-ux-pro-max symlinks rotos en Windows** sin Developer Mode. Los scripts reales viven en `src/ui-ux-pro-max/scripts/search.py`. Fix: Developer Mode + `git config --global core.symlinks true` + reinstalar plugin.

---

## Patrones establecidos

### Código

- **"Three similar lines beat premature abstraction"** — duplicar 8 líneas triviales es OK hasta el 4to uso. No extraer helpers prematuramente.
- **Helpers compartidos existentes:** `formatDate`, `startOfDay`, `isSameDay`, `getWeekStart`, `addDays` en `src/lib/dateUtils.ts`; `parseIds`, `stringifyIds` en `src/lib/tinybase.ts`.
- **Popup wikilinks sin tippy.js** — `createPortal` + virtual anchor del `clientRect()` de TipTap. ~30 líneas, sin dep extra.

### Performance

- **Full rebuild de índices < 50ms** para ~100 entidades. Patrón `addTableListener` + rebuild completo, sin sync incremental.
- **Auto-save del editor: debounce 2s** (`AUTOSAVE_DEBOUNCE_MS = 2000`).
- **Command Palette: Orama rebuild con debounce 100ms** para agrupar los 3 store listeners iniciales.

---

## Dependencias clave con historia

| Paquete              | Versión   | Nota                                                                                            |
| -------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| `firebase-functions` | `^7.2.5`  | v6 fallaba con timeout en discovery. Major bump obligatorio                                     |
| `@anthropic-ai/sdk`  | `^0.40.1` | Soporta `tools` + `tool_choice` para schema enforcement                                         |
| `tinybase`           | v8        | Sin `persister-firestore` nativo. Custom persister con `createCustomPersister`                  |
| `@orama/orama`       | v3        | `search()` es sync at runtime aunque el tipo diga `Promise`. Cast a `Results<AnyDocument>`      |
| `reagraph`           | latest    | WebGL graph viz (Three.js). Compatible React 19. ~1.3MB bundle. API declarativa `<GraphCanvas>` |
| `openai`             | `^4.85`   | SDK para embeddings en CF generateEmbedding. Solo en `src/functions/`                           |
| `ts-fsrs`            | latest    | FSRS spaced repetition. Client-side (~15KB). `createEmptyCard`, `fsrs().next()`                 |

---

## Siguiente fase

**Fase 5 — Multi-plataforma:** PWA optimizada (service worker, offline), Tauri wrapper para desktop (global hotkey, system tray), Capacitor wrapper para mobile (Share Intent Android), Chrome extension web clipper.
