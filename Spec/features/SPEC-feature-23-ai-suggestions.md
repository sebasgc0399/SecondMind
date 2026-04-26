# SPEC F23 — AI sugiere acciones activamente

> Status: SPEC vigente, pre-implementación.
> Branch: `feat/notes-ai-suggestions`.
> Fecha: 2026-04-25.
> Ciclo: SDD canónico — SPEC → Plan mode → branch → commits → merge → deploy → archivar.
> Acoplamiento: F23 + F25 del roadmap (`Spec/drafts/DRAFT-roadmap-inbox-notas.md`) mergeados en este SPEC. F25 estaba planeado como feature separada para extender `autoTagNote` con `suggestedNoteType`; sin esa pieza, F23 sería infra UI vacía sin sugerencias AI reales.

---

## Objetivo

Manifestar la AI invisible que ya corre en background (`autoTagNote`, `generateEmbedding`) vía un **banner inline en el editor** que sugiere acciones contextuales sobre la nota con accept/dismiss explícito (P6: AI copiloto, no piloto).

Dos tipos de trigger en este SPEC:

- **A. Sugerencia AI persistida (server-side):** `autoTagNote` extendida retorna `suggestedNoteType` con confianza alta cuando la heurística semántica detecta que la nota encaja mejor en `literature` o `permanent` que en su `noteType` actual.
- **B. Sugerencia heurística (client-side):** sin CF, computada en cada render — "promover a `permanent`" cuando la nota tiene `>3 wikilinks salientes` Y `summaryL3` truthy Y todavía es `fleeting`/`literature`. No requiere AI.

Out de este SPEC: generación de drafts L3 (sugerencia C del draft) y resaltado automático de frases L1 (D). Cada una merece su propio ciclo SDD por costo de infra (CF callable nueva, manejo de selección programática TipTap, preview reversible).

---

## Discovery (estado pre-código)

| Pieza                             | Ubicación                                                                                            | Comentario                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `autoTagNote` CF actual           | [`src/functions/src/notes/autoTagNote.ts`](../../src/functions/src/notes/autoTagNote.ts)             | Retorna `{ tags, summary }`. Guard `aiProcessed=true` evita re-procesar. Este SPEC extiende el schema + lógica + escribe `suggestedNoteType` al doc.                                                                        |
| Schema enforcement actual         | [`src/functions/src/lib/schemas.ts`](../../src/functions/src/lib/schemas.ts)                         | `NOTE_TAGGING_SCHEMA` con tool use forzado. Patrón a extender para incluir `suggestedNoteType` + `noteTypeConfidence`.                                                                                                      |
| Tipo `Note`                       | [`src/types/note.ts`](../../src/types/note.ts)                                                       | Ya tiene `noteType`, `aiTags`, `aiSummary`, `aiProcessed`. Agregar `suggestedNoteType?: NoteType` (de F25) + `dismissedSuggestions: string[]` (de F23).                                                                     |
| `AiSuggestionCard` existente      | [`src/components/capture/AiSuggestionCard.tsx`](../../src/components/capture/AiSuggestionCard.tsx)   | Acoplado a `InboxAiResult` (note/task/project/trash + suggestedArea + priority + edit mode). Reusable como inspiración visual (Sparkles violet + border violet/5 + accept/edit), no como código. F23 crea componente nuevo. |
| Patrón de banners post-F22        | [`src/components/editor/DistillLevelBanner.tsx`](../../src/components/editor/DistillLevelBanner.tsx) | `role=status aria-live=polite`, animate-in fade-in, persistencia cross-device. Reusable para placement (después de `<SummaryL3>`, antes del editor body).                                                                   |
| Persistencia per-nota vs per-user | —                                                                                                    | F22 usó `UserPreferences` (per-user, cross-device, one-time). F23 usa el doc de la nota (per-note) — los dismissals son contextuales. Ej: dismissar "promover a permanent" en nota A no debe afectar nota B.                |
| `notesRepo.update()`              | [`src/infra/repos/notesRepo.ts`](../../src/infra/repos/notesRepo.ts)                                 | Wrapper sobre `baseRepo.update` con orden sync→async. Punto de entrada para el accept/dismiss desde el banner.                                                                                                              |

---

## Sub-features

### F1 — Extender `autoTagNote` CF para clasificar `noteType`

**Qué.** El schema enforcement de `autoTagNote` cambia para que el modelo retorne — además de tags + summary — un `suggestedNoteType` (`fleeting`/`literature`/`permanent`) con `noteTypeConfidence` (0-1). La CF escribe ambos campos al doc de la nota junto con tags/summary.

