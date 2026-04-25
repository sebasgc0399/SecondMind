# DRAFT — Roadmap Inbox + Notas (F22 → F26)

> Status: planificación post-F21, pre-SPEC F22.
> Última actualización: 2026-04-25.
> NO es canon. Vive hasta que F22-F26 estén implementadas y archivadas — entonces este archivo se elimina o se reemplaza por un draft actualizado para la siguiente iniciativa.
> Cada feature de este roadmap tiene su propio SPEC formal en `Spec/features/SPEC-feature-N-*.md` cuando se arranca su rama (paso 1 SDD).

---

## Contexto

Tras el cierre de F21 (eliminar `defaultNoteType` + surfacear `aiSummary`), Sebastián decidió dedicar **varias features consecutivas al subsistema Inbox+Notas** antes de avanzar a otras áreas. Objetivo declarado: que el subsistema "quede perfecto e impecable" en todos los sentidos. Este draft consolida el discovery hecho post-F21, el roadmap re-priorizado tras ese discovery, y los hallazgos críticos sobre cada feature antes de empezar SPEC.

---

## Discovery findings (decisivos para el roadmap)

Respuestas de Sebastián que cambiaron el framing inicial:

- **4 notas totales hoy.** El proyecto está en escala adopción, no escala dataset. Features de "smart resurface en 500 notas" o "batch processing del inbox" son prematuras.
- **FSRS es la feature más usada.** Acceso desde Dashboard (Resurfacing card) → click lleva a la nota due. Flujo cómodo, NO necesita vista `/review` dedicada.
- **Inbox apenas usado.** Procesa items directamente, no via InboxProcessor. El refinement del flujo Inbox baja prioridad.
- **Distill Levels confusos.** Descubrió `bold=L1` y `highlight=L2` por accidente. Nunca entendió qué hace L3 "Resumen ejecutivo". La UX no le explicó.
- **Visión AI: "más activa pero copiloto".** Quiere que la AI sugiera más cosas activamente — no esperar a que el user haga todo manual. Mantiene accept/dismiss, no override silencioso.
- **Captura: "nada nuevo por ahora, primero pulir core".** No prioriza audio/screenshot/clipboard expansion hasta que el flujo principal esté impecable.

---

## Mapa actual del subsistema (qué ya existe en main)

| Capa                    | Estado                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Captura**             | Quick Capture (Alt+N), Tauri global shortcut (Ctrl+Shift+Space), Capacitor share intent (Android), Chrome extension clipper. Solo texto, sin attachments.                                                                                   |
| **Procesamiento Inbox** | `processInboxItem` CF (Haiku) clasifica `note/task/project/trash` + suggestedTitle/Tags/Area/Priority/Summary. **Áreas hardcoded** en system prompt (`proyectos/conocimiento/finanzas/salud/pareja/hábitos`). UI one-by-one accept/dismiss. |
| **Conversión**          | Inbox → Note (`createFromInbox` con `aiProcessed: true` si hay tags), → Task, → Project.                                                                                                                                                    |
| **Edición**             | TipTap con wikilinks, slash menu (`/h1`, templates literature/permanent), bubble menu, paste sanitization. Distill Levels L0-L3 con badge + popover educativo.                                                                              |
| **AI sobre notas**      | `autoTagNote` CF (tags + aiSummary, NO clasifica noteType), `generateEmbedding` (OpenAI), `embedQuery` (callable).                                                                                                                          |
| **Búsqueda**            | Orama keyword + semantic hybrid, Command Palette global, knowledge graph (Reagraph), RecentNotesCard, SimilarNotesPanel.                                                                                                                    |
| **Lifecycle**           | Soft delete + papelera con auto-purga, search en papelera (F20). 3 tipos `fleeting/literature/permanent`, default `fleeting` desde F21.                                                                                                     |
| **FSRS**                | `lib/fsrs.ts`, `useDailyDigest`, `useResurfacing`. Card en dashboard que lleva a nota due. Sin vista dedicada `/review`.                                                                                                                    |

---

## Roadmap re-priorizado (F22 → F26)

