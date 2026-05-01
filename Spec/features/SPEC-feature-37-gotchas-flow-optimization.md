# SPEC F37 — Optimización del corpus de gotchas (split + skill BM25)

> **Nota de naming:** el archivo y branch `gotchas-flow` reflejan el alcance original (incluía flujo SDD completo vía subagentes). Tras recortar Fase C como out-of-scope, el alcance ejecutable es **corpus split + skill + actualización acotada de pointers en CLAUDE.md**. Se conserva el nombre por estabilidad de branch/git.
>
> Estado: Borrador (pre-implementación, pendiente Plan mode + aprobación)
> Branch: `feat/gotchas-flow`
> DRAFT origen: `Spec/drafts/DRAFT-gotchas-search-optimization.md` (**conservado** con nota "Fase C diferida" en su header; NO se elimina dado que F7-F8 originales quedan fuera de scope ejecutable y el DRAFT preserva contexto para reactivar la fase si surge fricción manual post-F37)
> Dependencias: ninguna (housekeeping interno; no toca producto, schemas Firestore, ni Cloud Functions)
> Estimado: 2 sesiones de trabajo (Fase A es la más densa; Fase B + F7 acotado caben en sesión corta)

## Objetivo

Reducir el costo en tokens de consultar gotchas en el SDD. Hoy `Spec/ESTADO-ACTUAL.md` mezcla **índice de features** (función liviana) con **canon completo de gotchas por dominio** (función pesada que crece monotónicamente — 351 líneas hoy, ~226 son corpus de gotchas). Cualquier agente que necesite "el gotcha de TipTap sobre marks" carga las 351 líneas, filtra mentalmente, y descarta el 90% del contenido.

Al cerrar F37: (a) los gotchas viven en `Spec/gotchas/<dominio>.md` con índice de 1 línea en ESTADO-ACTUAL apuntando al canónico; (b) una skill local on-demand `gotchas-search` con BM25 sirve queries por keyword/dominio; (c) `CLAUDE.md` actualizado con 5 pointers a la nueva ubicación de los gotchas — sin imponer flujo de subagentes (Fase C original diferida hasta evidencia de fricción manual post-F37; ver Out of scope).

`Spec/gotchas/<dominio>.md` es nivel **lateral** a ESTADO-ACTUAL — NO un nivel nuevo en la jerarquía CLAUDE.md → ESTADO-ACTUAL → SPEC.

## Alcance

2 fases secuenciales ejecutables + 1 sub-feature de cierre. Fase A (F1-F4) prerequisito de Fase B (F5-F6). F7 cierra el SPEC con actualizaciones acotadas a CLAUDE.md (5 pointers). **Fase C original** (subagentes `gotchas-researcher` + `gotcha-classifier` + reescritura de pasos 2/8 SDD en CLAUDE.md) **diferida** — ver Out of scope.

---

### Fase A — Split por dominio

#### F1: Crear estructura `Spec/gotchas/<dominio>.md`

**Qué:** Crear 14 archivos Markdown nuevos en `Spec/gotchas/` con header + placeholder. NO migrar contenido (eso es F2). Mapeo de dominios según D2.

**Criterio de done:**

- [ ] Directorio `Spec/gotchas/` existe
- [ ] 14 archivos creados con header consistente y placeholder
- [ ] Sin contenido sustantivo (F2 los completa)

**Archivos creados:**

- `Spec/gotchas/tinybase-firestore.md`
- `Spec/gotchas/relaciones-entidades.md`
- `Spec/gotchas/editor-tiptap.md`
- `Spec/gotchas/ui-componentes.md`
- `Spec/gotchas/responsive-mobile-ux.md`
- `Spec/gotchas/graph-webgl.md`
- `Spec/gotchas/busqueda-hibrida.md`
- `Spec/gotchas/fsrs-resurfacing.md`
- `Spec/gotchas/pwa-offline.md`
- `Spec/gotchas/chrome-extension.md`
- `Spec/gotchas/tauri-desktop.md`
- `Spec/gotchas/capacitor-mobile.md`
- `Spec/gotchas/tooling-local.md`
- `Spec/gotchas/cloud-functions.md`

