# SPEC F24 — FSRS Widget Mejorado

> Roadmap: F24 del [DRAFT-roadmap-inbox-notas.md](../drafts/DRAFT-roadmap-inbox-notas.md).
> Branch: `feat/fsrs-widget`.
> Alcance: separar el resurfacing FSRS en su propio widget de dashboard con copy diferenciado por count + tab "Por revisar" en `/notes` para acceder a la lista completa.
> Dependencias: ninguna (independiente del trabajo Inbox+Notas previo).
> Estimado: 5-6 commits, 1 sesión.
> Stack relevante: React + TinyBase reactivo + react-router. `ts-fsrs` y `lib/fsrs.ts` NO se tocan.

---

## Objetivo

El widget FSRS hoy comparte espacio con hubs en `DailyDigest` — el user no ve un "te tocan N hoy" ni un acceso a la lista completa cuando hay más due que las 3 que el digest muestra. F24 separa el resurfacing en su propia card con copy diferenciado (`Nada que repasar` / `Te toca 1` / `Te tocan N`), agrega "Ver todas las due" cuando supera 5, y abre una tab "Por revisar" en `/notes` para revisión deliberada. La feature más usada del user gana prominencia y deja de pelear espacio con la lista de hubs.

---

## Features

### F1: Hook `useReviewQueue`

**Qué:** hook nuevo que centraliza la query de notas due. Lee la tabla `notes` de TinyBase, filtra `fsrsDue > 0 && fsrsDue <= endOfDay() && isArchived !== true/1`, devuelve la lista ordenada por `fsrsDue` ascendente. Reusable por F2 (dashboard card) y F4 (tab `/notes`).

**Criterio de done:**

