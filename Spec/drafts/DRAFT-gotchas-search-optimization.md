# DRAFT — Optimizar búsqueda de gotchas (split por dominio + skill BM25 + flujo SDD con subagente)

> **Estado:** DRAFT / discovery — **NO es un SPEC formal**
> **Vida útil:** temporal. Eliminar este archivo al convertirlo en un `SPEC-feature-N-*.md` (o, si las fases se ejecutan como housekeeping sin SPEC formal, al merge del último PR de la serie).
> **Redactado en:** PC personal (sesión Claude Code), 2026-04-29
> **Disparador:** `Spec/ESTADO-ACTUAL.md` mide hoy 340 líneas con 17 secciones de gotchas por dominio bajo `## Arquitectura y gotchas por dominio` ([ESTADO-ACTUAL.md:60-277](../ESTADO-ACTUAL.md#L60-L277)). El paso 8 del SDD escala gotchas a este archivo cada vez que se cierra una feature, y el paso 2 SDD (plan mode) requiere consultar gotchas relevantes antes de codear. Hoy ambos flujos son manuales (Sebastián / agente principal carga el archivo entero), y el costo escala monotónicamente con cada feature cerrada.

> **Estado post-F37 (Mayo 2026):** Fase A (split en 15 archivos `Spec/gotchas/<dominio>.md`) + Fase B (skill local `gotchas-search` con BM25) + F7 acotado (5 pointers en `CLAUDE.md`) implementadas. **Fase C diferida** (subagentes `gotchas-researcher` + `gotcha-classifier` + reescritura completa de pasos 2/8 SDD en `CLAUDE.md`) hasta evidencia de fricción manual al consultar la skill directamente — re-evaluar tras 5+ features post-cierre. DRAFT preservado para reactivar Fase C si surgen señales (ver SPEC F37 § Validación post-cierre).

---

## 1. Objetivo

Tres metas ligadas:

1. **Reducir el costo en tokens** que paga un agente para consultar el gotcha relevante a su tarea — sin tener que cargar también los gotchas de los 16 dominios que no le aplican.
2. **Mantener la disciplina de escalación** del paso 8 SDD ("nacen en SPEC → suben a ESTADO-ACTUAL → suben a CLAUDE.md") sin que el archivo intermedio se vuelva inviable de leer entero.
3. **Automatizar el flujo de gotchas en el SDD vía subagente + skill on-demand**: el agente principal nunca paga el costo de cargar gotchas. En paso 2 (plan mode) y paso 8 (cierre de feature), un subagente especializado invoca la skill `gotchas-search`, recolecta los gotchas relevantes, **verifica que sigan siendo válidos** contra el código actual + context7 / web si aplica, y reporta hallazgos sintéticos. La skill queda on-demand (no en contexto auto-cargado) para no inflar el contexto base.

## 2. Problema y por qué esto merece ser feature (no edición puntual)

Hoy `Spec/ESTADO-ACTUAL.md` cumple **dos funciones a la vez**:

- **Índice de features** (lista de fases completadas + 1-2 líneas + pointer a SPEC). Función liviana.
- **Canon de gotchas por dominio** (cuerpo completo de cada gotcha, ejemplos, paths, anti-patterns). Función pesada que crece monotónicamente.

Mezclarlas significa que **no se puede leer el índice barato sin pagar también el canon**. Cuando un agente quiere "el gotcha de TipTap sobre marks en text nodes" o "el patrón de optimistic updates con setPartialRow", carga las 340 líneas completas, filtra mentalmente, y descarta el 90% del contenido.

A 4 dominios más (FSRS detallado, sync offline, releases, etc.) el archivo cruza las ~500 líneas. CLAUDE.md tiene techo orientativo de 200, ESTADO-ACTUAL no tiene techo declarado pero el espíritu de la jerarquía implica que algún punto se vuelve inviable.

Además, hoy **no hay un patrón explícito** sobre quién consulta gotchas y cuándo. La skill `subagent-orchestration` describe cuándo delegar (paso 2 SDD = Explore agents + Plan agent), pero no incluye un subagente dedicado a recolectar gotchas. Resultado: el agente principal termina cargando ESTADO-ACTUAL.md en su contexto cada vez que arranca una feature de cierto dominio, mezclando contexto de gotchas con el contexto de código que está produciendo. Y al cerrar la feature (paso 8), la clasificación + escalación del gotcha también la hace el agente principal, que ya está saturado de contexto del trabajo.

Diferencia con un fix puntual: no es un bug ni una mejora de feature — es un cambio en cómo se organiza la documentación + cómo el SDD consume y produce gotchas. Afecta el SDD (pasos 2 y 8), CLAUDE.md (sección "Docs: jerarquía y reglas" + sección "Delegación a subagentes"), y futuros gotchas. Merece quedar registrado, decidirse explícitamente y documentarse como decisión arquitectónica.

### Contexto del journey (para registro)

La sesión arrancó con Sebastián observando el crecimiento de ESTADO-ACTUAL.md y pidiendo propuestas para optimizar la búsqueda de gotchas pensando en eficiencia de la AI. Iteración rápida produjo tres opciones:

- **Índice + split por dominio** — separar canon de índice, un archivo por dominio.
- **Skill `gotchas-search` con BM25** — capa de búsqueda sobre el corpus, similar a `ui-ux-pro-max`.
- **Promoción automática a CLAUDE.md de gotchas que se repiten** — descartada (criterio subjetivo, no resuelve el problema de fondo, solo mueve líneas a otro archivo con techo más bajo).

Tras la primera redacción del draft, Sebastián agregó la dimensión clave: **el flujo de gotchas en el SDD debe delegarse a un subagente**, tanto en paso 2 (consulta inicial) como en paso 8 (clasificación + escalación). La skill es la herramienta del subagente. Y el subagente, además de buscar, debe **verificar la veracidad del gotcha** antes de devolver el hallazgo — gotchas se vuelven obsoletos cuando el código cambia, y ratificar al subagente "encontré X" sin verificar puede empujar al agente principal a aplicar un gotcha que ya no aplica.

Las tres dimensiones (split, skill, flujo SDD con verificación) se consolidan en este draft como un plan de tres fases.

## 3. Decisión preliminar

**Plan en tres fases secuenciales, todas necesarias.** Antes Fase B era condicional, pero el flujo de subagente (Fase C) la requiere — sin skill no hay forma de que el subagente busque eficientemente, y sin corpus por dominio (Fase A) no hay qué indexar.

- **Fase A — Split por dominio.** Mover el canon de gotchas de `ESTADO-ACTUAL.md` a `Spec/gotchas/<dominio>.md`, dejar índice de 1 línea en `ESTADO-ACTUAL.md`. Prerequisito de B y C.
- **Fase B — Skill `gotchas-search`.** Skill local en `~/.claude/skills/gotchas-search/` con BM25 sobre el corpus por dominio. Patrón clonado de `ui-ux-pro-max`. On-demand, no auto-cargada.
- **Fase C — Integración con SDD vía subagente.** Documentar en `CLAUDE.md` que paso 2 y paso 8 del SDD delegan gotchas a un subagente que invoca la skill **+ verifica** los hallazgos contra código actual / context7 / web antes de devolver.

**Defensa del orden:** A es prerequisito de B (sin corpus no hay qué indexar). B es prerequisito de C (sin skill el subagente no tiene herramienta diferenciada del agente principal). C es donde el valor concreto se materializa — sin C, A+B son optimizaciones de archivos sin que el flujo del SDD las aproveche.

**Defensa del subagente vs agente principal:** delegar gotchas a un subagente protege el contexto del agente principal (que va a producir código), permite paralelizar (un subagente busca gotchas mientras otros Explore agents buscan patrones), y formaliza el patrón de verificación obligatoria (el subagente tiene un mandato claro: "no devuelvas el gotcha sin verificar"). Es coherente con el principio rector ya documentado en CLAUDE.md: "la síntesis no se delega; el subagente recolecta, la decisión y el entendimiento son tuyos".

## 4. Implicaciones técnicas identificadas

Profundizar al armar el SPEC formal (si aplica) o al planificar los PRs por fase.

### 4.1. Estructura nueva — `Spec/gotchas/<dominio>.md`

Un archivo por dominio. Granularidad propuesta: replicar las 17 secciones actuales de `ESTADO-ACTUAL.md:62-277` como base, con consolidación posterior si algún archivo queda con <3 gotchas y conceptualmente cabe en otro.

Mapeo tentativo (a validar al hacer el corte real):

| Archivo nuevo                     | Secciones origen en ESTADO-ACTUAL.md                                  |
| --------------------------------- | --------------------------------------------------------------------- |
| `gotchas/tinybase-firestore.md`   | TinyBase + Firestore sync, Optimistic updates                         |
| `gotchas/relaciones-entidades.md` | Relaciones entre entidades                                            |
| `gotchas/editor-tiptap.md`        | Editor (TipTap)                                                       |
| `gotchas/ui-componentes.md`       | UI y componentes, Theme System                                        |
| `gotchas/responsive-mobile-ux.md` | Responsive & Mobile UX                                                |
| `gotchas/graph-webgl.md`          | Knowledge Graph y WebGL                                               |
| `gotchas/busqueda-hibrida.md`     | Búsqueda Híbrida                                                      |
| `gotchas/fsrs-resurfacing.md`     | FSRS y resurfacing                                                    |
| `gotchas/pwa-offline.md`          | PWA + Offline                                                         |
| `gotchas/chrome-extension.md`     | Chrome Extension                                                      |
| `gotchas/tauri-desktop.md`        | Tauri Desktop, Auto-Updater + Releases                                |
| `gotchas/capacitor-mobile.md`     | Capacitor Mobile                                                      |
| `gotchas/tooling-local.md`        | Tooling local                                                         |
| `gotchas/cloud-functions.md`      | Cloud Functions, Tool use con schema enforcement, Guards y edge cases |

14 archivos vs 17 secciones — consolidación leve donde el contenido es naturalmente conexo (Tauri+Updater, TinyBase+OptimisticUpdates, UI+Theme, CFs+ToolUse+Guards).

### 4.2. Índice nuevo en `ESTADO-ACTUAL.md`

La sección `## Arquitectura y gotchas por dominio` (líneas 60-277) se reemplaza por un índice de 1 línea por gotcha:

```md
## Gotchas por dominio (índice)

### TinyBase + Firestore sync

- [TinyBase v8 sin persister Firestore nativo](gotchas/tinybase-firestore.md#v8-sin-persister) — usar createCustomPersister con onSnapshot
- [setPartialRow sync ANTES de setDoc async](gotchas/tinybase-firestore.md#optimistic-updates) — invertir causa races en clicks rápidos

### Editor (TipTap)

- [Marks viven en text nodes, no en containers](gotchas/editor-tiptap.md#marks-text-nodes) — walk recursivo hasta type='text'
- [Slash menu z-index conflict con bubble menu](gotchas/editor-tiptap.md#slash-z-index) — ...
```

Resto de `ESTADO-ACTUAL.md` (`## Fases completadas`, `## Cloud Functions` parte alta, `## Dependencias clave`, `## Candidatos próximos`) queda intacto. Cambia solo la sección de gotchas.

### 4.3. Skill `gotchas-search`

Skill local on-demand siguiendo el patrón de `ui-ux-pro-max`:

```
~/.claude/skills/gotchas-search/
├── SKILL.md          # cuándo invocar, qué espera el user, ejemplos de queries, política de verificación
├── search.py         # BM25 + regex sobre el corpus, similar a ui-ux-pro-max/search.py
├── corpus.json       # generado: [{id, dominio, titulo, body, paths_referenciados}]
└── reindex.sh        # regenera corpus.json desde Spec/gotchas/*.md
```

**Invocación:** `gotchas-search "<keyword | dominio>"` → top-N gotchas con título + cuerpo + path al archivo canónico + paths a archivos vivos referenciados.

**Reindex automático:** hook PostToolUse adicional que dispara `reindex.sh` cuando un Edit/Write toca `Spec/gotchas/*.md`. Sin este hook, reindex queda manual y se desactualiza.

**On-demand explícito:** la skill **NO** se auto-carga al inicio de sesión. Solo se invoca cuando el subagente la necesita (ver §4.5). Eso preserva el contexto del agente principal.

**Calidad de la skill:** la skill probablemente requerirá iteraciones para que la primera búsqueda funcione bien (relevancia BM25, granularidad de queries que devuelven matches útiles, formato de output que sirve al subagente). Aceptado como costo ongoing — pulir cuando se detecte que un subagente devuelve falsos positivos / no encuentra el gotcha relevante.

### 4.4. Anchors estables

Cada gotcha en `Spec/gotchas/<dominio>.md` necesita un anchor para que el índice y el output de la skill puedan apuntar (`#optimistic-updates`, `#marks-text-nodes`, etc.). Markdown auto-genera anchors desde slugs de títulos. Renombrar un título rompe los links del índice y desactualiza el corpus de la skill hasta el próximo reindex.

Decisión preliminar: **slugs auto-generados**, asumiendo que renombrar gotchas es raro. Si se vuelve un problema, se puede pasar a IDs explícitos (`#g-tiptap-001`).

### 4.5. Flujo SDD con subagente — paso 2 y paso 8

**Cambio en paso 2 SDD (Plan mode).** Hoy CLAUDE.md describe:

> - Lanzar hasta 3 **Explore agents en paralelo** para mapear patrones existentes en el código relacionado.
> - Si aplica UI/UX, recorrido con **Playwright MCP** ...
> - Consultar **context7 MCP** si hay libs nuevas o migración de versión.
> - Lanzar un **Plan agent** con el contexto reunido para validar decisiones y detectar gotchas.

Agregar como **primer bullet** del paso 2:

> - Lanzar un **Gotchas agent** con la skill `gotchas-search` ANTES o EN PARALELO con los Explore agents. Recibe el dominio + objetivo de la feature, invoca la skill, **verifica cada hallazgo** contra el código actual / context7 / web según aplique, y devuelve gotchas relevantes verificados con su path canónico. El agente principal recibe ya filtrado, no el output crudo de BM25.

**Cambio en paso 8 SDD (Cerrar feature).** Hoy CLAUDE.md describe:

> 8. **Cerrar la feature:** convertir el SPEC a registro de implementación... Aplicar la regla de escalación de gotchas (ver "Docs: jerarquía y reglas" abajo). Auditar techos antes de commitear docs.

Reemplazar la frase "Aplicar la regla de escalación de gotchas" por:

> Para cada gotcha que sobreviva en el SPEC tras el cierre, lanzar un **Gotcha-classifier agent**: recibe el gotcha + paths tocados + objetivo de la feature, decide el dominio (uno de los archivos `Spec/gotchas/<dominio>.md`), redacta la entrada con anchor + paths a código vivo, agrega la línea al índice de `ESTADO-ACTUAL.md`, y dispara reindex de la skill. Si el gotcha aplica a toda sesión sin importar dominio, propone escalación a CLAUDE.md § "Gotchas universales" y deja al agente principal la decisión final.

**Mismo principio rector se mantiene:** la síntesis no se delega. El subagente recolecta (paso 2) o redacta + clasifica (paso 8); la decisión final de qué hacer con esa info la toma el agente principal junto con Sebastián.

### 4.6. Verificación obligatoria — política de la skill y de los subagentes

Los gotchas son **claims sobre el estado del código en un punto del tiempo**. Pueden quedar obsoletos cuando:

- El archivo referenciado se renombra o se elimina.
- El patrón se refactoriza (ej: post-F10 los writes pasaron por el factory `createFirestoreRepo`, varios gotchas históricos sobre `setDoc` directo dejaron de aplicar).
- La librería cambia de versión y el bug que causaba el gotcha se fixea (ej: TipTap actualiza, Firebase saca un breaking change).
- El proyecto cambia de stack en un subsistema (ej: Reagraph → Sigma.js + Graphology planeado para v2 del grafo).

**Política para los subagentes que invocan `gotchas-search`:**

Tras recibir un hit de la skill, antes de reportar al agente principal, el subagente DEBE hacer al menos uno de:

1. **Leer los paths que el gotcha referencia** y verificar que el patrón descrito sigue presente / sigue siendo aplicable.
2. **Si el gotcha menciona una versión específica de una librería** (ej: "TipTap v2.x", "TinyBase v8"), confirmar contra `package.json` que la versión sigue siendo esa. Si difiere, marcar el gotcha como "potencialmente obsoleto" en el reporte.
3. **Si el gotcha menciona una API específica** (ej: `setPartialRow`, `serverTimestamp`), confirmar via context7 MCP que la API sigue existiendo con la misma forma. Si no, marcar como "API cambió, verificar manualmente".
4. **Si el gotcha es ambiguo o contradice algo del código actual**, hacer una búsqueda web acotada para corroborar.

El subagente reporta **categorizado**: `[verificado-y-vigente]`, `[potencialmente-obsoleto]`, `[contradice-código-actual]`. El agente principal toma decisión final con esa categorización en mano.

Política análoga al patrón ya documentado en el sistema de memoria de Claude Code ("Memory records can become stale... Before recommending from memory... verify"). Acá se explicita para el corpus de gotchas.

### 4.7. CLAUDE.md — qué tocar concretamente

Cambios concretos a aplicar al cierre de Fase C:

1. **Tabla "Docs: jerarquía y reglas"** (CLAUDE.md:112-120): agregar fila para `Spec/gotchas/<dominio>.md`.
2. **Paso 8 SDD** (CLAUDE.md:106): reescribir según §4.5.
3. **Paso 2 SDD** (CLAUDE.md:89-96): agregar bullet de Gotchas agent según §4.5.
4. **Sección "Skills activos"** (CLAUDE.md:48-55): agregar `gotchas-search` con descripción "BM25 sobre `Spec/gotchas/`. On-demand. Invocada por el Gotchas agent en paso 2 SDD y por el Gotcha-classifier en paso 8 SDD."
5. **Sección "Delegación a subagentes"** (CLAUDE.md:57-71): agregar dos bullets nuevos:
   - "**Búsqueda inicial de gotchas (paso 2 SDD)**: lanzar Gotchas agent con skill `gotchas-search` + verificación obligatoria contra código/context7/web."
   - "**Clasificación y escalación de gotchas (paso 8 SDD)**: lanzar Gotcha-classifier agent que decide dominio, redacta entrada en `Spec/gotchas/<dominio>.md`, actualiza índice y reindexa skill."
6. **Sección "Escalación de gotchas al cerrar feature"** (CLAUDE.md:132): actualizar el destino — ya no es "ESTADO-ACTUAL", ahora es "`Spec/gotchas/<dominio>.md` + línea en índice de ESTADO-ACTUAL".

## 5. Preguntas abiertas que el SPEC (o PRs) formal debe resolver

1. **¿Promover a SPEC formal o ejecutar como serie de PRs `chore/*` sin SPEC?** Es housekeeping con criterios de done claros, pero abarca tres fases (split + skill + flujo SDD) que tocan código de skills + CLAUDE.md + corpus. Recomendación: **SPEC formal** dado el alcance (3 fases, cambios al SDD que es metodología central). Confirmar con Sebastián.
2. **Granularidad final del split.** ¿14 archivos como propone §4.1, o seguir las 17 secciones actuales 1-a-1, o consolidar más agresivamente? Decidir al hacer el corte real, viendo el contenido por sección.
3. **Anchors: slugs vs IDs explícitos.** §4.4. Recomendación: slugs.
4. **Cross-domain gotchas.** Si un gotcha aplica a >1 dominio (ej: `min-w-0 flex-1 truncate` aplica a UI y a Mobile UX), ¿dónde vive? Opciones: archivo primario + línea "ver también" en el otro, o archivo `gotchas/cross-domain.md` dedicado, o duplicar (rechazado, viola regla de "no duplicar entre niveles"). Recomendación: archivo primario + "ver también".
5. **Migración Fase A: ¿one-shot o incremental?** Recomendación: one-shot. El estado intermedio confunde más de lo que ayuda.
6. **¿El Gotchas agent es un subagente nuevo (custom) o reuso de Explore?** Opciones:
   - (a) Custom agent type `gotchas-researcher` con prompt + skill autorizada en `~/.claude/agents/`.
   - (b) Reuso de Explore con instrucciones explícitas en el prompt.
   - Recomendación: (a) — el patrón es lo suficientemente recurrente y diferenciado como para tener su propio agente con un prompt bien afinado y la skill pre-autorizada.
7. **¿El Gotcha-classifier agent es el mismo agent o uno separado?** El paso 2 (búsqueda + verificación) y el paso 8 (clasificación + escalación) son tareas distintas. Recomendación: dos agentes separados con prompts específicos. Ambos consumen la misma skill `gotchas-search`, pero tienen mandatos opuestos (uno lee, otro escribe + reindexa).
8. **Hook PostToolUse para reindex.** ¿Hook PostToolUse que dispare `reindex.sh` cuando se toca `Spec/gotchas/*.md`, o el Gotcha-classifier dispara reindex explícitamente al final de su trabajo? Recomendación: las dos — hook como red de seguridad, classifier como camino feliz. Reindex es idempotente, doble disparo no rompe nada.
9. **¿Cómo medir si la skill funciona bien?** Métrica propuesta: tras 5 features cerradas con el flujo nuevo, contar (a) gotchas marcados `[potencialmente-obsoleto]` por el subagente que efectivamente fueron obsoletos = precisión de verificación, (b) gotchas que el agente principal terminó necesitando que NO devolvió el subagente = recall de la skill. Si recall < 70%, pulir queries / corpus.
10. **Compat de `MEMORY.md`.** Las memorias actuales referencian gotchas que viven en ESTADO-ACTUAL. Tras Fase A, los pointers en memoria pueden quedar stale. Revisar y actualizar `~/.claude/projects/C--Project-SecondMind/memory/*.md`.
11. **Hooks: validación de links.** ¿Hook PreCommit que valide que todos los anchors del índice resuelven a archivos existentes? Útil pero no bloqueante para Fase A.

## 6. Pasos sugeridos para el SPEC formal

Si se promueve a SPEC formal (recomendación de §5.1), estructura F1..F8:

### Fase A — Split por dominio

- **F1 — Crear `Spec/gotchas/` con archivos por dominio** según mapeo §4.1. Validar nombres antes de mover contenido.
- **F2 — Migrar contenido de `ESTADO-ACTUAL.md:62-277`** a los archivos por dominio.
- **F3 — Reescribir `## Arquitectura y gotchas por dominio` como índice.** Validar manualmente que cada anchor resuelve a un título existente.
- **F4 — Actualizar `MEMORY.md`** y memorias asociadas que apunten a ESTADO-ACTUAL → secciones que ya no existen.

### Fase B — Skill `gotchas-search`

- **F5 — Crear estructura del skill** en `~/.claude/skills/gotchas-search/` (SKILL.md + search.py + reindex.sh). Clonar patrón de `ui-ux-pro-max`.
- **F6 — Implementar reindex automático** vía hook PostToolUse en `.claude/settings.json` que dispare `reindex.sh` cuando un Edit/Write toca `Spec/gotchas/*.md`.

### Fase C — Integración con SDD

- **F7 — Crear los dos subagentes** (`gotchas-researcher` y `gotcha-classifier`) en `~/.claude/agents/` con prompts específicos según §4.5 + política de verificación §4.6.
- **F8 — Actualizar `CLAUDE.md`** según §4.7 (6 cambios concretos: tabla docs, paso 2 SDD, paso 8 SDD, skills activas, delegación a subagentes, regla de escalación).

### Validación

- Cerrar la siguiente feature post-F8 usando el flujo nuevo. Validar (a) que el Gotchas agent en paso 2 devolvió hallazgos verificados útiles y (b) que el Gotcha-classifier en paso 8 escribió el gotcha en el archivo correcto + actualizó índice + disparó reindex.

## 7. Qué NO es esta feature

- **No** es un cambio en cuándo escalar gotchas (paso 8 SDD se mantiene: nacen en SPEC, suben si aplican a >1 feature, suben a CLAUDE.md si aplican a toda sesión). Lo que cambia es **dónde** y **quién** ejecuta.
- **No** toca `CLAUDE.md § "Gotchas universales"` — esos 11 gotchas siguen viviendo ahí, auto-cargados, aplican a toda sesión. La skill `gotchas-search` no los indexa (corpus es solo `Spec/gotchas/`).
- **No** es búsqueda semántica con embeddings — Fase B es BM25 keyword. La búsqueda semántica fue evaluada y descartada por overhead injustificado para corpus de este tamaño.
- **No** cubre re-evaluar qué gotchas siguen siendo relevantes vs cuáles caducaron como housekeeping retroactivo. La verificación pasa al subagente como política ongoing (§4.6), no como pase masivo de limpieza.
- **No** afecta la jerarquía CLAUDE.md → ESTADO-ACTUAL → SPEC. Los `Spec/gotchas/<dominio>.md` son un nivel **lateral** a ESTADO-ACTUAL, no un nivel nuevo en la jerarquía.
- **No** elimina la posibilidad de que el agente principal lea un `Spec/gotchas/<dominio>.md` directo (cuando ya sabe el dominio y quiere todo el canon). El subagente es el camino feliz, no el único.

## 8. Input para el SPEC

Al arrancar la ejecución del SPEC formal:

1. Leer este DRAFT y la sección actual de gotchas en [Spec/ESTADO-ACTUAL.md:60-277](../ESTADO-ACTUAL.md#L60-L277) como base.
2. Leer la regla de escalación de gotchas en [CLAUDE.md § "Docs: jerarquía y reglas"](../../CLAUDE.md) y los pasos 2 + 8 del SDD para confirmar los cambios concretos a aplicar.
3. Revisar el patrón de `~/.claude/skills/ui-ux-pro-max/search.py` como referencia para la implementación de Fase B.
4. Hacer un pase rápido por las 17 secciones actuales para validar el mapeo §4.1 — confirmar consolidaciones o ajustar granularidad.
5. Crear `Spec/features/SPEC-feature-N-gotchas-flow-optimization.md` con F1..F8 + decisiones D1..Dn (granularidad split, agentes custom vs reuso, hook reindex, métricas de calidad, etc.).
6. Crear branch `feat/gotchas-flow` y ejecutar las 3 fases en commits atómicos.
7. **Eliminar este archivo DRAFT** una vez el merge esté en main, para evitar dos fuentes de verdad.
