# SPEC — SecondMind · F42: Polish offline UX y visibilidad per-item

> **Estado:** Pre-implementación (Mayo 2026). Branch destino: `feat/offline-ux-polish-f42`.
> Alcance: solo polish UX visible. NO toca cola de writes ni conflict resolution (eso vive en F28/F29/F30 y funciona).
> Dependencias: F29 (`saveQueue` + 6 meta queues), F30 (4 creates queues + `createsQueueBindings`), F32.4 (`useOnlineStatus`), F38 (`inboxRepo.createFromCapture`).
> Estimado: 1 semana solo dev.
> Stack relevante: React + `useSyncExternalStore`, `saveQueue` existente, `@base-ui/react/dialog`, Tailwind v4.

---

## Objetivo

El usuario hoy tiene un buen indicador agregado de "hay X cambios pendientes" (chip `<PendingSyncIndicator />` con popover en header mobile + sidebar desktop), pero le falta transparencia per-ítem y consistencia cross-platform en tres frentes:

1. Items creados/editados offline NO tienen marcador visual propio en su card → si el usuario hace click en "Descartar" del popover pierde sin saber qué pierde.
2. Inbox items capturados offline muestran el placeholder `Procesando con AI...` con spinner indefinido → la Cloud Function nunca corre offline, el mensaje miente.
3. Mobile (Capacitor) muestra chip top + popover; desktop (Tauri/web) muestra `<OfflineBadge />` toast genérico bottom + chip → dos componentes para el mismo concepto, divergencia visual y de información.

Adicionalmente: cuando el usuario abre el `<NavigationDrawer />` en Capacitor, el avatar `<img>` con Google profile pic puede fallar a cargar (CORS/refresh) y deja visible el `alt` truncado dentro del círculo, generando un layout shift.

F42 cierra estos cinco gaps sin tocar el saveQueue ni el modelo de persistencia.

---

## Features

### F42.1 — Hook `usePendingSyncForEntity` + badge per-item en cards

**Qué:** Cada card de entidad listable expone un indicador visual cuando su `entityId` tiene una entry con `status !== 'synced'` en alguna de las queues que la persisten. El indicador desaparece cuando el sync completa.

**Criterio de done:**

- [ ] Hook nuevo `usePendingSyncForEntity(entityType, id): { isPending: boolean, hasError: boolean }` consume `useSyncExternalStore` con subscribe scoped a las queues relevantes de la entidad.
- [ ] El hook usa el patrón cached-by-version de `usePendingSyncCount` (subscribe app-lifetime + `bumpVersion` al notify) para evitar re-renders cuando otro entityId cambia status.
- [ ] `NoteCard` (en `/notes`), `InboxItemCard` (en `/inbox`), `TaskCard`, `ProjectCard`, `ObjectiveCard` muestran un dot esquina superior-derecha cuando `isPending` o `hasError`.
- [ ] Color del dot: `bg-amber-500` para pending, `bg-destructive` para error (paridad con `<PendingSyncIndicator />` línea 96-97).
- [ ] El dot desaparece sin layout shift cuando el sync completa (transición opacity).
- [ ] Tap target del dot es decorativo (no interactivo) — el detalle sigue accesible desde el chip global.
- [ ] Test unitario del hook con mocks de queues cubre: pending → synced (dot desaparece), pending → error (cambio de color), entityId no presente (no dot).
- [ ] E2E Playwright (web): forzar offline → crear nota → ver dot pending en NoteCard del listado → reconectar → dot desaparece tras sync.

**Archivos a crear/modificar:**

- `src/hooks/usePendingSyncForEntity.ts` — nuevo. Mapa `entityType → queues[]` + subscribe agregado.
- `src/hooks/usePendingSyncForEntity.test.ts` — nuevo. Mocks de queues siguiendo patrón de `usePendingSyncCount.test.ts`.
- `src/components/editor/NoteCard.tsx` — agrega badge.
- `src/components/capture/InboxItem.tsx` — agrega badge.
- `src/components/tasks/TaskCard.tsx` — agrega badge.
- `src/components/projects/ProjectCard.tsx` — agrega badge.
- `src/components/objectives/ObjectiveCard.tsx` — agrega badge.

**Notas de implementación:**