- [ ] Devuelve `{ items: ReviewItem[], total: number, isLoading: boolean }`.
- [ ] `ReviewItem = NoteOramaDoc & { fsrsDue: number }`. El hook compone cada item con `{ ...rowToOramaDoc(id, row), fsrsDue }` reusando el mapper genérico de [src/lib/orama.ts:100-117](../../src/lib/orama.ts#L100-L117). F2 lee solo `title` y `fsrsDue` y descarta el resto via deconstrucción. Precedente del patrón: `RecentNotesCard.tsx:14-20`.
- [ ] Filtra notas archivadas (`isArchived === true || === 1`, mismo guard que `useDailyDigest`).
- [ ] Ordena por `fsrsDue` asc (más vencida primero).
- [ ] `isLoading` viene de `useStoreHydration().isHydrating`.
- [ ] Sin parámetros (vista única). Si en el futuro se quiere un slice (ej. dashboard top-5), el consumer hace `.slice()` — el hook devuelve la queue completa.

**Archivos a crear/modificar:**

- `src/hooks/useReviewQueue.ts` — NEW.

**Notas:**

- Threshold canónico: `endOfDay()` (mismo que `useDailyDigest` actual). NO `now + 24h` (que usa `useResurfacing` per-nota) — para el widget de dashboard "te tocan hoy" alinea mejor con fin del día calendario.
- Title fallback `'Sin título'` consistente con el resto del codebase (NoteCard, DailyDigest).

---

### F2: `ReviewCard` widget en dashboard

**Qué:** componente nuevo que reemplaza la mitad "review" de `DailyDigest`. Header con copy diferenciado por `total`, lista de hasta 5 notas due, footer con link "Ver todas" si `total > 5`.

**Criterio de done:**

- [ ] Empty (`total === 0`): copy `Nada que repasar hoy.` + sub-copy `Vuelve mañana o crea más notas para activar la revisión.` (imperativo neutro — sin voseo, alineado con la convención del proyecto post-F15).
- [ ] Una sola (`total === 1`): header `Te toca 1 nota hoy.` + lista con esa nota.
- [ ] Varias (`total > 1`): header `Te tocan ${total} notas hoy.` + lista (max 5 visibles).
- [ ] Si `total > 5`: footer `<Link to="/notes?filter=review">Ver todas las ${total}</Link>`.
- [ ] Click en cada item navega a `/notes/{noteId}` (sin regresión vs DailyDigest actual).
- [ ] Loading: skeleton 3 filas idéntico al `CardSkeleton` del DailyDigest actual mientras `isLoading`.
- [ ] Icono diferenciado del HubsCard: `Brain` (lucide-react) en el header y/o en cada fila — para diferenciar visualmente del `Network` de hubs.
- [ ] `aria-label` o `<h2>` claro: `"Por revisar"` o equivalente; screen readers entienden el count del header.
- [ ] Mobile-first: el widget cabe en `grid-cols-1` sin overflow; en `lg:grid-cols-2` ocupa 1 celda.

**Archivos a crear/modificar:**

- `src/components/dashboard/ReviewCard.tsx` — NEW.

**Notas:**

- Estructura visual: usa el patrón existente `<section className="rounded-lg border border-border bg-card p-5">` + `<header><h2>...</h2></header>` + `<ul>` para alinear con TasksTodayCard, InboxCard, DailyDigest, etc.
- "Detail" por fila: tiempo relativo en español tipo `Hace 2 días` / `Hoy` / `Ayer`. Usar `Intl.RelativeTimeFormat('es')` o helper similar — verificar si ya existe uno en `src/lib/` antes de duplicar.
- Empty state mostrá una **sección visible**, no un retorno null — F4 establece el patrón "empty con info útil" y este widget tiene que aparecer en el dashboard incluso vacío.
- Sin paginación. El "ver todas" del footer es la salida cuando `total > 5`.

---

### F3: Refactor `DailyDigest` → `HubsCard`

**Qué:** sacar la lógica review del widget actual. `DailyDigest` queda solo con hubs y se renombra a `HubsCard` con copy alineado a su rol.

**Criterio de done:**

- [ ] `src/components/dashboard/DailyDigest.tsx` → renombrado a `src/components/dashboard/HubsCard.tsx`.
- [ ] `src/hooks/useDailyDigest.ts` → renombrado a `src/hooks/useKnowledgeHubs.ts`. Lógica review eliminada (solo hubs ahora). Constantes: `MAX_HUBS = 5`, `MIN_HUB_LINKS = 3` (mismo umbral actual).
- [ ] Todas las refs al nombre viejo (`DailyDigest`, `useDailyDigest`, type `DigestItem`) se actualizan: `HubsCard`, `useKnowledgeHubs`, `HubItem` (o `KnowledgeHubItem`).
- [ ] Header del card: `<h2>Hubs activos</h2>` (o equivalente sintético). NO `Daily Digest`.
- [ ] Empty state: `Conecta tus notas con [[wikilinks]] — los hubs aparecerán acá.` (imperativo neutro, sin voseo).
- [ ] Lista mantiene el icono `Network`, click navega a `/notes/{noteId}` (sin regresión).
- [ ] Detail por fila: `Hub: ${linkCount} conexiones` (sin cambios).
- [ ] El hash determinístico diario (`hashString(noteId + dayKey)`) se preserva — el orden visual de hubs no debe cambiar arbitrariamente entre re-renders del mismo día.

**Archivos a crear/modificar:**

- `src/components/dashboard/DailyDigest.tsx` → `HubsCard.tsx` (rename + edit).
- `src/hooks/useDailyDigest.ts` → `useKnowledgeHubs.ts` (rename + simplificación).
- `src/app/page.tsx` — actualizar import (también tocado por F5).

**Notas:**

- Patrón de rename: crear el archivo nuevo con el contenido refactorizado, eliminar el viejo en el mismo commit. NO mantener un re-export del nombre viejo (CLAUDE.md prohíbe hacks de backwards-compat).
- Buscar referencias al nombre viejo antes de borrar — `Grep` por `DailyDigest`, `useDailyDigest`, `DigestItem` en `src/`.

---

### F4: Tab "Por revisar" en `/notes`

**Qué:** 4ta tab en `src/app/notes/page.tsx` que muestra todas las notas due (consume `useReviewQueue`). Search local dentro de la tab (mismo patrón que la tab Papelera).

**Criterio de done:**

- [ ] `type Filter = 'all' | 'favorites' | 'trash' | 'review'`.
- [ ] Constante `TABS` extendida con `{ key: 'review', label: 'Por revisar' }` (orden: después de Favoritas, antes de Papelera).
- [ ] Cuando `filter === 'review'`: la página renderiza `useReviewQueue().items` (filtradas por `reviewQuery` local), NO los results de `useHybridSearch`. Coherente con el patrón actual de `isTrashView`.
- [ ] Search input local dentro de la tab: nuevo state `reviewQuery`, filtra in-memory por `title.toLowerCase().includes(q) || contentPlain.toLowerCase().includes(q)`.
- [ ] Placeholder del input cuando `filter === 'review'`: `Buscar en notas por revisar...`.
- [ ] Empty states diferenciados:
  - `total === 0` y sin query: `Nada por revisar hoy.` + botón `Volver a todas las notas` (mismo patrón que `EmptyTrashState`).
  - `total > 0` y query sin matches: `No se encontraron notas en revisión.` + botón `Limpiar búsqueda`.
- [ ] Badge count en la tab cuando `total > 0` (mismo patrón que el `trashCount` badge en línea 163-167 de la página actual).
- [ ] Cada item se renderiza con `<NoteCard note={...} />`. Como `useReviewQueue` ya devuelve `ReviewItem = NoteOramaDoc & { fsrsDue }` (reusando `rowToOramaDoc` de `src/lib/orama.ts`), el render es deconstrucción directa: `{items.map(({ fsrsDue, ...note }) => <NoteCard note={note} />)}`. Sin helper extra.
- [ ] **No** reusar ni extender `trashNoteToOramaDoc` (acoplado a `TrashNote` con `aiSummary: ''` hardcoded y `daysUntilPurge`). El reuso correcto es `rowToOramaDoc` que es genérico.
- [ ] Cambiar de tab limpia ambos queries (`setQuery('')`, `setTrashQuery('')`, `setReviewQuery('')`) — mismo patrón que el handler actual de `setFilter`.

**Archivos a crear/modificar:**

- `src/app/notes/page.tsx` — extender Filter type, TABS, render condicional, search local, empty states.

**Notas:**

- Punto crítico: la lista de la tab "Por revisar" debe componerse desde la **tabla TinyBase completa** (vía `useReviewQueue`) y NO desde el set de Orama. Orama solo indexa los campos `NoteOramaDoc` y no incluye `fsrsDue`, así que cualquier intento de filter post-Orama implica un lookup paralelo. Más limpio: hook directo + map a `NoteOramaDoc` para el render.
- Decisión cerrada: NO unificar este filtro con `useHybridSearch`. Patrón de filtros locales (trash, review) vs search global (all, favorites) ya es la convención de la página.
- El link `Ver todas las due` del F2 apunta a `/notes?filter=review`. Para soportar deep-link, `NotesListPage` lee `useSearchParams()` con **`initRef` pattern** (single-fire al mount, evita re-trigger ambiguo cuando react-router re-instancia el objeto). Patrón canónico:

  ```tsx
  const [searchParams] = useSearchParams();
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    const f = searchParams.get('filter');
    if (f === 'review') setFilter('review');
  }, [searchParams]);
  ```

  Default sigue siendo `'all'` si el param no está. Sync **unidireccional** (URL → state al mount). Cambio manual de tab no actualiza URL — UX más limpia, evita push history en cada click.

---

### F5: Reorganizar grid del dashboard

**Qué:** integrar `ReviewCard` y `HubsCard` (renombrado) en el grid de `src/app/page.tsx`. Definir orden visual.

**Criterio de done:**

- [ ] `src/app/page.tsx` importa `ReviewCard` y `HubsCard` (no `DailyDigest`).
- [ ] El grid `grid grid-cols-1 gap-4 lg:grid-cols-2` ahora tiene 6 cards en este orden:
  1. `ReviewCard` (top-left — feature más usada).
  2. `TasksTodayCard`.
  3. `InboxCard`.
  4. `HubsCard` (renombrado).
  5. `ProjectsActiveCard`.
  6. `RecentNotesCard`.
- [ ] `HabitsTodayCard` sigue full-width abajo del grid.
- [ ] Mobile (`grid-cols-1`): orden vertical idéntico al de arriba (ReviewCard primero).
- [ ] No hay regresión visual en breakpoints `375 / 768 / 1280` — verificar via Playwright en Plan mode.

**Archivos a crear/modificar:**

- `src/app/page.tsx`.

**Notas:**

- ReviewCard arriba-izquierda es la decisión de prominencia. Si el user prefiere ReviewCard full-width arriba (como un hero), se discute en Plan mode — pero default es 1 celda del grid (consistente con el resto).

---

## Orden de implementación

1. **F1** (`useReviewQueue`) — base independiente que F2 y F4 consumen. Sin UI todavía, primer commit es el hook + extracción de `endOfDay()` a `src/lib/formatDate.ts` (al lado de `startOfDay` que ya existe ahí).
2. **F3** (rename `DailyDigest` → `HubsCard`) — sustitución **1:1 in-place** en `src/app/page.tsx` (mismo lugar del grid, sin reorganizar). Tras F3, `DailyDigest` ya no existe.
3. **F2** (`ReviewCard`) — usa hook de F1, ya con el campo limpio post-F3.
4. **F5** (dashboard layout) — agrega `<ReviewCard />` y reorganiza grid completo (F3 dejó `HubsCard` en su lugar viejo). Hasta F5 inclusive, dashboard funciona en main al deploy.
5. **F4** (tab `/notes`) — independiente del dashboard. Se hace al final porque es la rama menos crítica para el flujo principal del user (acceso secundario a la queue).

Las dependencias técnicas son F1 → F2 (consumer), F1 → F4 (consumer), F3 → F5 (necesita el rename), F2 → F5 (necesita el componente). No hay ciclos. **Sub-split crítico:** F3 NO reorganiza el grid (solo sustituye `DailyDigest` → `HubsCard` en mismo lugar). F5 hace la reorganización completa. Esto evita doble-edit de `page.tsx` con conflicto entre commits.

---

## Estructura de archivos

```
src/
├── hooks/
│   ├── useReviewQueue.ts          # F1 NEW
│   ├── useKnowledgeHubs.ts        # F3 RENAMED from useDailyDigest.ts
│   └── useDailyDigest.ts          # F3 DELETED
├── components/dashboard/
│   ├── ReviewCard.tsx             # F2 NEW
│   ├── HubsCard.tsx               # F3 RENAMED from DailyDigest.tsx
│   └── DailyDigest.tsx            # F3 DELETED
└── app/
    ├── page.tsx                   # F5 EDIT (imports + grid order)
    └── notes/page.tsx             # F4 EDIT (tab + filter + empty states)
```

---

## Definiciones técnicas

### Threshold del widget

- **Decisión:** `fsrsDue > 0 && fsrsDue <= endOfDay()` para todo F24 (F1 y F4 consumidores).
- **Razón:** alineación con UX "hoy". `useResurfacing` per-nota seguirá usando `now + 24h` (window móvil) — son scopes distintos: per-nota es "está vencida casi-ya", queue del widget es "te tocan hoy según calendario".

### Iconografía

- `ReviewCard`: `Brain` (lucide-react) en header. Cada item: `CalendarClock` o sin icono si genera ruido visual. Decisión final en build.
- `HubsCard`: mantiene `Network` (sin cambios respecto a DailyDigest actual).

### Search dentro de la tab "Por revisar"

- Filtro local in-memory (NO Orama). Mismo patrón que `useTrashNotes` con su `filter` arg.
- Match: `title.toLowerCase().includes(q.toLowerCase()) || contentPlain.toLowerCase().includes(q.toLowerCase())`. Sin scoring, sin BM25.

### Deep-link `?filter=review`

- `NotesListPage` lee `useSearchParams()` al mount, sincroniza con `filter` state via `useEffect` con dep `[searchParams]`. Si param ausente, no resetea (default `'all'`).

---

## Out of scope explícito

- **Settings de umbral configurable.** Hardcoded en F1. Se evalúa post-F24 si el user lo pide.
- **Vista `/review` dedicada** (descartada en discovery del roadmap).
- **Notificaciones push FSRS due** (backlog general).
- **Cambios en `lib/fsrs.ts` o algoritmo `ts-fsrs`** (intactos).
- **Cambios en `useResurfacing` per-nota** (sigue funcionando igual; el `ReviewBanner` del editor no se toca).
- **Re-embedding o weekly digest CFs** (backlog general).
- **Filtro "Por revisar" en Command Palette** (Ctrl+K). Posible en F26 o más adelante; F24 solo cubre dashboard + página.
- **Sort/agrupación por overdue vs due-today en el widget.** Lista plana sort por `fsrsDue` asc cubre el caso. Bucketización si emerge >20 due a la vez.

---

## Checklist global de completado

- [ ] App compila sin errores TS strict.
- [ ] `npm run lint` pasa (PostToolUse hook ya corre Prettier+ESLint por archivo).
- [ ] `npm test` pasa (no se agregan tests nuevos en F24, pero los existentes no deben romper — mock de stores, etc.).
- [ ] Dashboard (`/`) muestra `ReviewCard` y `HubsCard` separados, en el orden definido en F5.
- [ ] `ReviewCard` con 0 due muestra empty state con copy `Nada que repasar hoy.` y la card sigue visible (no early return null).
- [ ] `ReviewCard` con 1 due muestra header `Te toca 1 nota hoy.` y la nota.
- [ ] `ReviewCard` con N due muestra header `Te tocan N notas hoy.` y hasta 5 items.
- [ ] `ReviewCard` con >5 due muestra footer `Ver todas las N` que linkea a `/notes?filter=review`.
- [ ] Click en cualquier item de `ReviewCard` o `HubsCard` navega a `/notes/{noteId}` sin regresión.
- [ ] `/notes` con `?filter=review` arranca con la tab activa.
- [ ] Tab "Por revisar" en `/notes` muestra todas las notas due, búsqueda local funciona, empty states correctos.
- [ ] Cambiar de tab limpia los queries de las otras tabs.
- [ ] No queda referencia a `DailyDigest`, `useDailyDigest`, ni `DigestItem` en `src/` (Grep guard al final, conteo inicial 12 → 0).
- [ ] E2E manual rápido (Playwright en Plan mode): viewport 375 + 1280, dashboard + tab review, click → editor, regresión flujo `useResurfacing` (botón Activar revisión, Buenas/Bien/Difícil).
- [ ] Deploy: `npm run build && npm run deploy` (hosting). Tauri/Android opcionales — F24 es 100% client-side, sin tocar `src-tauri/` ni `android/`.

---

## Siguiente fase

F26 (Inbox refinement) según roadmap, **solo si** el user reporta fricción real con Inbox tras F24. Si no, se desprioriza permanentemente. F25 ya fue absorbida por F23. F24 cierra el bloque "subsistema Notas impecable" del roadmap.
