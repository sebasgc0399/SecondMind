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