- Mapa `entityType → queues[]`:
  - `note` → `[saveContentQueue, saveNotesMetaQueue, saveNotesCreatesQueue]` (las 3, una nota puede estar pending en cualquiera).
  - `task` → `[saveTasksQueue, saveTasksCreatesQueue]`.
  - `project` → `[saveProjectsQueue, saveProjectsCreatesQueue]`.
  - `objective` → `[saveObjectivesQueue, saveObjectivesCreatesQueue]`.
  - `inboxItem` → `[saveInboxQueue]`.
- **Limitación conocida (out-of-scope F42):** items capturados via `QuickCaptureProvider.save` persisten con `inboxStore.setRow` directo + persister F12 (path canónico D4 F38.3) — NO van a una queue. El badge per-item NO los marca. Inbox items creados via `inboxRepo.createFromCapture` (post-F38.3) sí. Cobertura parcial aceptada para v1; si surge demanda escalar a F43.
- Composite keys de `saveNotesMetaQueue` (`${noteId}:accept-${suggestionId}`): el hook hace `key.startsWith(\`${id}:\`) || key === id` para matchear ambos.
- Hábitos no aplican (HabitGrid usa cells distintas y `saveHabitsQueue` se usa rara vez offline; out-of-scope F42).

---

### F42.2 — Confirmación detallada antes de descartar

**Qué:** Reemplazar el `handleDiscardAll` directo del `<PendingSyncIndicator />` (que hoy borra todo en un click sin preview) por un dialog de confirmación que lista qué se va a perder.

**Criterio de done:**

- [ ] Click en "Descartar" del popover abre `<DiscardPendingDialog />` (base-ui Dialog).
- [ ] El dialog muestra lista de items pending agrupados por entidad (Notas / Inbox / Tareas / Proyectos / Objetivos / Hábitos).
- [ ] Cada item muestra label resuelto desde el store local: nota → `title`; inbox → `rawContent` truncado a 80 chars; task → `title`; etc.
- [ ] Si el row local no existe (caso raro: create pending sin row), label fallback `"<entidad> sin nombre"`.
- [ ] Botón "Cancelar" cierra el dialog sin acción; el popover puede cerrarse o quedarse abierto (a decidir en Plan mode, default: ambos cierran).
- [ ] Botón destructivo "Descartar todo" ejecuta el `handleDiscardAll` actual (delRow para creates + clear queues) y cierra el dialog.
- [ ] Si la lista cambia mid-dialog (sync completa entre apertura y confirm) y queda vacía, el dialog se auto-cierra sin acción.
- [ ] E2E: crear 1 nota + 1 inbox offline → click Descartar en popover → ver dialog con 2 entries y sus labels reales → click Cancelar → ambos siguen pending → click Descartar de nuevo → confirmar → ambos desaparecen del listado y del popover.

**Archivos a crear/modificar:**

- `src/components/layout/DiscardPendingDialog.tsx` — nuevo.
- `src/components/layout/PendingSyncIndicator.tsx` — el botón "Descartar" abre el dialog en lugar de ejecutar discard directo.
- `src/lib/saveQueue.ts` — exportar helper `getDiscardableEntries(): Array<{ entityType, id, label }>` que itera las 11 queues y resuelve labels desde stores.

**Notas de implementación:**

- Resolución de labels: el helper hace `notesStore.getRow('notes', id)?.title`, `inboxStore.getRow('inbox', id)?.rawContent`, etc. Se mantiene module-level y solo resuelve labels al momento de abrir el dialog (no reactivo).
- El dialog NO necesita ser reactivo a cambios mid-open en la lista — basta el snapshot al abrir + el guard de "lista vacía → auto-cierre" en commit.
- Estilo del dialog: heredar tokens del `<ConfirmDialog />` existente (F18 lo introdujo). Si el componente `ConfirmDialog` ya cubre el caso variable-list, reusar; si solo soporta texto fijo, crear `DiscardPendingDialog` dedicado.

---

### F42.3 — Integrar OfflineBadge en PendingSyncIndicator (paridad cross-platform)

**Qué:** Eliminar `<OfflineBadge />` (toast genérico bottom-centered, sin conteo, sin acción) y unificar la información de "estado de red + cambios pendientes" en un solo componente: `<PendingSyncIndicator />`. El componente pasa a tener tres modos:

1. **Online + sin pending** → no renderiza nada (idéntico a hoy).
2. **Online + pending** → chip ámbar con conteo (idéntico a hoy).
3. **Offline (con o sin pending)** → chip distintivo con icono cloud-off, persistente. Popover muestra "Sin conexión — los cambios se sincronizarán al reconectar" + lista de pending si los hay.