| #       | Feature                            | Scope                                        | Motivación principal                               | Dependencia                                                                        |
| ------- | ---------------------------------- | -------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| **F22** | Distill Levels descubribilidad     | UX puro client-side                          | Fricción más concreta del user (1 de 5 ejes)       | Ninguna                                                                            |
| **F23** | AI sugiere acciones activamente    | Banner editor con sugerencias accept/dismiss | Visión "AI más activa" + manifestar AI invisible   | F22 (user debe entender Distill antes de que AI le sugiera acciones sobre Distill) |
| **F24** | FSRS widget mejorado en dashboard  | Refinement de la card existente              | Feature más usada del user, merece más prominencia | Ninguna (independiente, paralelizable)                                             |
| **F25** | `autoTagNote` clasifica `noteType` | Extender CF + UX banner en F23               | AI más activa sobre clasificación de notas         | F23 (necesita el banner de sugerencias para mostrar el `suggestedNoteType`)        |
| **F26** | Inbox refinement                   | Áreas dinámicas, batch, re-procesamiento     | Solo si sigue importando tras F22-F25              | Ninguna                                                                            |

**Re-evaluación al cierre de F25**: si Sebastián confirma que el inbox sigue siendo poco usado tras la mejora del subsistema Notas, F26 se desprioriza permanentemente. La decisión la toma él en uso real, no anticipadamente.

---

## Detalles por feature

### F22 — Distill Levels descubribilidad

**Hallazgo crítico**: el popover educativo YA EXISTE en `src/components/editor/DistillIndicator.tsx:11-33` (`LEVEL_META` con label + tip por nivel). El badge en `headerSlot` del editor abre `Popover` (base-ui) con explicación + botón "Escribir resumen L3" que abre el textarea. **El problema NO es ausencia de explicación — es descubribilidad cero del badge** (gris en L0, en periférico, sin first-time UX).

**Sub-features candidatas (a confirmar antes del SPEC formal)**:

- **F1** — Badge L0 con affordance descubrible: pulse sutil, hint text "?", o tooltip on-hover automático.
- **F2** — Auto-popover en primera apertura de nota: con dismiss persistente (`localStorage` o user pref).
- **F3** — Toast contextual al primer uso de bold/highlight: conecta acción (Ctrl+B) con cambio de estado ("Subiste a L1"). Una sola vez.
- **F4** — Entry point conceptual desde `/notes`: link "¿Cómo funciona la destilación?" abre modal/popover educativo. Cubre user curioso fuera del editor.
- **F5** — (Opcional) Mejorar copy del textarea L3 con placeholder ejemplo.

**Out of scope F22**:

- No tocar `computeDistillLevel.ts` (lógica está bien).
- No agregar nuevos niveles ni cambiar semántica.
- No tocar marks (bold/highlight como triggers).

**Estimación**: SPEC chico (~150-200 líneas), 100% client-side, ~4-5 commits.

**Estado pre-SPEC**: scope confirmado por user. Pendiente: branch + SPEC formal + Plan mode.

---

### F23 — AI sugiere acciones activamente

**Visión**: la AI ya corre en background (`autoTagNote` genera tags+summary, `generateEmbedding` procesa) pero el user no lo vive. F23 manifiesta esa AI con un **banner inline en el editor** que sugiere acciones accept/dismiss.

**Sugerencias candidatas a soportar** (a refinar):

- "AI sugiere promover a `literature` (detecté link a fuente externa)" — depende de F25 (que `autoTagNote` clasifique `noteType`).
- "AI sugiere promover a `permanent` (esta nota tiene N backlinks y está bien conectada)".
- "AI sugiere generar resumen ejecutivo L3 — ¿auto-generamos un draft?".
- "AI sugiere resaltar estas 3 frases como L1" — bold automático con preview accept/dismiss.

**Constraint**: P6 del proyecto ("AI copiloto, no piloto"). Todo accept/dismiss explícito, nunca override silencioso.

**Patrón visual**: similar a `AiSuggestionCard` existente (si está implementado — verificar al arrancar SPEC). Sparkles violet + banner colapsable.

**Estado pre-SPEC**: scope alto nivel definido. Discovery profundo + Plan mode al arrancar.

---

### F24 — FSRS widget mejorado en dashboard

**Confirmación del user**: el widget actual funciona bien, lleva directo a la nota due al click. **NO se hace vista `/review` dedicada.**

**Mejoras candidatas**:

- Badge "Te tocan N notas hoy" más prominente.
- Si N > umbral (ej. 5), link "Ver todas las due" abre lista filtrada.
- Estados: "Nada que repasar hoy" / "Te toca 1" / "Te tocan N" con copy diferenciado.
- (Opcional) Settings para configurar el umbral del widget.

