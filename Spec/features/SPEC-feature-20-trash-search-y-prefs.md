# Registro de implementación — Feature 20: Search en Papelera + Preferencia defaultNoteType

> Implementada: Abril 2026 · Merge `cb8f8a5` a main
> Dependencias: F19 (papelera + infra de preferencias)
> Archivos tocados: 6 (1 nuevo, 5 modificados)

---

## Resumen

Buscar dentro de la papelera por título/contenido y elegir el tipo de nota por defecto (Fugaz/Literatura/Permanente) desde Settings.

## Sub-features

| #   | Feature                                    | Commit    | Archivos clave                                                                  |
| --- | ------------------------------------------ | --------- | ------------------------------------------------------------------------------- |
| F1  | Search input en vista Papelera             | `c2b7ec0` | `notes/page.tsx`                                                                |
| F2  | Empty state diferenciado + fix count/purge | `69a7990` | `useTrashNotes.ts`, `notes/page.tsx`                                            |
| F3  | Preferencia defaultNoteType + selector UI  | `dcd3eee` | `preferences.ts` (type+lib), `DefaultNoteTypeSelector.tsx`, `settings/page.tsx` |
| F4  | Consumir defaultNoteType en creación       | `44efffc` | `notes/page.tsx`                                                                |

## Decisiones clave

1. **Trash search usa substring filter de `useTrashNotes`, NO Orama ni semántico.** Notas borradas están excluidas de Orama index y embeddings cache — reimplementar indexación paralela para un dataset pequeño sería over-engineering. El filtro substring existente (preparado en F19) cubre el caso.

2. **`count` separado de `notes` en useTrashNotes.** El SPEC original asumía que `count` era pre-filtro, pero era `result.length` (post-filtro). Refactoreado para que `count` y `allIds` reflejen el total real. "Vaciar papelera" usa `allIds` — purga todo sin importar el filtro activo.

3. **Wikilinks NO crean notas** — solo linkan a existentes. F4 del SPEC original incluía wikilinks como path de creación; la exploración en Plan mode confirmó que `wikilink-suggestion.ts` solo filtra de `notesStore`. F4 se redujo a 1 línea en `handleCreate`.

4. **Scroll-to-hash en Settings generalizado.** El `useEffect` original solo soportaba `#trash`; ahora lee `location.hash.slice(1)` y scrollea a cualquier `id`. Soporta `#notes`, `#trash`, y futuros.

## Lecciones generalizables

- **Verificar signatura vs uso real antes de asumir.** El SPEC dijo "wikilinks crean notas con defaultNoteType" pero la exploración mostró que wikilinks solo linkan — un Plan agent evitó implementar código muerto.
- **`count` post-filtro vs pre-filtro es un bug silencioso.** Si un hook devuelve `count: result.length` y un consumidor lo usa para badge/total, filtrar después rompe la semántica sin error de tipos.
