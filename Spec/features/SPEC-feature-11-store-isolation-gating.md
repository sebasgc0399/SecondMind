# SPEC — Feature 11: Store isolation + gating correcto

> Alcance: fixear los 2 hallazgos pre-existentes que salieron en la auditoría de F10 y evaluar un 3ro, todos al lifecycle de los stores TinyBase (NO a la capa de repos).
> Dependencias: Feature 10 (capa de repos) — no es bloqueante pero F10 introdujo la auditoría que descubrió estos fixes.
> Estimado: 1 sesión de dev (1–2 días).
> Stack relevante: TinyBase v8, persister custom (`src/lib/tinybase.ts`), React Context, Firebase Auth.

---

## Objetivo

Cerrar la ventana <100ms de cross-user data leak en user switch y reemplazar los timers arbitrarios de 200ms que hoy simulan `isInitializing` en 8 hooks por un signal real sincronizado con `startAutoLoad`. Adicional: evaluar si los auth errors del persister merecen retry + backoff o se quedan como están.

Ninguno toca la capa de repos ni cambia la forma en que un componente consume datos: F10 centralizó los **writes**, F11 centraliza el **gate de lectura**. Ambos resultantes después de cerrar la feature: (a) ya no existe forma de que un click en la ventana de login escriba rows del user viejo al path del user nuevo; (b) los gates de redirect por "existencia de row" (hoy problemáticos con el 200ms, ver gotcha en ESTADO-ACTUAL) quedan confiables porque el signal refleja el estado real del persister.

---

## Features

### F1: `delTable` antes de `startAutoLoad` en user switch

**Qué:** Antes de que `useStoreInit` arranque los 7 persisters con el `userId` nuevo, limpiar cada store TinyBase con `store.delTable(tableName)`. Garantiza que no queden rows en memoria del user anterior cuando el nuevo `userId` empieza a hidratar.

**Criterio de done:**

- [ ] `useStoreInit` ejecuta `store.delTable(tableName)` para las 7 configs antes del `Promise.all` de `startAutoLoad`.
- [ ] En cleanup del useEffect (user switch o logout), después de `destroy()` cada persister, también se ejecuta `delTable` para dejar las tablas vacías.
- [ ] E2E: login como user A → captura 1 tarea → logout → login como user B (sin recargar) → tabla de tasks vacía al entrar a `/tasks`, sin flicker con la tarea de A.
- [ ] Regression: con un solo user (flujo normal), ningún flicker de "tabla vacía → hidratada" en paginas iniciales. `startAutoLoad` es rápido cuando ya hay cache del snapshot listener.

**Archivos a modificar:**

- `src/hooks/useStoreInit.ts` — agregar `store.delTable(tableName)` antes del `Promise.all` y en el cleanup.

**Notas de implementación:**