**Heurísticas que el system prompt debe aplicar:**

- `literature`: la nota cita o resume una fuente externa (link http, mención de libro/paper/blog, frase tipo "según X dice"). Confianza alta cuando hay link explícito.
- `permanent`: la nota representa una idea atómica original del usuario, bien formulada en sus palabras (no una cita), idealmente con conexiones (>2 wikilinks). Confianza alta cuando hay claridad conceptual + interconexión.
- `fleeting`: default. Capturas crudas sin estructura.

**Criterio.**

- Schema `NOTE_TAGGING_SCHEMA` extendido con `suggestedNoteType` y `noteTypeConfidence` como required.
- System prompt actualizado con las heurísticas arriba (tono claro, no ambiguo).
- CF escribe `suggestedNoteType` y `noteTypeConfidence` al doc además de los campos existentes.
- Si `suggestedNoteType === noteType` (la AI sugiere lo que ya tiene), NO se considera sugerencia activa — el banner no aparece.
- Confianza < 0.7 → tampoco se considera sugerencia activa (filtro client-side, evita ruido).

**Archivos.**

- `src/functions/src/lib/schemas.ts` — extender `NOTE_TAGGING_SCHEMA` + interface `NoteTagging`.
- `src/functions/src/notes/autoTagNote.ts` — actualizar system prompt + escritura del doc con campos nuevos.

**Notas técnicas.**

- Schema enforcement vía tool use ya está en su lugar — solo extender `properties`. Confianza como `number` (no string), validar rango 0-1 en client antes de mostrar.
- El system prompt actual es muy corto ("Eres un asistente que analiza notas personales..."). Extenderlo con las heurísticas explícitas pero sin inflar — máximo 200 palabras para mantener contexto compacto.

---

### F2 — Schema del doc nota: `suggestedNoteType` + `dismissedSuggestions`

**Qué.** Extender el tipo `Note` con dos campos opcionales:

- `suggestedNoteType?: NoteType` — poblado por la CF (F1). Lectura: si existe Y diferente del `noteType` actual Y no está dismisseado → sugerencia activa "Promover a X".
- `dismissedSuggestions: string[]` — array de IDs de sugerencias que el user ya dismisseó en esta nota. IDs canónicos: `'promote-to-literature'`, `'promote-to-permanent'`, `'promote-to-permanent-heuristic'`. Default `[]`.

**Criterio.**

- `Note` interface incluye los 2 campos.
- `notesRepo` expone helpers `acceptSuggestion(noteId, suggestionId, payload)` y `dismissSuggestion(noteId, suggestionId)`.
- Migración: notas pre-F23 sin estos campos siguen funcionando (parsing tolerante).

**Archivos.**

- `src/types/note.ts` — agregar campos a `Note`.
- `src/infra/repos/notesRepo.ts` — helpers `acceptSuggestion` y `dismissSuggestion`.
- `src/stores/notesStore.ts` — extender schema TinyBase si aplica (validar si `dismissedSuggestions` viaja por TinyBase o solo por Firestore — probablemente solo Firestore para evitar inflar TinyBase con array por nota).

**Notas técnicas.**

- `dismissedSuggestions` como array tiene problema de race: si el user dismissa dos sugerencias rápido, el segundo update lee el array stale del closure y pisa el primero. Solución: usar `arrayUnion(suggestionId)` de Firestore en `dismissSuggestion` para garantizar atomicidad. Mismo pattern que `markDistillBannerSeen` (F22) pero para arrays en lugar de booleans.
- `acceptSuggestion` para "promote to X": hace `notesRepo.update(noteId, { noteType: 'literature' })` Y `arrayUnion(suggestionId)` al `dismissedSuggestions` (para que la sugerencia no reaparezca tras aceptar).

---

### F3 — Hook `useNoteSuggestions` con heurística client-side

**Qué.** Hook que recibe `noteId` y retorna las sugerencias activas para esa nota. Combina:

- **Sugerencia AI (A):** lee `note.suggestedNoteType` del doc; si existe Y `!== note.noteType` Y `!dismissedSuggestions.includes(...)` → activa con id `promote-to-${suggestedType}`.
- **Sugerencia heurística (B):** computa client-side `note.outgoingLinkIds.length > 3 && note.summaryL3?.trim() !== '' && note.noteType !== 'permanent'` → activa con id `promote-to-permanent-heuristic`.
- **Dedup:** si A sugiere `permanent` Y la heurística B también, mostrar solo una (prioridad a A — viene del modelo, tiene más contexto).

**Criterio.**

