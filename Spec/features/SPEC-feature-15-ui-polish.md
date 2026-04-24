# SPEC — Feature 15: UI polish post-dogfooding

> Alcance: eliminar scrollbar fantasma en Tareas, reemplazar loaders de texto por skeletons, normalizar ortografía y tono imperativo en todas las cadenas UI, eliminar duplicación de título en mobile.
> Dependencias: Ninguna.
> Estimado: 1 sesión (~2 h dev + E2E).
> Stack relevante: React 19 + Tailwind v4 + TipTap (cadenas del ReviewBanner).
> Rama: `feat/ui-polish-dogfooding`.

---

## Objetivo

Tour de dogfooding con Playwright sobre 9 páginas × 2 viewports destapó 4 categorías de issues visuales que degradan la percepción de calidad sin afectar funcionalidad. F15 los resuelve todos en un pase coordinado: scrollbar fantasma que el user vio en Tareas, loaders de texto plano que violan la regla CLAUDE.md "skeleton siempre, spinner/texto nunca", cadenas con voseo mezclado con imperativo peninsular + ~8 typos de tildes (revisión, próxima, aún, conexión, más, ningún, periódica), y duplicación de título en mobile (header mobile + H1 interno con el mismo texto).

Al completar F15: la app se siente consistente y pulida en ambos viewports, sin glitches visuales ni copy inconsistente. Primer deploy visible solo-hosting, sin bump de versión.

---

## Features

### F15.1: Scrollbar fantasma en tabs de Tareas

**Qué:** agregar `overflow-y-hidden` al `<nav>` de tabs en `/tasks` para evitar que Chrome/Edge renderee scrollbar vertical espurio cuando `overflow-x-auto` implícitamente hace `overflow-y: auto`.

**Criterio de done:**

- [ ] Viewport 1280×800 en `/tasks` con lista vacía: cero scrollbar visible a la derecha de los tabs.
- [ ] Viewport 375×667 en `/tasks`: ídem.
- [ ] Scroll horizontal sigue funcionando si se añaden tabs y el viewport no alcanza (comportamiento preservado).

**Archivos a modificar:**

- `src/app/tasks/page.tsx:109` — agregar `overflow-y-hidden` al className del `<nav>`.

**Snippet:**

```diff
- <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
+ <nav className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
```

---

### F15.2: Loaders con shell skeleton, no texto plano

**Qué:** reemplazar los dos `<p>Cargando...</p>` existentes por un shell skeleton que preserva el layout de la app (sidebar placeholder + main placeholder) en vez de texto centrado sobre fondo negro. Evita layout shift al terminar la hidratación y alinea con la regla universal CLAUDE.md "skeleton siempre, spinner nunca".

**Criterio de done:**

- [ ] Cold-load de `https://localhost:5173/` en desktop: mientras `useAuth.isLoading === true`, se ve un shell skeleton (sidebar lateral + main con ~3 blocks animate-pulse), no "Cargando...".
- [ ] Mismo cold-load en mobile 375px: se ve skeleton del header mobile (barra top) + main con blocks, no "Cargando...".
- [ ] Cuando `isLoading` pasa a `false` con usuario válido: transición sin layout shift perceptible al render real.
- [ ] En `/login` el loader breve pre-form también usa un skeleton mínimo (centered card-placeholder), no texto.

**Archivos a modificar:**

- `src/app/layout.tsx:32-38` — reemplazar el bloque `isLoading` por un shell skeleton React. Mantener la guard `if (isLoading) return <Shell />` al principio del componente.
- `src/app/login/page.tsx:19` — reemplazar `<p>Cargando...</p>` por un card skeleton centered (evita parpadeo del form al aparecer).

**Notas de implementación:**

