---
name: archive-spec
description: Archive a completed SPEC by transforming it from prescriptive format (F1 Qué/Criterio/Archivo/Snippet) to a compact historical record preserving per-feature traceability. Triggers whenever the user mentions archiving, finalizing, limpiar, compactar, cleaning up, or converting a SPEC to 'registro de implementación' — especially after a feature has been merged to main and tested. Also triggers on phrases like 'este SPEC ya está terminado', 'hay que limpiar el SPEC', 'el SPEC está desactualizado tras cerrar la feature'. Use proactively when the user confirms a feature is done and the conversation touches the SPEC file. The skill verifies completion via git + SPEC state + conversation BEFORE making changes, because archiving a live SPEC is irrecoverable in workflow terms. Scope is SPEC file only — does NOT update ESTADO-ACTUAL.md or CLAUDE.md (SDD step 8 handles gotcha escalation separately).
---

# archive-spec

Transform a completed SPEC from prescriptive ("F1: Qué / Criterio de done / Archivo a modificar / Snippet") to a compact historical record ("F1 — short name: past-tense description. Archivos tocados: ..."). The skill is conservative by design: one extra confirmation is cheap; archiving a live SPEC is destructive to workflow even though git history preserves the file.

## When to use

User is working in a repo that follows SDD (Spec-Driven Development) with SPECs at `Spec/features/SPEC-feature-N-*.md` or `Spec/SPEC-fase-*.md`. The feature is done: merged to main, tested, confirmed. The SPEC still has instructional sections (F1/F2 blocks with "Qué to do", code snippets, orden de implementación, checklist) that are noise now because they describe a plan that's already executed.

Typical trigger phrases:

- "archivá el SPEC de feature N"
- "limpiá SPEC-feature-N, ya está terminado"
- "convertí el SPEC a registro de implementación"
- "este SPEC quedó desactualizado tras cerrar la feature"
- "hay que compactar el SPEC"

## Workflow

Four steps, in order. Do NOT skip Step 1.

### Step 1 — Verify the feature is actually done

Gather signals before doing anything. Archiving a SPEC whose feature is still in progress discards the plan the user is working from. Even though git preserves the old version, in practice nobody runs `git show <commit>:path` to recover a SPEC — they assume what's on disk is authoritative.

Check these signals:

| Signal                                                                                               | How to check                                                                                       | Weight   |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Merge commit on main referencing the feature                                                         | `git log --oneline --all --grep='feature.N\|<short-name>' -i` (also try feature-specific keywords) | **Alta** |
| Recent commits touching the SPEC file                                                                | `git log --oneline -- <spec-path>`                                                                 | **Alta** |
| SPEC header already says "Completada" / "done" / "Registro de implementación"                        | Read the SPEC                                                                                      | Media    |
| User confirmed in recent conversation ("probé", "funciona", "quedó bien", "está listo", "terminado") | Conversation context                                                                               | Media    |
| Checklist de completado mostly ticked (`[x]` > `[ ]`)                                                | Parse the SPEC                                                                                     | Baja     |

**Decision rules:**

- **Both High signals present + at least one Medium → proceed to Step 2.**
- **Mixed signals** (e.g., merge exists but checklist still has many unchecked boxes, OR header says "Completada" but no merge commit found) → ask explicitly. Quote the conflicting evidence and let the user resolve. Example: _"Veo el merge `a1b2c3d` de feature-N en main, pero la sección 'Checklist manual' tiene 6 items sin marcar. ¿Confirmás que está terminada y los items manuales ya se validaron?"_
- **No merge evidence** (no merge commit, no recent SPEC edits, no header confirmation) → **reject**. Do not proceed. Tell the user: _"No veo evidencia de que feature-N esté terminada: no hay merge commit, ni edits recientes al SPEC, ni confirmación en el header. Si está terminada, contame cómo (ej. 'la mergeé ayer desde otra máquina') y lo verifico de otra manera."_

The cost of one extra question is a few seconds. The cost of archiving a live SPEC is potentially hours of reconstructing what the user was planning.

### Step 2 — Transform following the template

The output format, verbatim as target:

