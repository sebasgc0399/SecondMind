# FSRS y resurfacing

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## FSRS opt-in requiere botón explícito

Sin "Activar revisión periódica", la feature es invisible porque notas nuevas no tienen `fsrsDue`. `ReviewBanner` tiene 4 estados: activar, due, próxima fecha, confirmación post-review.

## `Math.random()` no es seedable en JavaScript

Para orden determinístico diario de hubs en Daily Digest, usar hash numérico de `noteId + dateString`: `[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)`.