- **Patrón a reusar:** las páginas existentes ya tienen skeletons inline (ej. `TasksSkeleton` en `src/app/tasks/page.tsx:162-173` con `animate-pulse rounded bg-muted`). Usar exactamente el mismo shape (`h-4 w-3/4 animate-pulse rounded bg-muted` en stacks de 3-5 bloques). No crear utility nueva — copia directa de 5-10 líneas.
- **Responsive:** detectar viewport via `useBreakpoint()` ya disponible en `layout.tsx:27`. El shell muestra sidebar solo en desktop/tablet; en mobile muestra barra superior placeholder.
- **No tocar `useStoreInit`:** el gate de hidratación post-auth ya genera skeletons apropiados en cada página (F11). F15.2 solo cubre el pre-auth gate en `layout.tsx`.

---

### F15.3: Normalizar ortografía y tono a imperativo neutro

**Qué:** corrección textual en 2 ejes: (a) tildes faltantes en ~8 palabras recurrentes (revisión, próxima, aún, conexión, más, ningún, periódica, sincronizarán), y (b) convertir todo el voseo rioplatense (`Creá`, `Revisá`, `Escribí`, `Intentá`) a imperativo neutro (`Crea`, `Revisa`, `Escribe`, `Intenta`). Sin tocar lógica, sin tocar estructura — solo strings.

**Criterio de done:**

- [ ] `rg -n "Creá|Revisá|Escribí|Intentá|Probá|Pegá|Hacé" src/` = 0 matches.
- [ ] `rg -n "revision|Proxima|aun\.|conexion|periodica|sincronizaran|Ningun nodo|mas notas" src/` = 0 matches.
- [ ] Cada cadena modificada conserva su semántica (no cambia de significado, solo forma).
- [ ] Validar con lectura de las 4 páginas que más texto muestran: Tareas (empty state), Proyectos (empty state), Objetivos (empty state), detalle de nota con ReviewBanner activo.

**Archivos a modificar (15 archivos, ~22 strings):**

- `src/components/capture/QuickCapture.tsx:58` — `Escribí` → `Escribe`.
- `src/app/capture/page.tsx:115` — `Escribí` → `Escribe`.
- `src/app/tasks/page.tsx:179` — `Creá una tarea arriba o revisá el tab` → `Crea una tarea arriba o revisa el tab`.
- `src/app/projects/[projectId]/page.tsx:262` — `Creá una tarea` → `Crea una tarea`.
- `src/app/projects/page.tsx:81` — `Creá tu primer proyecto` → `Crea tu primer proyecto`.
- `src/app/objectives/page.tsx:123` — `Creá tu primer objetivo` → `Crea tu primer objetivo`.
- `src/components/editor/DistillIndicator.tsx:25` — `Escribí un resumen` → `Escribe un resumen`.
- `src/hooks/useAutoUpdate.ts:73` — `Revisá tu conexión e intentá de nuevo` → `Revisa tu conexión e intenta de nuevo`.
- `src/components/editor/ReviewBanner.tsx:36,48,75,89` — `Proxima revision` → `Próxima revisión`, `Esta nota necesita revision` → `Esta nota necesita revisión`, `Activar revision periodica` → `Activar revisión periódica`.
- `src/components/editor/SimilarNotesPanel.tsx:25,35` — `Disponible cuando vuelva la conexion` → `Disponible cuando vuelva la conexión`, `Sin notas similares aun` → `Sin notas similares aún`.
- `src/app/inbox/page.tsx:65` — `Requiere conexion a internet` → `Requiere conexión a internet`.
- `src/components/dashboard/InboxCard.tsx:28` — `Requiere conexion a internet` → `Requiere conexión a internet`.
- `src/components/layout/OfflineBadge.tsx:13` — `Sin conexion — los cambios se sincronizaran` → `Sin conexión — los cambios se sincronizarán`.
- `src/app/notes/graph/page.tsx:42,60,61` — `conexion/conexiones` → `conexión/conexiones`, `Ningun nodo` → `Ningún nodo`, `mas notas y conexiones` → `más notas y conexiones`.
- `src/components/graph/GraphNodePanel.tsx:81` — `conexion/conexiones` → `conexión/conexiones`.

**Notas de implementación:**

- Mass-rename candidato a `sed`-like, pero con regex literal. Hacer string-by-string con Edit tool en vez de `replace_all` para evitar pisar interpolaciones en templates (ej. `conexiones` debe quedar igual en plural, solo el singular `conexion` → `conexión`). El grep inicial sirve de checklist.
- No tocar cadenas en `Docs/`, `Spec/`, ni `.github/workflows/`. Solo `src/`.
- Verificar con el mismo grep al final: 0 matches.