**Snippet (template por archivo):**

```md
# <Dominio>

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

<!-- gotchas a partir de F2 -->
```

---

#### F2: Migrar corpus desde `ESTADO-ACTUAL.md`

**Qué:** Mover el cuerpo completo de cada gotcha desde la sección `## Arquitectura y gotchas por dominio` (líneas 63-288) y las dos sub-secciones `### Tool use con schema enforcement` + `### Guards y edge cases` dentro de `## Cloud Functions` (líneas 298-326) a sus archivos de dominio según D2. Cada gotcha mantiene su título original (sin truncar, sin renombrar) como `## <título>` en el archivo destino para garantizar anchor slug estable.

**Criterio de done:**

- [ ] Cada gotcha de las 18 sub-secciones origen está en exactamente UN archivo de dominio (single source of truth — D4)
- [ ] Cross-domain gotchas (ej. `min-w-0 flex-1 truncate` aplica UI + Mobile UX) viven en su dominio primario con línea `> Ver también: \`gotchas/<otro>.md#<anchor>\`` debajo del título
- [ ] Paths relativos del cuerpo de los gotchas ajustados de `../src/X` a `../../src/X` (los archivos están un nivel más profundo dentro de `Spec/`)
- [ ] Cero contenido duplicado entre archivos de dominio
- [ ] El texto introductorio de `## Cloud Functions` (líneas 289-297, descripción de triggers desplegados + secrets) NO se mueve — queda en ESTADO-ACTUAL
- [ ] Smoke test grep: `grep -r "setDoc.*merge" Spec/gotchas/` devuelve los gotchas relevantes íntegros (validación de que el contenido se preservó)

**Archivos modificados:** `Spec/gotchas/*.md` (los 14 creados en F1).
**Archivos NO tocados todavía:** `ESTADO-ACTUAL.md` (F3 lo reescribe).

---

#### F3: Reescribir sección de gotchas en `ESTADO-ACTUAL.md` como índice

**Qué:** Reemplazar líneas 63-326 (la sección `## Arquitectura y gotchas por dominio` completa más las dos sub-secciones de gotchas dentro de `## Cloud Functions`) por una sección nueva `## Gotchas por dominio (índice)` con sub-secciones por dominio y 1 línea por gotcha apuntando al archivo canónico. Las sub-secciones del índice preservan los nombres actuales (`### TinyBase + Firestore sync`, `### Editor (TipTap)`, etc.) para que el subagente classifier pueda mapear directo del nombre al archivo. La parte descriptiva de `## Cloud Functions` (texto descriptivo pre sub-secciones, líneas 289-297) queda intacta arriba del índice.

**Criterio de done:**

- [ ] Sección antigua reemplazada por índice de ~50-70 líneas (estimado: ~25-30 gotchas × 1.5-2 líneas promedio)
- [ ] Cada línea del índice tiene formato `- [<título corto>](gotchas/<archivo>.md#<slug>) — <hook de 1 línea>`
- [ ] Anchors verificados manualmente: cada slug resuelve a un `## <título>` existente en el archivo de dominio
- [ ] Total de `ESTADO-ACTUAL.md` baja de 351 a ~150-180 líneas
- [ ] `## Fases completadas`, `## Dependencias clave`, `## Candidatos próximos` quedan intactos
- [ ] `## Cloud Functions` mantiene texto descriptivo (triggers desplegados, secrets, etc.); las dos sub-secciones de gotchas que vivían dentro ya no están — viven en `gotchas/cloud-functions.md`

**Archivos modificados:** `Spec/ESTADO-ACTUAL.md`.

**Snippet (forma esperada del índice):**

```md
## Gotchas por dominio (índice)

> Canon completo en `gotchas/<dominio>.md`. Cada gotcha es un `## <título>` con anchor slug. Subagentes `gotchas-researcher` (paso 2 SDD) y `gotcha-classifier` (paso 8 SDD) consultan el corpus vía skill `gotchas-search` con verificación obligatoria contra código actual / context7 / web antes de reportar.

