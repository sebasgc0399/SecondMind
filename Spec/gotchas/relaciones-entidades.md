# Relaciones entre entidades

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## Vinculaciones 1:N: el lado singular es autoritativo

`project.objectiveId === objective.id` es más robusto que `objective.projectIds.includes(projectId)` para render.

## Links bidireccionales con IDs determinísticos

`source__target` como docId en `links/`. `extractLinks()` se ejecuta en cada save del editor.

## ID determinístico `YYYY-MM-DD` para hábitos

Como `rowId` en TinyBase y `docId` en Firestore. Docs creados implícitamente al primer toggle. Patrón reutilizable para entidades time-indexed.

## `useBacklinks` auto-refresca `sourceTitle`

Vía join in-memory con `useTable('notes')`. No hay que re-sincronizar cache de `links/`.

## Orquestador cross-entity toca stores directo, no via repo (post-F38.1)

Cuando un orquestador en capa 3 (`src/infra/syncLinksFromEditor.ts` es el primer caso) muta un campo **derivado del state de otra entidad** (espejo bidireccional, denormalización), debe usar `<otroStore>.setPartialRow` directo en lugar de delegar al repo correspondiente.

Ejemplo concreto: `syncLinksFromEditor` actualiza `notes.incomingLinkIds` como espejo de la colección `links/`. Si delegara a `notesRepo.updateMeta(targetId, { incomingLinkIds })`, dispararía un `setDoc(merge:true)` explícito por cada target afectado. Esto duplica el trabajo del persister F12 diff-based, que ya emite `setDoc(merge:true)` cuando consume `changes` desde TinyBase. Resultado: write amplification N × por save (1 nota con N wikilinks → 2N writes Firestore en lugar de N+1). El comportamiento pre-F38.1 confiaba en el persister; F38.1 mantiene esa decisión.

**Criterio:**

- "**Es derivado del state de otro store** (espejo, denormalización, contador agregado)" → `setPartialRow` directo en el orquestador. Persister F12 propaga.
- "**Es entidad propia con own writes** (escribir un nuevo doc, cambiar un campo no derivado)" → vía repo (`repo.update` o método custom). Garantiza consistencia con el patrón retry F29.

NO aplica a CRUD vanilla del repo (`linksRepo.create/remove`), que usa el factory normal y respeta sync→async optimistic. Aplica solo al orquestador cross-entity cuando muta el store ajeno.