- El `delTable` antes del `startAutoLoad` es idempotente: si la tabla ya está vacía (primer login del proceso), no-op. No hay riesgo de borrar datos del user nuevo porque `startAutoLoad` todavía no escribió nada.
- Orden crítico en cleanup: `persister.destroy()` primero (desactiva `onSnapshot` + `startAutoSave`), luego `delTable`. Si se hace al revés, el snapshot listener que viene in-flight podría repoblar la tabla vacía con datos del user viejo entre el `delTable` y el `destroy`.
- **Confirmado por auditoría: `delTable` con persister activo NO borra docs en Firestore.** El custom persister de [src/lib/tinybase.ts:50-58](../../src/lib/tinybase.ts#L50-L58) es snapshot-based: el callback `setPersisted` itera `Object.entries(rows)` del snapshot. Tabla vacía → `Promise.all([])` → cero `setDoc`. Los docs permanecen intactos en Firestore. TinyBase v8 no hace diff-detection automática de tipo "esta row desapareció, borrarla". Riesgo descartado.

---

### F2: Signal real `useStoreHydration` via Context

**Qué:** Crear un Context `StoreHydrationContext` que `useStoreInit` popula con un booleano `isHydrated`. El valor pasa a `true` cuando los 7 `startAutoLoad` resolvieron (Promise.all). Los hooks consumen `useStoreHydration()` en vez de mantener su propio `useState(true)` + `setTimeout(200)`.

**Criterio de done:**

- [ ] `src/hooks/useStoreHydration.ts` nuevo: exporta `StoreHydrationProvider` + `useStoreHydration()` devolviendo `{ isHydrating: boolean }`.
- [ ] `useStoreInit` se reestructura para que el owner del provider (layout principal) pueda leer el estado. Opción canónica: `useStoreInit(userId)` retorna `{ isHydrating }` y el callsite (`src/app/layout.tsx`) lo pasa al Provider.
- [ ] Transición `isHydrating: true → false` dispara una sola vez por `userId` (cuando `Promise.all` de `startAutoLoad` resolvió).
- [ ] En user switch (`userId` cambia), `isHydrating` vuelve a `true` inmediatamente y se queda así hasta que los persisters del nuevo user terminen.
- [ ] Sin userId (logout), `isHydrating` es `true` (con `true` alcanza — el `Layout` redirige a `/login` antes de renderizar consumidores).
- [ ] `useStoreHydration()` invocado fuera del Provider devuelve `{ isHydrating: true }` como default seguro (no throw, no crash en tests/rutas no envueltas).

**Archivos a modificar:**

- `src/hooks/useStoreHydration.ts` — NUEVO: Context + Provider + hook consumer.
- `src/hooks/useStoreInit.ts` — refactor para retornar `{ isHydrating }` (hoy retorna void).
- [src/app/layout.tsx](../../src/app/layout.tsx) — el componente `Layout` ya llama `useStoreInit(user?.uid ?? null)` en la línea 29. Montar `<StoreHydrationProvider value={{ isHydrating }}>` dentro del mismo `Layout`, envolviendo `<CommandPaletteProvider>` (o al mismo nivel). Hook + Provider viven en el mismo componente → wiring natural, no requiere reestructurar el árbol.

**Notas de implementación:**

- El estado del Provider cuando `userId` es null: por simplicidad, `isHydrating: true`. Los hooks de skeleton se comportan idéntico al actual (muestran skeleton hasta que hay user + datos hidratados). Si más adelante algún caller distingue "sin user" de "cargando datos", se agrega un discriminator.
- Evitar hook específico `useIsUnauthenticated` o similares. Scope acotado.
- El `Layout` renderiza `<Navigate to="/login">` si no hay user (layout.tsx:39-41), entonces los consumidores de `useStoreHydration()` solo existen en el árbol cuando `user` está presente. Primer render con user autenticado: `isHydrating: true` hasta que `Promise.all` resuelve.
- **Rutas top-level fuera del Layout NO necesitan Provider:** `/login` y `/capture` (Tauri) son siblings del Layout en el router. Confirmado por auditoría: `/login` solo usa `useAuth`; `/capture` solo usa `useAuth` + `setDoc` directo, no consume hooks de stores hidratados. Tampoco `useShareIntent` (Capacitor) — no lee stores, solo abre el modal QuickCapture.
- **StrictMode double-mount en dev:** `<StrictMode>` está activo en `src/main.tsx`. El useEffect de `useStoreInit` ejecuta 2x en dev → `Promise.all` se cancela y reinicia. El Provider podría ver `isHydrating: true → false → true → false` en dev. Mitigación: usar el patrón `userIdRef` que solo dispara `setIsHydrating(false)` si el `userId` del callback coincide con el `userId` actual del effect (evita resolver el Promise.all de un userId obsoleto). En prod (sin StrictMode) no aplica.

---

### F3: Migrar 8 consumidores al signal real + reemplazar grace de redirect

**Qué:** Los 8 hooks y componentes que hoy mantienen `useState(true) + setTimeout(200)` eliminan ese patrón y leen `isHydrating` de `useStoreHydration()`. Re-exportan en su return como `isInitializing` (misma shape para callers). Adicionalmente, el grace de redirect de 1500ms en `projects/[projectId]/page.tsx` se reemplaza por una condición determinística basada en el signal real.

**Criterio de done:**

- [ ] `grep "setTimeout.*setIsInitializing\|INIT_GRACE_MS" src/hooks src/components` → 0 matches.
- [ ] `useTasks`, `useProjects`, `useObjectives`, `useHabits`, `useInbox`, `useNoteSearch`, `useDailyDigest` delegan `isInitializing` a `useStoreHydration()`.
- [ ] `useHybridSearch` sigue retornando su `isInitializing` actual (ya delega a `useNoteSearch`, que cambia internamente).
- [ ] `RecentNotesCard` (único componente con `isInitializing` local) delega a `useStoreHydration()`.
- [ ] `projects/[projectId]/page.tsx`: el grace de 1500ms (líneas 42-60) queda reemplazado por `isHydrating === false && !project` como condición del redirect. El `useState(redirectGraceExpired)` + `setTimeout(1500)` se borran.
- [ ] Paginas con `showSkeleton = isInitializing && items.length === 0`: comportamiento visual idéntico al actual en cold load; MEJOR en full-reload directo por URL (antes: >200ms → skeleton desaparece antes de que haya datos, ahora: se mantiene hasta hidratación real).

**Archivos a modificar:**

- `src/hooks/useTasks.ts`, `src/hooks/useProjects.ts`, `src/hooks/useObjectives.ts`, `src/hooks/useHabits.ts`, `src/hooks/useInbox.ts` — borrar el `useState` + `useEffect` con timer, delegar al hook nuevo.
- `src/hooks/useNoteSearch.ts`, `src/hooks/useDailyDigest.ts` — mismo patrón.
- `src/hooks/useHybridSearch.ts` — no cambia (consume el `isInitializing` de `useNoteSearch` que ahora es real).
- `src/components/dashboard/RecentNotesCard.tsx` — reemplazar el state local por `useStoreHydration()`.
- `src/app/projects/[projectId]/page.tsx` — eliminar el grace de 1500ms y su `useEffect` asociado; el redirect dispara cuando `!isHydrating && !project`.

**Notas de implementación:**

- El gotcha documentado en ESTADO-ACTUAL ("`isInitializing` 200ms no es suficiente para gates de redirect por existencia de row") queda resuelto automáticamente — el signal nuevo espera a que el persister realmente termine, incluso con network lento. Cleanup del gotcha en ESTADO-ACTUAL es parte del step 8 del SDD al cerrar F11.
- El grace de 1500ms en ProjectDetailPage era un workaround específico para el mismo problema: el `isInitializing` de `useProjects` (timer 200ms) no era confiable para decidir "el proyecto no existe". Con el signal real, la condición se vuelve determinística: esperar `isHydrating === false` es esperar que `startAutoLoad` haya terminado, independiente del tiempo que tome.
- **Auditoría confirma que NO hay otros redirects análogos.** `notes/[noteId]/page.tsx:58-66` ya usa observable real (`isLoading` de `useNote.getDoc`, no timer); fuera de scope. Páginas list (`/projects`, `/notes`, `/tasks`, etc.) no redirigen por "row no existe", muestran empty state — heredan el fix automáticamente vía F3 del hook correspondiente.
- **`usePendingInboxCount` (useInbox.ts:121-130) NO requiere migración.** Retorna directo un `number`, sin exponer `isInitializing`. Durante hidratación devuelve 0; tras `startAutoLoad` se actualiza. Caller (Sidebar badge) tolera el 0 inicial sin flicker observable.
- **Edge case "navegar a row recién creada" cubierto.** El factory `createFirestoreRepo` hace `setRow` sync antes de `await setDoc`. Caller hace `await repo.create() → navigate()`. Página destino monta con `isHydrating: false` (ya hidratado) + `project` presente en store → no triggerea redirect.
- Si durante la migración aparecen otros redirects por existencia de row con patrón similar (detalle no visible hoy en grep), se amplía el scope de F3 en el mismo commit. No merecen feature separada.

---

### F4: Evaluación — retry + backoff para auth errors en el persister

**Qué:** Spike de investigación (no implementación incondicional). Hoy [src/lib/tinybase.ts:25-28](../../src/lib/tinybase.ts#L25-L28) silencia `permission-denied` y `unauthenticated` porque son esperables tras sign out. La pregunta es si hay casos donde un retry + backoff corto evita un bug silencioso — por ejemplo, token expirado mid-sesión que Firebase refresca solo pero entre medio el listener ya cayó.

**Pre-bias documentado:** la auditoría sugiere que la conclusión esperable es **descartar**. Firebase Auth refresca tokens cada ~1h automáticamente; el listener `onSnapshot` se re-establece solo cuando el SDK detecta el token refresh. Un retry custom duplicaría trabajo del SDK y arriesga loops en logout legítimo (donde `permission-denied` es esperado y ya se silencia a propósito). El spike es para confirmar empíricamente, no para justificar la implementación.

**Criterio de done:**

- [ ] F5 incluye el escenario "token expiry mid-sesión" — única evidencia necesaria.
- [ ] Si la UI converge a Firestore en <1s tras un write post-1h sin intervención: descartar F4 con nota explícita en commit message + ESTADO-ACTUAL. Cierra F4 sin cambios de código.
- [ ] Si la UI NO converge (caso improbable según la auditoría): implementar `handleListenerError` con backoff exponencial (250ms / 500ms / 1s); max 3 intentos; tras el último, loggea y desiste. Solo en este caso modificar `src/lib/tinybase.ts`.

**Archivos a modificar (condicional, baja probabilidad):**

- `src/lib/tinybase.ts` — solo si el spike concluye implementar.

---

### F5: E2E validation — 3 escenarios

**Qué:** Validar los 3 escenarios que motivaron la feature, con Playwright MCP apuntando al dev server.

**Criterio de done:**

- [ ] **User switch rápido:** login user A → captura 1 tarea → logout → login user B (sin reload) → `/tasks` muestra skeleton, luego tabla vacía. En ningún momento aparece la tarea del user A. Verifica F1.
- [ ] **Network lento (throttle DevTools Slow 3G):** full-reload en `/tasks` con 3 tareas reales → skeleton visible hasta que el `startAutoLoad` resuelve (segundos, no 200ms) → tabla poblada. No aparece el empty state intermedio. Verifica F2+F3.
- [ ] **Token expiry mid-sesión:** dejar abierta la app >1h (o forzar expiry via DevTools Application → Clear Storage del refresh token). Hacer un `createTask` después. Observar si la UI converge con el write en <1s. Evidencia para la decisión F4.
- [ ] Regression: dashboard + todas las páginas que consumen `isInitializing` siguen mostrando skeleton correctamente en cold load sin flicker.

**Archivos a modificar:**

- Ninguno (solo validación manual via Playwright MCP).

---

## Orden de implementación

1. **F1** → cambio chico y aislado; baseline del fix crítico (data leak). Se puede testear solo E2E sin depender del resto.
2. **F2** → infra del signal real; precondición de F3. Sin F2, los hooks no tienen de dónde leer.
3. **F3** → migración mecánica de 8 callsites al signal de F2. Grande en count de archivos pero cambio trivial por archivo (borrar ~5 líneas, agregar 1).
4. **F4** → spike paralelizable con F3 (no depende de F2/F3). Se puede hacer antes, durante, o después.
5. **F5** → validación E2E al final, con todo integrado. Los 3 escenarios cubren los fixes de F1+F2+F3 y producen evidencia para F4.

---

## Estructura de archivos

```text
src/
├── hooks/
│   ├── useStoreInit.ts         # modificado (F1, F2)
│   └── useStoreHydration.ts    # NUEVO (F2)
└── lib/
    └── tinybase.ts             # modificado solo si F4 concluye implementar
```

Plus edits de retorno en los 8 consumidores (F3) sin archivos nuevos.

---

## Definiciones técnicas

### Shape del Provider de F2

- **Opciones consideradas:**
  - (A) `useStoreInit` retorna `{ isHydrating }` y el callsite envuelve children manualmente en `<StoreHydrationProvider value>`.
  - (B) `useStoreInit` internamente llama al setter del Provider (pattern "self-wiring") y el callsite solo monta `<StoreHydrationProvider>` una vez.
  - (C) Un store TinyBase global `metaStore` con una row `{ isHydrating }` que los hooks leen con `useCell`.
- **Decisión:** (A).
- **Razón:** (B) acopla Provider y hook, (C) suma otro store + persister (overkill — no necesita persistencia). (A) es estándar React y hace explícito el wiring en el layout. El callsite tiene 1-2 líneas extra.

### Tipo de error que silencia F1 en cleanup

- **Opción A:** `delTable` siempre, sin guard.
- **Opción B:** `delTable` solo si `cancelled`, para no borrar en unmount normal (p.ej. hot reload).
- **Decisión:** A.
- **Razón:** En unmount normal el userId sigue siendo el mismo; la próxima montura hidrata desde cero. Delete sin guard no causa daño observable porque las tablas se repueblan inmediatamente tras `startAutoLoad`. B agrega complejidad por un caso que no existe.

---

## Checklist de completado

- [ ] F1: `useStoreInit` llama `delTable` pre-init y en cleanup; E2E user switch sin leak.
- [ ] F2: `useStoreHydration` + Provider montado; `isHydrating` sincronizado con `Promise.all`.
- [ ] F3: 8 consumidores migrados; `grep INIT_GRACE_MS` → 0; grace de 1500ms en `projects/[projectId]/page.tsx` reemplazado por condición basada en `isHydrating`; skeleton se mantiene durante full-reload slow network.
- [ ] F4: decisión documentada (implementar o descartar con justificación).
- [ ] F5: 3 escenarios validados via Playwright MCP + reporte breve con evidencia.
- [ ] `npm run build` + `npm run lint` verdes.
- [ ] Gotcha de ESTADO-ACTUAL "`isInitializing` de hooks (200ms) no es suficiente" eliminado (ya no aplica).
- [ ] Gotcha de ESTADO-ACTUAL "Cross-user data leak potencial (pre-existente)" eliminado (ya no aplica).

---

## Hallazgos de auditoría pre-implementación

Resumen del audit con 4 subagentes (delTable × persister, edge cases del Provider, otros patterns de grace, caches module-level). Los riesgos se cerraron en el SPEC mismo; quedan como referencia.

- **F1 NO borra Firestore.** El custom persister es snapshot-based y `Object.entries({}).map() → Promise.all([])` no dispara `setDoc`. Los docs de Firestore quedan intactos. Riesgo principal evaluado y descartado.
- **F1 cubre TODA la fuente de leak cross-user de stores.** Auditoría mapeó todos los caches module-level: los 7 stores TinyBase son los únicos con leak risk. El cache de embeddings (`src/lib/embeddings.ts`) ya está hardened con `cachedUid` guard + `invalidateEmbeddingsCache()` en signOut. Los listeners TipTap, Orama indices per-hook, y refs del QuickCaptureProvider son safe.
- **F2 + StrictMode:** double-mount en dev introduce posible flicker `true → false → true` en el signal. Mitigación con `userIdRef` en useStoreInit (ver F2 notas). En prod no aplica.
- **F2 default value:** `{ isHydrating: true }` cuando se invoca fuera del Provider (skeleton seguro, sin crash).
- **F3 sin scope creep:** `notes/[noteId]/page.tsx` ya usa observable real (`useNote.isLoading` de `getDoc`) — fuera de scope. El único redirect-por-row con grace es `projects/[projectId]/page.tsx`. `usePendingInboxCount` no requiere migración (retorna `number` directo, tolera el 0 inicial).
- **Orama edge case:** existe race teórico (<100ms) si el user tipea query antes de que `startAutoLoad` termine. F2 lo cubre porque el signal real sincroniza el rebuild de Orama con la hidratación del store.
- **F4 alta probabilidad de descartarse.** Firebase Auth refresca tokens y re-arma `onSnapshot` solo. El spike de F5 es el único trabajo necesario; conclusión esperada = no implementar nada.

---

## Siguiente fase

Con F11 cerrada, queda F12 (persister diff-based) como único hallazgo pre-existente sin resolver — baja prioridad hasta dogfooding con >200 items/user. No habilita ninguna feature nueva directa; es estabilidad de infraestructura.