- Hook retorna `Suggestion[]` ordenado por relevancia. `Suggestion = { id: string; label: string; description: string; action: 'promote-to'; payload: { noteType: NoteType } }`.
- Hook reactivo: cualquier cambio en el doc (nuevo `suggestedNoteType` de la CF, nuevo wikilink que cambia `outgoingLinkIds`, etc.) re-computa.
- Sugerencias dismisseadas no aparecen.
- Cuando todas las sugerencias se dismissean/aceptan, el hook retorna `[]` y el banner desaparece sin breaking changes.

**Archivos.**

- `src/hooks/useNoteSuggestions.ts` (nuevo) — lógica del hook.
- `src/types/suggestion.ts` (nuevo) — interface `Suggestion` + ids canónicos.

**Notas técnicas.**

- Lectura del doc vía `useRow('notes', noteId)` reactivo. NO leer Firestore directo.
- **Lo que no se persiste de la heurística B es el cálculo de las condiciones**, no el dismiss. Las condiciones (`outgoingLinkIds.length > 3`, `summaryL3` truthy, `noteType !== 'permanent'`) se re-evalúan en cada render. El **dismiss SÍ se persiste** en `dismissedSuggestions` con id `promote-to-permanent-heuristic` igual que A — alineamiento explícito: una vez dismisseada, queda dismisseada per-nota permanentemente, aunque las condiciones bajen y vuelvan a cumplirse. La sugerencia es activa si y solo si: (1) condiciones cumplidas Y (2) id no está en `dismissedSuggestions`. Si las condiciones nunca se cumplen, no aparece (no hace falta dismissear). Si el user dismissa con condiciones cumplidas y después agrega más wikilinks, no reaparece.

---

### F4 — Componente `EditorSuggestionBanner.tsx`

**Qué.** Banner inline en el editor que renderiza las sugerencias activas con accept/dismiss. Reutiliza el placement de `DistillLevelBanner`. Diseño:

- Sparkles violet + label "Sugerencia AI" (consistente con `AiSuggestionCard` en `/inbox`).
- Cada sugerencia: `description` + 2 botones "Aceptar" (primary violet) / "Descartar" (ghost).
- Si hay >1 sugerencia activa, stackearlas verticalmente con separador sutil. Más de 2 simultáneas es improbable (en este SPEC máximo 2 paths: AI + heurística B).

**Criterio.**

- Render condicional: solo si `useNoteSuggestions(noteId).length > 0`.
- Click "Aceptar" → invoca `notesRepo.acceptSuggestion(...)` con payload de la sugerencia. Banner se actualiza al next render (la sugerencia ya no está activa → desaparece).
- Click "Descartar" → invoca `notesRepo.dismissSuggestion(...)`. Banner se actualiza igual.
- `role="region" aria-label="Sugerencias de la AI"` para accesibilidad. Cada botón con label claro.
- Mobile 375: cabe sin overflow horizontal. Sugerencias largas se truncan con tooltip o se permiten 2 líneas.

**Archivos.**

- `src/components/editor/EditorSuggestionBanner.tsx` (nuevo).

**Notas técnicas.**

- A diferencia de `DistillLevelBanner`, NO tiene auto-dismiss — la sugerencia persiste hasta que el user actúe. Es información en demanda, no notificación efímera.
- Si el user navega a otra nota mid-action (poco probable porque accept/dismiss es 1 click), el `key={noteId}` del editor remonta y el state local del banner se resetea. Acceptable.

---

### F5 — Integración en `NoteEditor`

**Qué.** Render de `<EditorSuggestionBanner noteId={noteId} />` en `NoteEditor.tsx`, debajo de `<SummaryL3>` y `<DistillLevelBanner>`, antes del `<div className="note-editor">`. Coexiste con los banners existentes sin solapar.

**Criterio.**

- Orden visual: header (DistillIndicator + SaveIndicator) → SummaryL3 → DistillLevelBanner (efímero, 3s) → EditorSuggestionBanner (persistente) → editor body.
- Si ambos banners están visibles (transición de nivel reciente + sugerencia AI activa), no hay overlap layout.

**Archivos.**

- `src/components/editor/NoteEditor.tsx` — agregar import + render.

---

## Out of scope explícito