**Criterio de done:**

- [ ] `<PendingSyncIndicator />` consume `useOnlineStatus()` además de `usePendingSyncCount()`.
- [ ] Modo offline-sin-pending: el chip persiste con icono cloud-off + label "Sin conexión" (ni amber ni destructive — paleta nueva).
- [ ] Modo offline-con-pending: chip ámbar/destructive según severity actual + label dual ("Sin conexión · N pendientes" o similar a definir copywriting en Plan mode).
- [ ] Popover en offline siempre muestra leyenda explicativa "Sin conexión — los cambios se sincronizarán al reconectar" como header del contenido.
- [ ] Botón "Reintentar" en offline queda disabled (no tiene sentido sin red); habilita solo cuando online + errorCount > 0.
- [ ] `<OfflineBadge />` eliminado de `src/app/layout.tsx:157` y archivo borrado.
- [ ] `useOnlineStatus.ts` permanece (otros consumers pueden existir; verificar en Plan mode antes de cualquier limpieza adicional).
- [ ] Cross-platform verificado: mobile (`MobileHeader` línea 38), desktop (`Sidebar` línea 174 con `compact` en collapsed), tablet collapsed.
- [ ] E2E desktop + mobile: forzar offline (Playwright `context.setOffline(true)`) → verificar chip con icono cloud-off en topbar/sidebar → crear nota → popover muestra info dual → reconectar → chip vuelve a estado normal.

**Archivos a crear/modificar:**

- `src/components/layout/PendingSyncIndicator.tsx` — extender con online/offline branching y reglas de severity.
- `src/components/layout/PendingSyncIndicator.test.tsx` — agregar casos para los 3 modos.
- `src/components/layout/OfflineBadge.tsx` — borrar.
- `src/app/layout.tsx` — quitar import + `<OfflineBadge />` (línea 12 + 157).

**Notas de implementación:**

- El triggerKey de `useExpandThenCollapse` (F42.3 lo extiende) ahora cambia en transición online↔offline también, no solo error↔normal. Tres states: `'normal' | 'error' | 'offline'`. El re-expand en transición a offline da callout natural.
- El chip offline queda visible aún sin pending → cambia el contrato actual del `if (!hasAny) return null`. Reemplazar por `if (isOnline && !hasAny) return null`.
- Compact mode (sidebar collapsed): el dot indica severity (offline → blue/neutral, pending → amber, error → destructive). Tooltip via `title` HTML nativo expone label completo.
- Decisión de paleta concreta (offline vs pending vs error coexistiendo) → resolver en Plan mode con feedback visual del design system.

---

### F42.4 — Mensaje correcto de inbox item offline

**Qué:** En `<InboxItem />`, el placeholder "Procesando con AI..." que hoy aparece mientras `!item.aiProcessed` debe distinguir el caso `offline (la CF nunca va a correr)` del caso `online + procesando`.

**Criterio de done:**

- [ ] Online + `!item.aiProcessed` → "Procesando con AI..." con `<Loader2 />` (mantiene UX actual).
- [ ] Offline + `!item.aiProcessed` → "En cola — se procesará al reconectar" con icono cloud-off (sin spinner; el item NO está procesando, está parado).
- [ ] Al volver online, el texto se actualiza automáticamente al spinner si la CF arranca; al terminar la CF, surface las suggestions normalmente.
- [ ] No hace falta consultar queues: la heurística simple `useOnlineStatus() && !item.aiProcessed` es suficiente para v1. (La CF nunca corre offline, garantizado por arquitectura — onDocumentCreated requiere doc en Firestore, doc requiere red.)
- [ ] E2E: crear inbox item offline desde QuickCapture → ver "En cola..." en `/inbox` → reconectar → ver "Procesando..." brevemente → ver suggestion lista.

**Archivos a modificar:**

- `src/components/capture/InboxItem.tsx` — branching online/offline en líneas 31-36.

**Notas de implementación:**

- Edge case "offline + `aiProcessed` ya true" (item sincronizado en sesión anterior, ahora estoy offline mirándolo): no aplica, ese branch no entra al condicional. El placeholder solo se muestra cuando `!item.aiProcessed`.
- Edge case "online pero la CF está retried/erroring server-side": fuera de scope F42 (no hay UI para errores de CF hoy; lo cubriría F43 si se materializa).