---

### F15.4: Ocultar H1 interno en mobile (header mobile suficiente)

**Qué:** en mobile (<768px), el `MobileHeader` ya renderea el título de la página con `getPageTitle(pathname)` en un `<h1>` del header sticky. Cada página además renderea un `<h1>` interno con el mismo texto — duplicación. F15.4 oculta el H1 interno de las páginas con la utility `hidden md:block` (o equivalente en el container del header de la página), dejando el MobileHeader como único título en mobile y preservando el H1 en desktop.

**Criterio de done:**

- [ ] Viewport 375×667 en `/tasks`: se ve "Tareas" solo en el header superior, no un segundo "Tareas" debajo.
- [ ] Idem `/notes`, `/projects`, `/objectives`, `/habits`, `/inbox`, `/settings`, `/notes/graph`.
- [ ] Viewport 1280×800: el H1 sigue visible en cada página (no hay MobileHeader en desktop).
- [ ] Excepción intencional: Dashboard (`/`) conserva el saludo `Buenas noches, sebastian` como `<h1>` en mobile porque es copy personalizado, no duplicación del nav.
- [ ] Accesibilidad: cada página sigue teniendo exactamente un `<h1>` en el DOM (el del MobileHeader en mobile, el interno en desktop — nunca ambos).

**Archivos a modificar (8 páginas):**

- `src/app/tasks/page.tsx` — header con `<h1>Tareas</h1>` → wrap container con `hidden md:block`.
- `src/app/projects/page.tsx` — idem "Proyectos".
- `src/app/objectives/page.tsx` — idem "Objetivos".
- `src/app/habits/page.tsx` — idem "Hábitos".
- `src/app/inbox/page.tsx` — idem "Inbox".
- `src/app/settings/page.tsx` — idem "Ajustes".
- `src/app/notes/page.tsx` — idem "Notas".
- `src/app/notes/graph/page.tsx` — `<h1>Grafo</h1>` en el header (línea 39). El header tiene más elementos (back link, counts, fullscreen button) — el H1 va a `hidden md:inline` pero los demás elementos se preservan.

**Notas de implementación:**