- **Sugerencia C del draft (generar draft de summary L3 con CF callable).** Requiere CF callable nueva con timeout largo + manejo de loading state + preview de draft regenerable. Cada uno de esos puntos es feature en sí. Follow-up.
- **Sugerencia D del draft (resaltar 3 frases como L1 con TipTap commands).** Requiere CF que retorne ranges/spans + comandos programáticos en TipTap para aplicar marks reversibles + preview pre-commit. Más complejo que C. Follow-up.
- **Re-tagging masivo** (sugerir re-procesar notas viejas con la nueva CF F25). Quedan con `aiProcessed: true` del schema viejo, no van a recibir `suggestedNoteType`. Si emerge necesidad, follow-up con script de migración (callable o local).
- **Notification system general** para sugerencias persistentes en dashboard / sidebar. F23 las muestra solo cuando el user está editando la nota. Si emerge "quiero ver todas las sugerencias pendientes en un lugar", follow-up.
- **Reset/re-show de sugerencias dismisseadas** desde `/settings`. Por ahora, dismiss = permanente per-nota. Si el user quiere "revivir" una sugerencia, follow-up.
- **Edición previa antes de aceptar** (como `AiSuggestionCard` en inbox tiene modo edit). Para "promote to X" no agrega valor — el user acepta el tipo, no edita un payload. Si emerge feature con payload editable, follow-up.

---

## Orden de implementación

1. **F1** — extender CF + schema. Sin esto, F3 hook no tiene fuente AI, solo heurística.
2. **F2** — schema del doc + helpers `notesRepo`. Sin esto, F4 no puede aceptar/dismissar.
3. **F3** — hook `useNoteSuggestions`. Sin esto, F4 no sabe qué renderizar.
4. **F4** — componente `EditorSuggestionBanner`. Visual y lógica de accept/dismiss.
5. **F5** — integración en `NoteEditor`. Trivial, último paso.

**Razón del orden.** F1-F2 son cambios de contrato (CF + schema doc); F3-F4-F5 son cliente. Hacer F1+F2 primero permite verificar el contrato CF→Firestore manualmente (deploy CF, crear nota, verificar `suggestedNoteType` en Firestore) antes de empezar UI. Si la CF tiene bug en F1, descubrirlo en este punto es más barato que post-UI.

---

## Decisiones clave (registradas para el archivado futuro)

- **F23 + F25 mergeados.** Sin la sugerencia AI persistida (A), F23 sería solo infra UI con la heurística client-side (B). El valor "AI activa" no se manifiesta. La unidad lógica es "CF clasifica + UI sugiere".
- **A + B incluidas, C + D fuera.** A demuestra el patrón AI server-side, B demuestra heurística client-side sin CF — ambos tipos de trigger validados en un SPEC. C y D requieren infra adicional (CF callable, TipTap commands) que merece su propio ciclo.
- **Persistencia per-nota, NO per-user.** Los dismissals son contextuales: "no me interesa que esta nota sea permanent" no implica "no me interesa que ninguna nota sea permanent". `dismissedSuggestions: string[]` vive en el doc de la nota, NO en `UserPreferences`.
- **`arrayUnion` para dismissedSuggestions.** Patrón Firestore atómico evita race de closure stale (mismo problema que `markDistillBannerSeen` en F22 con dot-notation). Aplica a cualquier futuro array que se modifica concurrentemente.
- **Confianza < 0.7 filtra sugerencias AI.** Evita ruido visual con sugerencias dudosas. Threshold elegido conservadoramente; ajustable si emerge feedback de uso.
- **Sin auto-dismiss del banner.** A diferencia de `DistillLevelBanner` (efímero, 3s, "te subió de nivel"), las sugerencias son información persistente — el user decide cuándo actuar. Mantenerlo visible hasta accept/dismiss.
- **Reuso visual sin reuso de código.** `AiSuggestionCard` (capture) inspira el look (Sparkles violet, border violet, accept-buttons), pero está acoplado a `InboxAiResult` con modo edit que F23 no necesita. Componente nuevo, no abstracción prematura.

---

## Gotcha conocido (documentar al cerrar feature)

**Cada write al doc de nota dispara `autoTagNote` + `generateEmbedding` CFs.** Los guards existentes los hacen no-op:

- `autoTagNote`: guard `if (after.aiProcessed) return;` evita re-procesar.
- `generateEmbedding`: guard verifica si `contentPlain` cambió desde el último embedding.

PERO la invocación de la CF se hace igual — costo de cold-start + log entry. Las acciones de F23 (aceptar/dismissar sugerencia, escribir `noteType` o `dismissedSuggestions`) son writes que disparan estas CFs sin cambiar contenido.

**Decisión:** no bloqueante para F23. Las CFs filtran en el handler. Si emerge costo real (tras dogfooding o métricas), follow-up para gate más temprano (ej: comparar `before.noteType` vs `after.noteType` en `autoTagNote` y skip si solo cambió noteType/dismissed).