### TinyBase + Firestore sync

- [Persister con merge: true es precondición global](gotchas/tinybase-firestore.md#persister-con-merge-true-es-precondicion-global) — sin merge borra campos fuera del schema TinyBase
- [Capa de repos centraliza optimistic](gotchas/tinybase-firestore.md#capa-de-repos-en-srcinfrarepos-centraliza-el-patron-optimistic-desde-f10) — todo write pasa por un repo desde F10
- ...
```

---

#### F4: Actualizar `MEMORY.md` y memorias asociadas

**Qué:** Revisar las 11 memorias actuales en `~/.claude/projects/D--Proyectos-VS-CODE-SecondMind/memory/*.md` (incluyendo el `MEMORY.md` index) y actualizar referencias a paths o sections obsoletas. La memoria `feedback_estado_actual_over_specs.md` puede mencionar la nueva estructura como "para gotchas, usar la skill `gotchas-search` o leer `Spec/gotchas/<dominio>.md` directo" si el body lo refleja literalmente.

**Criterio de done:**

- [ ] Grep recursivo en `~/.claude/projects/D--Proyectos-VS-CODE-SecondMind/memory/` por `"Arquitectura y gotchas por dominio"` (header viejo) devuelve cero matches
- [ ] Grep por `"ESTADO-ACTUAL"` devuelve solo refs vigentes (paths que existen)
- [ ] Memoria `feedback_estado_actual_over_specs.md` reescrita si su body asume la organización monolítica vieja

**Archivos modificados:** `~/.claude/projects/D--Proyectos-VS-CODE-SecondMind/memory/*.md` según lo que el grep devuelva.

---

### Fase B — Skill `gotchas-search`

#### F5: Crear estructura de la skill

**Qué:** Crear skill local en `~/.claude/skills/gotchas-search/` siguiendo el patrón de `~/.claude/skills/ui-ux-pro-max/` (BM25 + corpus.json + reindex). Cuatro componentes:

- `SKILL.md` — descripción explícita "cuándo invocar" (subagentes, NO el agente principal directo); formato de queries (`<keyword>`, `dominio:<nombre>`, `<keyword> dominio:<nombre>`); formato de output (top-N gotchas con título + cuerpo + path canónico + paths a archivos vivos referenciados); política de verificación que el subagente DEBE seguir tras recibir un hit (§4.6 DRAFT — leer paths citados, version check vs `package.json`, API check vs context7, búsqueda web acotada para ambigüedad, reporte categorizado)
- `search.py` — script BM25 + regex sobre `corpus.json`. Tokenización español-aware (acentos, ñ). Score mínimo configurable. Output JSON con `[{ id, dominio, titulo, body, paths_referenciados, score }]`
- `corpus.json` — generado por `reindex.sh`. Schema: `[{ id: "<dominio>:<slug>", dominio: "<dominio>", titulo: "...", body: "<markdown body>", paths_referenciados: ["<path1>", ...] }]`. `paths_referenciados` extraído por regex sobre links Markdown apuntando a `../../src/`, `../../Docs/`, etc.
- `reindex.sh` — script Bash POSIX que parsea cada `Spec/gotchas/*.md`, splittea por `## ` headers, extrae body + paths referenciados, genera `corpus.json` ordenado deterministamente (mismo input → mismo output byte-a-byte para diff estable)

**Criterio de done:**

- [ ] `SKILL.md` con descripción que dispara correctamente el skill matcher
- [ ] `python search.py "tinybase persister"` devuelve JSON válido con top-5 hits ordenados por score
- [ ] `bash reindex.sh` ejecuta sin errores y genera `corpus.json` válido
- [ ] Smoke test: `search.py "marks text nodes"` devuelve el gotcha de TipTap como top hit
- [ ] Smoke test: `search.py "dominio:capacitor-mobile"` devuelve todos los gotchas del archivo Capacitor

**Archivos creados:**

- `~/.claude/skills/gotchas-search/SKILL.md`
- `~/.claude/skills/gotchas-search/search.py`
- `~/.claude/skills/gotchas-search/corpus.json` (generado)
- `~/.claude/skills/gotchas-search/reindex.sh`

---

#### F6: Hook PostToolUse para reindex automático

**Qué:** Agregar hook PostToolUse en `.claude/settings.json` que dispare `~/.claude/skills/gotchas-search/reindex.sh` cuando Edit/Write toca `Spec/gotchas/*.md`. El hook NO bloquea — un fallo del reindex queda como warning visible al usuario sin abortar la edición. Idempotente: doble disparo no rompe nada.

**Criterio de done:**

- [ ] `.claude/settings.json` tiene matcher PostToolUse con regex `Spec/gotchas/.*\.md$` y comando `~/.claude/skills/gotchas-search/reindex.sh`
- [ ] Editar manualmente un `Spec/gotchas/*.md` regenera `corpus.json` (verificable mirando timestamp del archivo tras Edit)
- [ ] Editar otro archivo (ej. `src/X.ts`) NO dispara reindex (filtro path correcto, no falsos positivos)
- [ ] Coexiste sin colisión con los hooks PostToolUse existentes (Prettier + ESLint --fix)

**Archivos modificados:** `.claude/settings.json`.

---

#### F7: Actualizar `CLAUDE.md` con 5 pointers acotados

**Qué:** Aplicar 5 ediciones puntuales a `CLAUDE.md` que reflejan **dónde viven los gotchas** post-split, sin imponer flujo de subagentes (Fase C diferida). Los 5 cambios son ediciones sobre líneas existentes; no agregan ni reescriben pasos del SDD.

1. **Tabla "Docs: jerarquía y reglas" (línea ~112-120):** agregar fila nueva entre `Spec/features/SPEC-feature-*.md` y `Spec/SPEC-fase-*.md`:

   ```
   | `Spec/gotchas/<dominio>.md` | Canon de gotchas por dominio. Single source of truth por dominio | On-demand, o vía skill `gotchas-search` |
   ```

2. **Tabla "Docs: jerarquía y reglas" (línea 115, fila `Spec/ESTADO-ACTUAL.md`):** actualizar la columna "Contenido". Cambiar `Features (1-2 líneas + pointer SPEC), gotchas por dominio, decisiones, deps` por `Features (1-2 líneas + pointer SPEC), índice de gotchas (canon en gotchas/<dominio>.md), decisiones, deps`.

3. **Línea 132 (regla de escalación de gotchas, paso 8 SDD):** actualizar el destino intermedio. Cambiar `nacen en SPEC → suben a ESTADO-ACTUAL si aplican a >1 feature → suben a CLAUDE.md` por `nacen en SPEC → suben a Spec/gotchas/<dominio>.md (con línea en índice de ESTADO-ACTUAL) si aplican a >1 feature → suben a CLAUDE.md`.

4. **Línea 246 (intro de "Gotchas universales"):** actualizar el pointer. Cambiar `Gotchas de dominio específico → Spec/ESTADO-ACTUAL.md` por `Gotchas de dominio específico → Spec/gotchas/<dominio>.md (índice en Spec/ESTADO-ACTUAL.md)`.

5. **Sección "Skills activos" (líneas 49-55):** agregar bullet nuevo (sugerido tras `ui-ux-pro-max`):

   ```
   - `gotchas-search` — BM25 sobre `Spec/gotchas/`. Búsqueda por keyword y/o dominio. Reindex automático vía hook PostToolUse al editar `Spec/gotchas/*.md`
   ```

**Criterio de done:**

- [ ] Los 5 cambios aplicados, verificables vía diff sobre `CLAUDE.md`
- [ ] CLAUDE.md sigue dentro del techo orientativo (~200 líneas; hoy 267 — el delta esperado es +3-5 líneas netas, no agrava el techo)
- [ ] Los pasos 2 y 8 SDD del CLAUDE.md **NO** mencionan `gotchas-researcher` / `gotcha-classifier` (Fase C diferida; sin imponer flujo no validado)
- [ ] Los 5 cambios son pointers — no decretan flujo nuevo

**Archivos modificados:** `CLAUDE.md`.

---

## Decisiones (D1-D8)

| ID     | Decisión                                                                                                                                                 | Rationale                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | SPEC formal vs serie de PRs `chore/*` → SPEC formal                                                                                                      | Toca metodología central (CLAUDE.md pasos 2 + 8 SDD), crea precedente nuevo (2 subagentes custom), 11 decisiones arquitectónicas que merecen registro. Confirmado por Sebastián tras lectura del DRAFT.                                                                                                                                                                                                        |
| **D2** | Granularidad split: 14 archivos consolidando 18 sub-secciones                                                                                            | DRAFT §4.1: TinyBase+Optimistic, UI+Theme, Tauri+Updater, CFs+ToolUse+Guards comparten gravedad conceptual. La consolidación leve (18 → 14) reduce ruido sin sacrificar buscabilidad. Si en F2 una consolidación se siente forzada, dividir explícito en F2 sin volver a abrir la decisión.                                                                                                                    |
| **D3** | Anchors: slugs auto-generados de los títulos `##`                                                                                                        | Convención Markdown estándar; cero código adicional. Renombrar gotchas es raro. Si rompe links del índice, F3 detecta el quiebre vía verificación manual de anchors. Si se vuelve fricción ongoing, escalar a IDs explícitos (`#g-tiptap-001`) en follow-up post-cierre.                                                                                                                                       |
| **D4** | Cross-domain gotchas: archivo primario + línea `> Ver también` en el secundario, NO archivo `gotchas/cross-domain.md`                                    | Mantiene single source of truth (la regla de "no duplicar entre niveles" aplica también lateralmente); el "ver también" da descubribilidad desde el dominio secundario. Skill BM25 captura ambos dominios via keyword match en el cuerpo, así que el agente lo encuentra desde cualquier vector.                                                                                                               |
| **D5** | Migración Fase A: one-shot en un solo branch, commits atómicos por sub-feature                                                                           | Estado intermedio (corpus parcialmente migrado, mitad-índice mitad-cuerpo) confunde más que ayuda. F1+F2+F3+F4 en commits atómicos pero todos en `feat/gotchas-flow`, merge único a main al cierre.                                                                                                                                                                                                            |
| **D6** | Subagentes (`gotchas-researcher` + `gotcha-classifier`) **DIFERIDA** — Fase C completa fuera de scope ejecutable                                         | Sin evidencia empírica de fricción manual al consultar la skill directamente, F7-F8 originales son optimización prematura. La skill por sí sola puede ser suficiente para reducir el costo de tokens. Si tras F37 aparece fricción consistente (consultar la skill 5+ veces por feature, errores de clasificación al cerrar gotchas), reactivar como SPEC follow-up con todo el contexto del DRAFT preservado. |
| **D7** | Reindex `corpus.json` via hook PostToolUse al editar `Spec/gotchas/*.md` (parte activa). Classifier+hook doble disparo **diferido** (depende de Fase C). | Hook como red de seguridad ante cualquier edición manual del corpus. Idempotente — corre cada vez que un Edit/Write toca `Spec/gotchas/*.md`. La rama "classifier explícito como segundo disparo al cerrar feature" se difiere junto con Fase C; si reactiva, doble disparo permanece como decisión correcta (idempotencia, sin costo).                                                                        |
| **D8** | Validación post-cierre simplificada: 3 queries representativas inmediatas (sin métricas precisión/recall sobre 5 features)                               | Sin subagentes intermediarios, "precisión de verificación" no aplica directo. Las 3 queries representativas (keyword domain-specific, dominio explícito, cross-domain) cubren el smoke test base de la skill. Métricas multi-feature se difieren con Fase C; si reactiva, recuperar como D8 original.                                                                                                          |

---

## Orden de implementación

Fases secuenciales; dentro de cada fase, los F en orden numérico (F1 → F2 → ... → F7). Dependencias hard:

- F2 depende de F1 (escribe en archivos que F1 crea)
- F3 depende de F2 (deja ESTADO-ACTUAL apuntando a archivos que F2 ya pobló — sin F2 cerrado, los anchors del índice apuntan a archivos vacíos)
- F5 depende de F1-F4 (sin corpus por dominio no hay qué indexar; sin índice en ESTADO-ACTUAL, no hay disciplina de búsqueda)
- F7 depende de F5-F6 (los pointers a `gotchas-search` y al hook reindex referencian artefactos que F5-F6 crean)

**7 commits dentro de la branch `feat/gotchas-flow` + 1 commit post-merge en `main`** para archivado del SPEC, siguiendo la convención del repo (ver F36 con `2e20f59 docs(spec-36): archivar SPEC` post-merge separado).

Dentro de `feat/gotchas-flow` (Conventional Commits en español):

- `feat(gotchas): F1 estructura base archivos por dominio`
- `feat(gotchas): F2 migrar corpus desde ESTADO-ACTUAL`
- `feat(gotchas): F3 reescribir seccion de gotchas como indice`
- `chore(memory): F4 actualizar pointers tras split + nota Fase C diferida en DRAFT`
- `feat(skill): F5 crear skill gotchas-search con BM25`
- `chore(hooks): F6 reindex automatico via PostToolUse`
- `docs(claude-md): F7 actualizar pointers tras split de gotchas`

Merge `--no-ff` con commit de merge descriptivo. Post-merge en `main` (commit separado tras el merge, antes del push si conviene):

- `docs(spec-37): archivar SPEC a registro de implementacion`

**NO eliminar `Spec/drafts/DRAFT-gotchas-search-optimization.md`** — agregar nota en su header durante F4 ("Fase C diferida — re-activar si surge fricción manual post-F37"). El DRAFT queda como referencia preservada para reactivar la Fase C si aparece evidencia de fricción.

---

## Checklist global de completado

Al terminar F37, TODAS estas condiciones deben ser verdaderas:

- [ ] `Spec/gotchas/` existe con 14 archivos, todos con contenido sustantivo (F1+F2 cerrados)
- [ ] `Spec/ESTADO-ACTUAL.md` total ~150-180 líneas (de 351), sin la sección `## Arquitectura y gotchas por dominio` antigua, con índice nuevo en su lugar (F3 cerrado)
- [ ] `MEMORY.md` y memorias asociadas no apuntan a paths/sections obsoletas (F4 cerrado)
- [ ] DRAFT origen actualizado con nota "Fase C diferida" en su header (F4 — preservado, NO eliminado)
- [ ] Skill `gotchas-search` instalada en `~/.claude/skills/gotchas-search/` con búsqueda funcional (F5 cerrado)
- [ ] Hook PostToolUse en `.claude/settings.json` reindexea automáticamente al editar `Spec/gotchas/*.md` (F6 cerrado)
- [ ] `CLAUDE.md` actualizado con los 5 pointers acotados (F7 cerrado); CLAUDE.md sigue dentro del techo orientativo
- [ ] Branch `feat/gotchas-flow` mergeada `--no-ff` a `main` con push a origin
- [ ] SPEC archivado post-merge via skill `archive-spec` en commit separado en `main` (paso 8 SDD, convención del repo)

---

## Validación post-cierre

**Smoke test inmediato post-merge:** ejecutar 3 queries representativas contra `~/.claude/skills/gotchas-search/search.py` y validar que devuelven hits relevantes:

- [ ] **Q1 keyword domain-specific:** `python search.py "marks text nodes"` → top hit es el gotcha de TipTap sobre marks en text nodes (`gotchas/editor-tiptap.md`)
- [ ] **Q2 dominio explícito:** `python search.py "dominio:capacitor-mobile"` → devuelve todos los gotchas de `gotchas/capacitor-mobile.md` (al menos 3-4 según corpus migrado)
- [ ] **Q3 cross-domain:** `python search.py "min-w-0 truncate"` → top hit es el gotcha primario en `gotchas/ui-componentes.md` con la línea `> Ver también:` apuntando a `gotchas/responsive-mobile-ux.md`

Si las 3 queries devuelven hits relevantes, la skill cumple el objetivo base de F37. Si no, pulir queries / corpus / tokenización antes de declarar la feature cerrada.

**Validación de la decisión "diferir Fase C"** (ongoing post-cierre):

Tras varias features cerradas usando solo la skill (sin subagentes), evaluar si el agente principal pudo invocar `gotchas-search` directamente sin fricción significativa. Señales de fricción que justificarían **reactivar Fase C** como SPEC follow-up:

- El agente principal consulta la skill 5+ veces por feature (overhead de invocación manual repetida)
- Errores de clasificación al cerrar gotchas (gotcha escrito en archivo equivocado, índice desactualizado, escalación incorrecta a CLAUDE.md)
- El agente principal carga `gotchas/<dominio>.md` entero en lugar de invocar la skill (señal de que la skill no se usa en la práctica)

Sin fricción observable → Fase C queda permanentemente diferida y D6 se confirma como decisión correcta a posteriori.

---

## Out of scope (deuda explícita v1)

- **Fase C completa: subagentes `gotchas-researcher` + `gotcha-classifier` + reescritura de pasos 2/8 SDD en CLAUDE.md.** Diferida hasta evidencia de fricción manual post-F37 (ver "Validación post-cierre" arriba). Contexto preservado en el DRAFT origen con nota explícita agregada en F4. Reactivar como SPEC follow-up si las señales de fricción aparecen — el DRAFT mantiene la política de verificación §4.6 + decisiones tentativas D6 / D7 (parte diferida) + el plan F1..F8 original.
- **Hook PreCommit validador de anchors.** Útil pero no bloqueante. Si los anchors del índice se rompen tras cambios futuros en `Spec/gotchas/*.md`, se detecta en E2E del próximo SDD que lo necesite. Escalar a follow-up si la fricción aparece.
- **Búsqueda semántica con embeddings.** BM25 keyword cubre el caso de uso. Embeddings agregan overhead injustificado para corpus de este tamaño (<400 KB). Re-evaluar si el corpus crece >2 MB o si las 3 queries de validación post-cierre devuelven hits irrelevantes consistentemente.
- **Re-evaluar gotchas obsoletos retroactivamente.** No hay pase masivo de housekeeping. La verificación pasa al consumidor (agente principal o, si Fase C se reactiva, subagente) como política ongoing. Cada gotcha se verifica al ser consultado, no por adelantado.
- **Métricas de precisión / recall sobre 5 features post-deploy.** Diferidas junto con Fase C — sin subagentes intermediarios, "precisión de verificación" no aplica directo. La validación post-cierre se simplifica a las 3 queries representativas inmediatas (D8 actualizada).
- **Compat con `Spec/gotchas/<dominio>.md` desde el agente principal directo.** El acceso directo es válido y esperable (el agente principal puede leer un archivo de dominio si ya sabe el dominio y necesita todo el canon). NO hay enforcement; la skill es una optimización opcional para queries por keyword.

---

## Referencias

- DRAFT origen: `Spec/drafts/DRAFT-gotchas-search-optimization.md` — discovery completo, **conservado** post-cierre con nota "Fase C diferida" agregada en F4 (NO eliminado)
- Skill referencia (patrón a clonar): `~/.claude/skills/ui-ux-pro-max/` — BM25 + corpus.json + reindex
- Política de verificación §4.6 DRAFT — referencia para reactivar Fase C si surge fricción
- Patrón canónico SPECs cerrados: `Spec/features/SPEC-feature-36-cache-stale-update-flow.md`, `Spec/features/SPEC-feature-33-hidden-sidebar-polish.md`
- Step 8 SDD (escalación + archivado): `CLAUDE.md` § "Metodología de trabajo — SDD"
- Convención de archivado post-merge: `git log` F36 → commit `2e20f59 docs(spec-36): archivar SPEC` separado del último `feat`