- **Excepción Dashboard:** `src/app/page.tsx` renderea `"Buenas noches, sebastian"` — NO tocar. El saludo es copy distinto del header ("Dashboard") y aporta valor personal.
- **Accesibilidad del H1 único:** MobileHeader en [src/components/layout/MobileHeader.tsx:36](../../src/components/layout/MobileHeader.tsx#L36) ya usa `<h1>`. Las páginas mobile quedan con un solo H1 = el del header sticky. Páginas desktop no renderean MobileHeader, quedan con un solo H1 = el interno de la página. Heading structure correcta en ambos viewports.
- **Utility Tailwind:** `hidden md:block` aplicado al elemento wrapper del header de cada página. Si el header interno tiene flex-layout con otros elementos (ej. Grafo con back link + fullscreen button), solo el H1 lleva `hidden md:inline`, no el container completo.

---

## Orden de implementación

1. **F15.3** primero. String-only, no toca componentes, sirve de baseline limpio antes de tocar markup. Grep-based checklist al final confirma 0 voseo y 0 typos. Riesgo cero.
2. **F15.1** segundo. Una palabra Tailwind en un archivo. Cero riesgo.
3. **F15.4** tercero. Cambio de markup en 8 archivos (`hidden md:block`). Cero riesgo de lógica, solo layout. Se valida con Playwright en ambos viewports.
4. **F15.2** último. Más LoC (shell skeleton nuevo) y toca el gate crítico del `layout.tsx` que envuelve toda la app. Dejarlo al final asegura que el resto del SPEC ya esté validado antes de tocar el root — y deja el test manual del cold-load como último paso del E2E.

---

## Estructura de archivos

No se crean archivos nuevos. Solo modificaciones a 24 archivos existentes (15 de F15.3 + 1 de F15.1 + 8 de F15.4 + 2 de F15.2, con overlaps).

---

## Definiciones técnicas

### Decisión D1: Strip total de voseo (no solo normalizar tildes)

- **Opciones consideradas:** (A) corregir solo tildes, mantener voseo — (B) voseo consistente en toda la app — (C) imperativo neutro consistente.
- **Decisión:** C (imperativo neutro).
- **Razón:** la app ya mezcla ambos estilos en distintas páginas, lo cual se lee como inconsistencia aunque sea entendible. El imperativo neutro es la forma más estándar en UIs de software en español (evita marcar un registro regional) y es lo que el user confirmó al cerrar scope. Si en el futuro se decide voseo, es un mass-rename simétrico desde un codebase limpio.

### Decisión D2: Shell skeleton reusa patrón inline existente, sin utility nueva

- **Opciones consideradas:** (A) crear `<AppShellSkeleton>` componente reusable — (B) inline en `layout.tsx` con Tailwind classes.
- **Decisión:** B.
- **Razón:** la regla CLAUDE.md "Three similar lines beat premature abstraction". El skeleton del app-gate se renderea en un solo lugar (`layout.tsx`), no hay candidatos de reuso. Inline con `animate-pulse rounded bg-muted` es ~15 líneas. Extraerlo a componente agrega indirección sin ahorrar.

### Decisión D3: Dashboard conserva H1 con saludo personalizado

- **Opciones consideradas:** (A) ocultar H1 de Dashboard también por consistencia — (B) excepción explícita.
- **Decisión:** B.
- **Razón:** el saludo `Buenas noches, sebastian` no duplica el label del nav (el header mobile dice "Dashboard"). Es copy de valor que no se debe esconder. La regla es "ocultar H1 cuando duplica el nav"; Dashboard no cumple el predicado.

---

## Checklist de completado

Al terminar F15, TODAS estas condiciones deben ser verdaderas:

- [ ] `npm run build` pasa sin errores TypeScript.
- [ ] `npm run lint` pasa sin warnings nuevos (pre-existentes en `orama.ts`, `useResurfacing.ts`, `tinybase.test.ts` no bloquean).
- [ ] `rg -n "Creá|Revisá|Escribí|Intentá" src/` = 0 matches.
- [ ] `rg -n "revision |Proxima |aun\.|conexion | periodica|sincronizaran|Ningun | mas notas" src/` = 0 matches (con delimitadores para evitar falsos positivos en palabras compuestas).
- [ ] Playwright E2E en viewport 1280×800: Dashboard, Tareas, Notas, Grafo, Hábitos — H1 visible en cada página. Tabs de Tareas sin scrollbar fantasma. Shell skeleton en cold-load.
- [ ] Playwright E2E en viewport 375×667: mismas páginas, H1 interno oculto (salvo Dashboard), header mobile único título. Cold-load con shell skeleton adaptado a mobile (barra top + blocks).
- [ ] Commit atómico por sub-feature (4 commits sub-feature + 1 commit SPEC prescriptivo + 1 merge commit).
- [ ] Merge `--no-ff` a main + push origin.
- [ ] Deploy solo-hosting (`npm run build && npm run deploy`). Tauri/Android **opcionales** — F15 es 100% client-side en `src/`.
- [ ] Step 8 SDD: archivar SPEC como registro de implementación. Evaluar escalación de gotchas — candidatos: (a) `overflow-x-auto` sin `overflow-y-hidden` dispara scrollbar vertical en Chrome/Edge (Windows) → ESTADO-ACTUAL si aplica a >1 feature, (b) convención de copy "imperativo neutro" para futuras strings → CLAUDE.md si aplica a toda sesión, (c) patrón "H1 interno oculto en mobile cuando MobileHeader ya lo muestra" → ESTADO-ACTUAL sección UI.

---

## Siguiente fase

Ninguna planificada por F15. El backlog de `ESTADO-ACTUAL > Candidatos próximos` queda intacto (Command Palette tab semántico, AI-suggested links, code blocks con syntax highlighting, etc.). La próxima feature se elige al arrancar la siguiente sesión.