**Out of scope**:

- Vista `/review` separada (descartada).
- Notificaciones push FSRS due (queda en backlog general, no F24).
- Cambios en `lib/fsrs.ts` (algoritmo intacto).

**Estado pre-SPEC**: scope chico, posiblemente 1-2 commits totales. Discovery: revisar `useResurfacing` y la card actual antes de SPEC.

---

### F25 — `autoTagNote` clasifica `noteType`

**Cambio en `processInboxItem` y `autoTagNote`**: cuando una nota tiene contenido suficiente, la CF retorna `suggestedNoteType: 'fleeting' | 'literature' | 'permanent'` con confianza. La UX (F23) muestra el banner "AI sugiere literature — Aceptar / Descartar".

**Heurísticas tentativas para la AI** (a refinar en discovery):

- `literature` si detecta `source` link o cita a obra externa.
- `permanent` si la nota está bien conectada (>3 wikilinks salientes) Y tiene resumen L3.
- `fleeting` por default.

**Constraint**: nunca override silencioso. Solo sugerencia. El usuario decide.

**Acoplamiento**: F23 + F25 son una unidad lógica (CF clasifica + UI sugiere). Posible mergear ambos en un solo SPEC al llegar — decisión a tomar al cierre de F22.

**Estado pre-SPEC**: scope conceptual. Discovery + Plan mode al arrancar.

---

### F26 — Inbox refinement (re-evaluación)

**Triggers**: tras F22-F25, si Sebastián reporta fricción real con Inbox en uso, se prioriza. Si no, se desprioriza permanentemente.

**Sub-features candidatas (si se hace)**:

- Áreas dinámicas: `processInboxItem` CF lee `users/{uid}/areas` en runtime en lugar de hardcodear en system prompt.
- Batch processing: procesar N items del inbox a la vez.
- Re-procesamiento: si user rechaza una sugerencia, opción "vuelve a clasificar" en lugar de manual.
- Review prompt: notification "tenés N items hace >7 días en inbox".

**Estado**: backlog. NO se arranca discovery hasta cerrar F25.

---

## Out of scope explícito (decisiones del discovery)

Estas features NO entran en este roadmap aunque parezcan relevantes:

- **Captura multimodal** (audio/screenshot/clipboard expansion). User: "nada nuevo por ahora".
- **Smart resurface basado en contexto activo** (proyecto / notas abiertas). Escala 4 notas no lo justifica.
- **Vista FSRS dedicada `/review`**. User confirma flujo cómodo desde dashboard.
- **UX diferenciada por tipo de nota** (filtros separados fleeting/literature/permanent en `/notes`). Primero entender el flujo via F23.
- **Wikilink suggester proactivo** ("esta nota podría linkear a X"). Bajo dataset hace falsos positivos.
- **Re-embedding mensual / weekly digest CF / FSRS due notifications**. Backlog general, no parte del subsistema Inbox+Notas.

---

## Cómo continuar desde otra sesión

1. **Leer este draft completo + `Spec/ESTADO-ACTUAL.md`** (estado consolidado del repo).
2. **Confirmar con Sebastián** cuál feature del roadmap arrancar. Default: la primera no-implementada.
3. **Seguir SDD estricto del proyecto**: branch `feat/<nombre>` → SPEC en `Spec/features/SPEC-feature-N-*.md` → Plan mode con explore agents → commits atómicos → merge `--no-ff` → deploy → archivar SPEC + escalar gotchas a ESTADO-ACTUAL.
4. **Verificar el estado del repo**: `git log --oneline -5` en main para saber qué F's están cerradas. Ajustar la numeración del SPEC siguiente si hay drift.
5. **Eliminar este draft** cuando F22-F26 estén todas archivadas, O reemplazarlo por un draft actualizado para la siguiente iniciativa multi-feature.

---

## Estado actual del repo (snapshot)

- **Última feature cerrada**: F21 (`581af33` docs estado-actual escalación gotchas, `1001fe1` merge feat/notes-aisummary-fleeting-default).
- **Producción**: https://secondmind.web.app con F21 deployada.
- **Branch activa**: este draft vive en `chore/roadmap-inbox-notas-draft`. Tras merge a main, próxima branch a crear es `feat/notes-distill-discoverability` para F22.
- **Pendiente inmediato**: arrancar SPEC F22 con scope ya validado en este draft.
