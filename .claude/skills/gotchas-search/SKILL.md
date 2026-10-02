---
name: gotchas-search
description: Búsqueda BM25 sobre el corpus de gotchas técnicos por dominio del proyecto SecondMind. Devuelve los top-N más relevantes a una query con título, cuerpo, path canónico y paths referenciados.
type: cli
---

# Skill: gotchas-search

Skill del repo SecondMind para buscar gotchas técnicos consolidados en `Spec/gotchas/<dominio>.md`, un archivo por dominio (`--list-domains` muestra los actuales). BM25 stdlib Python; sin dependencias externas. Los comandos asumen cwd = raíz del repo.

## Cuándo invocar

1. **El usuario pregunta sobre comportamiento de un subsistema X** ("¿cómo funcionan los wikilinks?", "¿por qué falla el sync de TinyBase tras logout?", "¿cuál es el patrón para autosave del editor?"). Buscar gotchas relevantes para enriquecer la respuesta con contexto técnico vigente.
2. **Step 2 SDD (plan mode)** ya estás mapeando patrones existentes y necesitás verificar qué gotchas conocidos aplican al dominio de la feature. Invocar antes/durante el Plan agent para que el plan refinado los integre.
3. **Step 8 SDD (cierre de feature)** clasificás un gotcha nuevo: query con palabras clave para verificar si ya existe uno similar en el corpus (evita duplicación).

**NO invocar para gotchas universales** — esos viven en `CLAUDE.md` § "Gotchas universales" auto-cargado, no requieren búsqueda.

## Cómo invocar

```bash
# Búsqueda básica (top 5, formato markdown):
python .claude/skills/gotchas-search/search.py "marks text nodes"

# Filtrar por dominio:
python .claude/skills/gotchas-search/search.py --domain editor-tiptap "transformPastedHTML"

# Top N custom:
python .claude/skills/gotchas-search/search.py -n 10 "optimistic updates"

# JSON output (para parsing programático):
python .claude/skills/gotchas-search/search.py --format json "schema versioning"

# Threshold mínimo de score (filtra ruido):
python .claude/skills/gotchas-search/search.py --score-threshold 1.5 "h1 mobile"

# Listar dominios disponibles:
python .claude/skills/gotchas-search/search.py --list-domains
```

## Output

Por defecto markdown:

```
### Hit 1 — score 4.32 — gotchas/editor-tiptap.md

**Paste sin `transformPastedHTML` preserva atributos HTML del nodo aunque el schema filtre marks**

El schema ProseMirror descarta marks no registrados...

Anchor: gotchas/editor-tiptap.md#paste-sin-transformpastedhtml-preserva-atributos-html-del-nodo-aunque-el-schema-filtre-marks
Paths: src/components/editor/NoteEditor.tsx
```

## Reindex

`corpus.json` se regenera automáticamente vía hook PostToolUse cuando se edita cualquier `Spec/gotchas/*.md`. Manual:

```bash
python .claude/skills/gotchas-search/reindex.py
```

Lee `Spec/gotchas/*.md` desde cwd y emite `corpus.json` atómico en la skill dir (gitignored: es generado).

## Notas

- Tokenizer Unicode-aware (matchea acentos y `ñ` con `\w` Python 3.7+).
- Threshold tokenize `> 1` (no `> 2`) para preservar tokens cortos críticos: `ui`, `css`, `cf`, `h1`, `js`.
- BM25 k1=1.5, b=0.75. Score título 2× peso del body.
- `corpus.json` con `sort_keys=True` + `ensure_ascii=False` para diffs estables y legibles.