Documentar esto en `Spec/ESTADO-ACTUAL.md` al archivar — patrón "write al doc dispara N CFs con guards no-op pero invocación" aplica a cualquier futura escritura sobre `users/{uid}/notes/{id}`.

---

## Verificación E2E

Tras F5 implementada, validar con Playwright + Firebase MCP en viewports 375 + 1280, light + dark.

1. **CF retorna `suggestedNoteType` en nota nueva:**
   - Crear nota fresca con contenido tipo "Mi idea: la economía conductual demuestra que..." (texto que la AI debería clasificar como `permanent`).
   - Esperar autosave (2s) + procesamiento CF (~5-10s).
   - Verificar Firestore tiene `suggestedNoteType: 'permanent'` y `noteTypeConfidence > 0.7`.
   - El banner aparece con "Promover a Permanent · descripción".

2. **Aceptar sugerencia AI:**
   - Click "Aceptar" en sugerencia "Promover a Permanent".
   - Verificar `noteType: 'permanent'` en Firestore (cambio aplicado).
   - Verificar `dismissedSuggestions: ['promote-to-permanent']` (sugerencia persistida como dismisseada para no reaparecer).
   - Banner desaparece (no más sugerencias activas).

3. **Descartar sugerencia AI:**
   - En otra nota con `suggestedNoteType: 'literature'`, click "Descartar".
   - Verificar `noteType` sin cambios + `dismissedSuggestions: ['promote-to-literature']`.
   - Banner desaparece.

4. **Heurística client-side B:**
   - Crear nota con `noteType: 'fleeting'`, agregar 4 wikilinks salientes (`@nota1`, `@nota2`, `@nota3`, `@nota4`), escribir summary L3.
   - Banner debe mostrar "Promover a Permanent" (heurística B, id `promote-to-permanent-heuristic`).
   - Aceptar → `noteType: 'permanent'`, `dismissedSuggestions` incluye el id heurístico.

5. **Dedup A vs B:**
   - Si la CF sugiere `permanent` Y la heurística también, banner muestra una sola (de A).
   - Aceptar/dismissar la de A no debe re-disparar la heurística B en el next render.

6. **Cross-note isolation:**
   - Dismissar sugerencia en nota X no debe afectar la misma sugerencia en nota Y.

7. **Tolerancia a notas pre-F23:**
   - Abrir nota antigua (sin `suggestedNoteType`, sin `dismissedSuggestions`). No crashea. Si pasa por `autoTagNote` rerun (poco probable por guard `aiProcessed`), se llena el campo.

8. **Mobile 375:**
   - Banner cabe sin overflow. Botones accept/dismiss accesibles con touch (min 44x44px).

---

## Checklist

- [ ] **F1** — `NOTE_TAGGING_SCHEMA` extendido con `suggestedNoteType` + `noteTypeConfidence`. System prompt actualizado. CF escribe los campos. Deploy CF (`npm run deploy:functions`).
- [ ] **F2** — `Note` interface + `notesRepo.acceptSuggestion` + `notesRepo.dismissSuggestion`. `arrayUnion` para `dismissedSuggestions`.
- [ ] **F3** — `useNoteSuggestions` hook + tipo `Suggestion`. Reactivo a cambios del doc. Dedup A vs B.
- [ ] **F4** — `EditorSuggestionBanner.tsx` componente nuevo. Sparkles violet + accept/dismiss + a11y.
- [ ] **F5** — Render en `NoteEditor` debajo de `<SummaryL3>`/`<DistillLevelBanner>`.
- [ ] E2E Playwright + Firebase MCP, 8 flujos arriba en 375 + 1280, light + dark.
- [ ] `tsc` + `eslint` pasan tras cada commit (PostToolUse hook ya formatea).
- [ ] `npm test` verde — agregar tests del hook `useNoteSuggestions` (dedup, dismiss filter, heurística trigger).
- [ ] Deploy CF + hosting (`npm run deploy:functions && npm run build && npm run deploy`). Tauri / Android opcionales (cambios web recogidos por auto-updater + WebView).
- [ ] Merge `--no-ff` a main con commit descriptivo.
- [ ] Archivar SPEC vía skill `archive-spec`.
- [ ] Escalar gotchas a `Spec/ESTADO-ACTUAL.md`:
  - "Write al doc nota dispara `autoTagNote` + `generateEmbedding` con guards no-op pero invocación" (gotcha conocido).
  - "`arrayUnion` para campos array concurrentes en Firestore" (patrón reusable).
  - "Persistencia per-entidad vs per-user para flags one-time: contextuales van en el doc, lifetime van en `UserPreferences`" (criterio de decisión).