```markdown
# SPEC — <nombre feature> (Registro de implementación)

> Estado: Completada <mes> <año>
> Commits: `<hash1>` <1-line desc>, `<hash2>` <1-line desc>, ...
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

<1-2 paragraphs preserved from original — the WHY of the feature, not the HOW>

## Qué se implementó

- **F1 — <short name>:** <past-tense description in 1-3 lines>. Archivos tocados: `path/a`, `path/b`.
- **F2 — <short name>:** <past-tense description>. Archivos tocados: `path/c`.
- **F3 — <short name>:** <past-tense description>. Archivos tocados: `path/d`, `path/e`.
- **F4 — <short name>:** <past-tense description, or "revertido" note with reason>.

## Decisiones clave

<preserve the markdown table as-is from the original, including column format>

## Rondas de fix (sólo si las hubo)

<If the original had Fix round 1 / round 2 / round 3 sections: consolidate into a single coherent narrative. Structure:

- What went wrong (root cause, not symptom)
- What the fix was
- Why previous attempts didn't work
  If no fix rounds: OMIT this section entirely. Don't leave an empty header.>

## Lecciones

<Preserve bullets of non-trivial insights from the original. Each bullet: what was learned + why it generalizes beyond this feature.>
```

#### Why keep F1/F2/... as distinct bullets (not prose)

Future traceability. In 6 months someone asks _"what files did F3 touch?"_ — a 3-paragraph prose narrative forces them to re-read everything. Four bullets with names and file paths is a glance. The structure-per-feature is worth the minor verbosity.

#### Sections to REMOVE entirely

- `Orden de implementación` — no longer relevant once done.
- `Out of scope` — useful during planning, noise after.
- `Checklist de completado` — replaced by `Estado: Completada` in the header.
- `Siguiente feature` — usually outdated pointers to stale candidates.
- `Estructura de archivos` (ASCII tree of files touched) — git tracks this; redundant.
- Code snippets ≥5 lines — they live in git. If a snippet is genuinely illuminating (rare), reference the commit: _"Ver `1ec915f` para el patrón de capabilities JSON."_
- Per-feature `Qué:` instruction blocks — past tense description in the `Qué se implementó` bullet replaces them.
- `Notas de implementación` that are duplicated in `ESTADO-ACTUAL.md` — the pointer in the header covers it.

#### Sections to PRESERVE

- `Objetivo` — context for _why_ the feature existed. Future readers need this.
- Feature-by-feature record (F1/F2/...) with distinct bullets, past tense.
- `Decisiones clave` table — the WHY of architectural choices.
- Bug narrative / fix rounds (consolidated) — the interesting learning material.
- `Lecciones` — the most reusable content in the entire SPEC.
- `Prerrequisitos descubiertos` / `Audit findings` / pre-implementation discovery sections → **promote to `Lecciones`** as generalizable bullets. These capture the highest-value reusable insights from the planning phase (library quirks, framework gotchas, hidden bugs in adjacent code, version-specific footguns) and shouldn't be discarded just because they sit under a planning-phase header. Each bullet should pivot from "we discovered X about this codebase" to "X is true and likely to bite again — here's the rule."
- The header pointer to `ESTADO-ACTUAL.md` — prevents future duplication.

### Step 3 — Preview and wait for confirmation

**Empirical baseline:** prescriptive SPECs compress **75–85%** (F7: 424→87, F6: 215→41). Use this band when estimating the line count in your preview — do NOT promise mild reductions like 50–65%. Previews that undershoot the actual result mislead the user about how much content will be cut, and they may approve based on a wrong mental picture.

Show a summary diff BEFORE writing. The user should see:

```
SPEC: Spec/features/SPEC-feature-N-<name>.md
Antes: <X> líneas
Después: ~<Y> líneas (−<Z>%)

Secciones eliminadas:
- Orden de implementación
- Out of scope
- Checklist de completado
- Estructura de archivos
- [otras específicas del SPEC]

Secciones preservadas/compactadas:
- Header: expandido con commits + pointer ESTADO-ACTUAL
- Objetivo: sin cambios
- Qué se implementó: F1-FN convertidos a bullets past-tense
- Decisiones clave: tabla intacta
- Rondas de fix: <N> secciones consolidadas en 1 narrativa / omitida si no había
- Lecciones: bullets preservados

¿Procedo a escribir y commitear?
```

Wait for explicit "sí" / "dale" / "ok" / "proceder". If the user redirects ("esperá, también eliminá X" or "preservá Y"), adjust and re-show the preview. Don't write without confirmation.

### Step 4 — Write and commit

Single atomic operation:

1. Write the transformed content to the SPEC file.
2. Stage only that file: `git add <spec-path>`.
3. Commit with message:

   ```
   docs(feature-N): archivar SPEC a registro de implementación

   <1-paragraph summary of what was removed/consolidated>

   <trailer Co-Authored-By definido en CLAUDE.md § SDD step 4 del proyecto>
   ```