---

### F42.5 — Fix avatar fallback en Sidebar (Capacitor)

**Qué:** El `<img src={user.photoURL}>` del `<SidebarContent />` (línea 67-73) usa `referrerPolicy="no-referrer"` para Google profile pics. En Capacitor WebView esa imagen puede fallar a cargar (CORS/redirect/cold network) y el browser muestra el placeholder broken-image con el `alt` truncado dentro del círculo, generando el shift visible en mobile (imagen 3 del discovery: "seb..." truncado debajo del avatar coexistiendo con "sebastian gutierrez" al costado).

**Criterio de done:**

- [ ] `<img>` agrega handler `onError` que setea `imgError = true` (state local en `<SidebarContent />`).
- [ ] Cuando `imgError === true` o `!user.photoURL`, NO se renderiza `<img>` — se renderiza el placeholder `<div className="h-8 w-8 rounded-full bg-sidebar-primary" />` (mantiene el render actual del fallback).
- [ ] Los dos elementos NUNCA se renderizan simultáneamente.
- [ ] `imgError` se resetea cuando `user.photoURL` cambia (key bump o effect).
- [ ] QA Capacitor: instalar APK → abrir drawer cold → confirmar avatar correcto sin shift (con o sin red).
- [ ] QA Tauri: confirmar avatar OK (no regresión).
- [ ] QA web: idem.

**Archivos a modificar:**

- `src/components/layout/Sidebar.tsx` — `<SidebarContent />` agrega `useState` para imgError + `onError` en `<img>`.

**Notas de implementación:**

- El componente actual NO usa el `<Avatar />` de shadcn (`components/ui/`). Usa `<img>` + fallback `<div />` directos. El fix es local al `<SidebarContent />` y NO requiere wrapper de shadcn.
- Si en Plan mode descubrimos que el bug NO es un img-error sino re-render del `<Sidebar />` (`animateEntry`/`animateExit` causando double-render con state stale), bumpear F42.5 a F43 y dejar el resto del SPEC intacto.
- Hipótesis a confirmar en Plan mode: ¿el bug se reproduce solo en Capacitor o también en Tauri/web con red lenta? Si es solo Capacitor, está cerca del WebView CORS. Si es cross-platform, es timing del `photoURL` de Firebase Auth llegando async.

---

## Orden de implementación

1. **F42.4** — Inbox item placeholder. Aislado a 1 archivo, no depende de nada. Quita engaño UX que ya está en producción. Primero.
2. **F42.5** — Avatar fallback. Aislado a 1 archivo. Si en Plan mode resulta más profundo de lo previsto, se bumpea a F43 sin afectar el resto del SPEC.
3. **F42.1** — Hook + badge per-item. Extiende `saveQueue.ts` con mapa `entityType → queues`. Es la base de F42.2.
4. **F42.2** — Dialog confirmación descarte. Consume el helper de labels que se introduce con F42.1, y modifica `<PendingSyncIndicator />` igual que F42.3 — hacer F42.2 antes para minimizar conflictos de merge en el mismo archivo.
5. **F42.3** — Integración offline en `<PendingSyncIndicator />`. Última porque toca el mismo archivo que F42.2 y agrega complejidad de severity branching que requiere los modos del dialog ya estables.

---

## Estructura de archivos

```
src/
├── hooks/
│   ├── usePendingSyncForEntity.ts          # F42.1 (nuevo)
│   └── usePendingSyncForEntity.test.ts     # F42.1 (nuevo)
├── components/
│   ├── layout/
│   │   ├── DiscardPendingDialog.tsx        # F42.2 (nuevo)
│   │   ├── PendingSyncIndicator.tsx        # F42.2, F42.3 (modificado)
│   │   ├── PendingSyncIndicator.test.tsx   # F42.3 (modificado)
│   │   ├── OfflineBadge.tsx                # F42.3 (BORRADO)
│   │   └── Sidebar.tsx                     # F42.5 (modificado)
│   ├── capture/
│   │   └── InboxItem.tsx                   # F42.4 (modificado)
│   ├── editor/
│   │   └── NoteCard.tsx                    # F42.1 (modificado)
│   ├── tasks/
│   │   └── TaskCard.tsx                    # F42.1 (modificado)
│   ├── projects/
│   │   └── ProjectCard.tsx                 # F42.1 (modificado)
│   └── objectives/
│       └── ObjectiveCard.tsx               # F42.1 (modificado)
├── lib/
│   └── saveQueue.ts                        # F42.1, F42.2 (extendido con helpers)
└── app/
    └── layout.tsx                          # F42.3 (quitar OfflineBadge)
```

