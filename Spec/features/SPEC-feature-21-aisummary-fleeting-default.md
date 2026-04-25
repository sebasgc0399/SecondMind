# SPEC — F21 aisummary fleeting default (Registro de implementación)

> Estado: Completada Abril 2026 · Merge `1001fe1` a main
> Commits: `06d62ce` docs(spec), `8fd0975` refactor(preferences), `8f018eb` feat(orama), `33288d8` feat(notes)
> Producción: https://secondmind.web.app
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

Cerrar dos cabos sueltos del flujo de notas tras dogfooding de F20: (1) revertir la preferencia manual `defaultNoteType` introducida en F20 F3/F4 — toda nota nace ahora `'fleeting'` siguiendo el método Zettelkasten clásico, una "preferencia" que el usuario querría cambiar varias veces al día no es preferencia; (2) surfacear el `aiSummary` huérfano que genera la CF `autoTagNote` — antes se persistía en Firestore sin renderizarse en ningún lado, ahora aparece como segunda línea en `NoteCard` con itálica + Sparkles violet, alineado con P6 (AI copiloto, no piloto).

## Qué se implementó

- **F1 — Eliminar `defaultNoteType` del modelo:** campo removido de `UserPreferences`, `parsePrefs` simplificado, `VALID_NOTE_TYPES` eliminado, import `NoteType` huérfano limpiado. Archivos tocados: `src/types/preferences.ts`, `src/lib/preferences.ts`.
- **F2 — Eliminar UI del selector:** componente `DefaultNoteTypeSelector.tsx` borrado, sección `#notes` removida de Settings, scroll-to-hash sigue funcional para `#trash`. Archivos tocados: `src/app/settings/page.tsx`, `src/components/settings/DefaultNoteTypeSelector.tsx` (DELETE).
- **F3 — Hardcodear `noteType='fleeting'` en creación:** `NoteCreateOverrides.noteType` removido, `handleCreate` en `/notes` ya no pasa override y deps de `useCallback` ajustadas. Archivos tocados: `src/infra/repos/notesRepo.ts`, `src/app/notes/page.tsx`.
- **F4 — Agregar `aiSummary` al schema Orama:** campo en `NOTES_SCHEMA`, `NoteOramaDoc.aiSummary: string` required, `rowToOramaDoc` y `trashNoteToOramaDoc` setean default `''`. NO incluido en search properties (metadata visible, no buscable). Archivos tocados: `src/lib/orama.ts`, `src/app/notes/page.tsx`.
- **F5 — Renderizar `aiSummary` en `NoteCard`:** segunda línea bajo snippet con itálica + Sparkles violet-500 + `aria-label="Resumen generado por IA"`. Guard `mode !== 'trash'` bloquea render en papelera; truthy check sobre `aiSummary` evita render con vacío. Archivos tocados: `src/components/editor/NoteCard.tsx`.

## Decisiones clave

| #   | Decisión                                                            | Por qué                                                                                                                                                                           |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Toda nota nace `'fleeting'`, sin preferencia configurable           | Zettelkasten asume el flujo fleeting → literature/permanent como promoción, no taxonomía inicial. La promoción ocurre via slash menu (templates) o por AI futura (F22+).          |
| D2  | aiSummary solo en lista (NoteCard), NO en detail page ni en trash   | Detail muestra contenido completo (summary redundante). Trash está fuera del flujo activo (UI más simple). `TrashNote` no incluye el campo; el mapper hardcodea `''` para tipar.  |
| D3  | aiSummary metadata visible, NO buscable                             | Search debe matchear lo que el user escribió, no lo que la AI sintetizó. Si F22+ lo requiere, se agrega a `properties` del search call.                                           |
| D4  | NoteOramaDoc.aiSummary required (no opcional), default `''`         | Default `''` en mappers garantiza siempre populated. Truthy check en JSX previene render con vacío. Reduce null-checks downstream.                                                |
| D5  | Visual: texto muted + icon violet-500 (no todo violet)              | Subtle AI presence (P6). Texto debe ser legible como contenido; icon comunica origen sin imponer contraste fuerte sobre la copia del usuario.                                     |
| D6  | NO migrar notas existentes con `noteType ∈ {permanent, literature}` | El campo es del usuario una vez creado. Solo cambia el comportamiento de creación nueva. Legacy `defaultNoteType` en docs Firestore queda como dead data; `parsePrefs` lo ignora. |
| D7  | 3 commits agrupados (F1+F2+F3 en uno) en lugar de 5 atómicos        | Mantiene `tsc` limpio commit-a-commit. Confirmado en Plan mode con AskUserQuestion antes de desviar del SDD default.                                                              |

## Lecciones

- **Preferencia vs selector inline.** Una preferencia que el user quiere cambiar varias veces al día no es preferencia. Detectable preguntando: "¿el user abre Settings cada vez que va a usar X?". Aplicable a cualquier feature donde Settings parece el home de algo que debería ser inline o automático.
- **Zettelkasten es flujo, no taxonomía.** Fleeting → literature/permanent es una promoción, no una clasificación inicial. Si implementás un método externo, separar lo que es flujo de lo que es taxonomía antes de exponerlo como UX.
- **Orama es 100% in-memory; cambios de schema se propagan vía `addTableListener` rebuild en `useNoteSearch`.** Cero migración requerida. `useHybridSearch` reusa ese index; `useGlobalSearch` (`GLOBAL_SCHEMA`) sí es independiente. Auditar consumers antes de cambiar schema.
- **Mappers manuales son el riesgo escondido al cambiar schemas.** `trashNoteToOramaDoc` requirió ajuste para satisfacer `NoteOramaDoc` post-cambio. Patrón: cuando un campo se vuelve required, grep por construcciones literales del type, no solo el converter principal.
- **`note.X && mode !== 'trash'` es el patrón canónico para metadata AI en cards.** Truthy check explota el default `''` (falsy) evitando elementos vacíos; guard de modo permite suprimir AI en contextos donde no aporta.
- **Commits agrupados están justificados cuando la unidad lógica cruza varios archivos y atomicidad estricta rompe `tsc`.** SDD default es 1 sub-feature = 1 commit, pero si fuerza commits intermedios que no compilan, agrupar es mejor para `git bisect`. Confirmar en Plan mode con AskUserQuestion antes de desviar.
- **`createFromInbox` con tags AI aceptados (`tagIds.length > 0`) setea `aiProcessed: true`** — bloquea `autoTagNote` permanentemente. Trade-off existente del flujo inbox→note, no causado por F21: notas convertidas con AI tags nunca tendrán `aiSummary` visible. Escalado a ESTADO-ACTUAL.