4. Push to origin (`git push`) without asking — the SDD workflow pushes after each commit/merge.
5. Report the commit hash to the user.

## Constraints

- **Scope único: this skill only modifies the SPEC file.** Does not touch `ESTADO-ACTUAL.md` or `CLAUDE.md`. Those are the SDD step 8 concern (gotcha escalation), which happens _before_ this skill runs. Mixing archival with escalation is a recipe for subtle bugs — the user confirmed this design decision explicitly.
- **Local only.** Uses git + file reads + conversation context. No MCPs, no web fetches.
- **Original preserved in git history.** Do not create an `archive/` folder or backup copy. `git show <commit>:path` recovers if needed. Redundant storage is noise.
- **If the SPEC is partially archived** (header already says "Registro de implementación" and features are in past-tense with commit hashes, but the body still has zombie sections): this is the **most common edge case** — recurs every time someone runs an early or incomplete archival pass. Audit for these survivors:

  - `Verificación E2E` table (test-by-test results)
  - `Commits en orden` list separate from the header
  - `Archivos creados` / `Archivos modificados` / `Archivos NO tocados` sections (git tracks all of this)
  - `Siguiente iteración candidata` / `Siguiente feature` (always stale)
  - `Prerrequisitos descubiertos (durante el audit)` (high-value content but in wrong section)
  - Per-feature `Qué:` / `Criterio de done:` blocks still in instruction format

  Then offer the user **two explicit options**:

  1. **Full compaction** — apply the canonical template (typically 50–80% additional reduction). Move audit findings to `Lecciones`, compact commits into header, drop file lists and test transcripts.
  2. **Minimal cleanup** — remove only obviously stale sections (e.g. `Siguiente iteración candidata`). Leave the rest.

  Let the user choose. Don't assume the partial archive is "good enough" just because the header looks right.

- **If the SPEC has zero prescriptive content AND no zombie sections** (header in record format, body fully past-tense bullets, no test transcripts or file lists), tell the user: _"Este SPEC ya está completamente en formato de registro y no veo secciones zombie. ¿Hay algo específico que querés compactar más, o estoy malinterpretando el trigger?"_

## Safety checklist (run mentally before Step 4)

1. ✅ Verification passed or user confirmed explicitly.
2. ✅ Preview shown and approved.
3. ✅ Only one file modified.
4. ✅ ESTADO-ACTUAL.md and CLAUDE.md untouched.

If any of the above is false, stop.

## Reference examples

Two real archives executed in the SecondMind repo (April 2026), spanning the two main scenarios this skill handles:

**F7 — multi-monitor-capture (fully prescriptive → first-time archive):** 424 → 87 líneas (−80%). Original had F1-F4 in full prescriptive format (_Qué / Criterio de done / Archivo a modificar / Snippet de referencia / Notas de implementación_), `Orden de implementación`, `Estructura de archivos`, `Checklist de completado` with many unchecked, `Out of scope`, `Bugs descubiertos post-merge`, `Fix round 2` + `Fix round 3`, `Siguiente feature`. After: header expanded with commits, Objetivo preserved, F1-F4 as past-tense bullets (F4 marked "revertido" with reason citing tao#3610), Decisiones table D1-D5 intact, the 3 fix-round sections consolidated into one Bug A / Bug B narrative, 5 lecciones bullets.

**F6 — theme-system (partially archived → full compaction):** 215 → 41 líneas (−81%). Header _already_ said "(Registro de implementación)", features _already_ in past-tense with commit hashes — this is the partial-archive edge case from the Constraints section. Body still had `Verificación E2E` table (13 tests), `Commits en orden` list separate from header, `Archivos creados / modificados / NO tocados`, `Siguiente iteración candidata`, and a 10-bullet `Prerrequisitos descubiertos (durante el audit)` section. After: 8 commits compacted into a single header line, the 10 audit-finding bullets transformed into 6 generalizable `Lecciones` (Tailwind v4 quirks, Three.js limitations, Reagraph defaults, snapshot drift), all zombie sections dropped.

Both compressed in the **80% band** — confirming the empirical baseline cited in Step 3. If your preview promises significantly less reduction, recheck whether you're being too conservative about which sections to cut.

## What to do when uncertain

If you're unsure whether a section should be removed, preserved, or compacted: show it to the user in the preview and ask. It's better to stop mid-skill and ask than to make a judgment call that discards useful content.

If the SPEC is structured unusually (custom headers, unusual format), adapt the template: apply the _principles_ (remove prescriptive, preserve record + why + lessons) rather than forcing exact section names that don't match.