---

## Definiciones técnicas

### D1 — Estilo del badge per-item

- **Opciones consideradas:** (a) outline en el border de la card (`ring-2 ring-amber-500`); (b) dot esquina superior-derecha (paridad con sidebar PendingSyncIndicator badge `absolute right-1 top-1`); (c) icono cloud-off inline en metadata.
- **Decisión preliminar:** dot esquina superior-derecha — mantiene convención visual del indicador global y no compite con badges existentes (favorito, distill level).
- **Razón:** outline genera mucho ruido en listas densas; icono inline pelea con tags de metadata. Dot es mínimo y consistente.
- **Final:** confirmar en Plan mode con sampling visual sobre cards reales.

### D2 — Cobertura de pending para entidades multi-queue

Notas pueden estar pending en `saveContentQueue` (content), `saveNotesMetaQueue` (meta + composite keys de suggestions), `saveNotesCreatesQueue` (creates iniciales). El hook chequea las 3 — `isPending: true` si cualquiera tiene una entry no-synced para el `noteId`.

Tasks/projects/objectives chequean meta + creates de su entidad.

Inbox solo `saveInboxQueue`. Items capturados via `QuickCaptureProvider` con `setRow` directo (path canónico D4 F38.3) NO van a queue → cobertura parcial documentada como limitación.

### D3 — Consolidación OfflineBadge → PendingSyncIndicator

- **Opciones consideradas:** (a) dejar ambos (status quo, divergencia visual cross-platform); (b) eliminar `<OfflineBadge />` y mover responsabilidad al `<PendingSyncIndicator />` (esta propuesta); (c) dejar `<OfflineBadge />` como toast efímero al detectar offline + el chip persiste para cambios pendientes.
- **Decisión:** Opción (b). Razón: dos componentes para "estado de red + cambios pendientes" generan inconsistencia y obligan al usuario a leer dos UIs. El chip ya está visible cross-platform en posición consistente (header mobile, sidebar desktop) y tiene popover con detalle — agregarle el rol de anuncio offline es low-cost y unifica el modelo mental.

### D4 — Heurística offline-pending para inbox items

`useOnlineStatus() && !item.aiProcessed` es suficiente. La CF `processInboxItem` se trigger via `onDocumentCreated`, que requiere el doc en Firestore, que requiere red. Si el doc se creó offline (path TinyBase persister o `inboxRepo.createFromCapture` queued), no hay doc en Firestore aún → CF no corre. La etiqueta "En cola" es 100% precisa para ese estado.

---

## Checklist de completado

- [ ] F42.1 a F42.5 con todos los criterios de done verificados.
- [ ] `npm run build` sin errores TS.
- [ ] `npm test` pasa, incluye tests nuevos del hook y del PendingSyncIndicator extendido.
- [ ] `npm run lint` clean.
- [ ] E2E Playwright cubre: crear nota offline → badge per-item → descartar con dialog → reconectar.
- [ ] QA manual Tauri (Windows): chip offline, descarte con dialog, badge per-item, avatar OK.
- [ ] QA manual Capacitor (Android Samsung): chip offline visible, drawer con avatar OK, inbox item offline muestra "En cola".
- [ ] Web QA: desktop + mobile viewports en Chrome.
- [ ] Deploy: hosting + tauri build + cap build (no requiere CFs).
- [ ] Commits atómicos por sub-feature, conventional commits en español.
- [ ] Merge `--no-ff` a main con commit descriptivo.
- [ ] Step 8: archivar SPEC + escalar gotchas si surgen (probable: nuevo gotcha sobre `<img onError>` fallback en `gotchas/capacitor-mobile.md` post-F42.5).

---

## Siguiente fase

F43 candidato: extender visibilidad offline a items capturados via `QuickCaptureProvider` (que hoy persisten via `setRow` directo + persister F12, fuera del modelo de queues). Requiere instrumentar el persister F12 con tracking de pending writes o migrar `QuickCaptureProvider` a `inboxRepo.createFromCapture`. Decidir cuando se llegue.
