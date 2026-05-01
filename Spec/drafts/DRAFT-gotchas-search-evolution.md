# DRAFT — Evolución de gotchas-search post-F37

> **Tipo:** Investigación / notas de discovery (no es SPEC ejecutable)
> **Origen:** Research realizado durante F37 (Mayo 2026) evaluando alternativas al BM25 custom
> **Trigger de activación:** Corpus cruza ~500 gotchas, o recall del BM25 cae <70% en uso real, o entra un segundo dev
> **Estado:** Dormant — reactivar cuando se cumpla algún trigger

---

## Contexto

F37 implementó `gotchas-search` como skill con BM25 puro en Python stdlib (~60 líneas, clonado de `ui-ux-pro-max/core.py`). Funciona bien para el corpus actual (~226 gotchas, <400KB) porque las queries son keyword-heavy (términos técnicos: `setDoc`, `merge`, `skipWaiting`, `marks text nodes`).

BM25 tiene un límite conocido: queries conceptuales ("¿qué pasa cuando hay un error de red durante un update?") pierden recall porque no hay match de keywords directo. Esto no es problema hoy pero lo será si el corpus crece o las queries se vuelven más abstractas.

---

## Upgrade path: BM25 → Hybrid search

**Cuándo:** Corpus >500 gotchas, o después de medir recall <70% en 5+ features post-F37.

**Qué:** Agregar embeddings al `corpus.json` y cambiar `search.py` a scoring híbrido.

**Cómo (estimado ~2h de implementación):**

1. Agregar campo `embedding` (vector float[]) a cada entry de `corpus.json`
2. En `reindex.py`: generar embedding de `titulo + body` via OpenAI `text-embedding-3-small` (ya integrado en SecondMind para notas — `generateEmbedding` CF)
3. En `search.py`: scoring híbrido `final = (weight_bm25 * bm25_score) + (weight_cosine * cosine_similarity)`
4. Pesos sugeridos: BM25 0.3 + cosine 0.7 (ajustar empíricamente)
5. `reindex.py` necesitaría `OPENAI_API_KEY` como env var (ya existe en el proyecto para la CF)

**Trade-off:** Agrega dependencia de red al reindex (API call para embeddings). Mitigación: cache de embeddings por hash de contenido — solo re-generar si el body cambió.

---

## Alternativa más ambiciosa: MCP server dedicado

**Cuándo:** Segundo dev en el equipo, o consumo desde múltiples máquinas/agentes.

**Qué:** Reemplazar la skill CLI por un MCP server que exponga búsqueda de gotchas como tool. Herramientas existentes en el ecosistema:

- **Beacon** (community, Marzo 2026): Plugin Claude Code que intercepta Grep y lo reemplaza con hybrid search (BM25 + dense vectors via Ollama local). SQLite + FTS5 + embeddings. Usa `context: fork` para lanzar subagentes automáticamente.
- **Claude Context** (Zilliz, Abril 2026): MCP server con Milvus-backed hybrid search. ~40% reducción de tokens vs grep nativo según benchmarks de Zilliz. Overkill para corpus de gotchas, diseñado para codebases grandes.
- **DuckDB `duckdb-docs` skill** (oficial DuckDB): FTS sobre archivos remotos vía HTTPS. Si la skill necesitara ser consumible desde fuera de la máquina local, SQLite con FTS5 sería más portable que JSON + Python.

**Recomendación:** Si se activa este path, empezar con Beacon (más liviano, local-first, compatible con el patrón de skills existente) antes de considerar Milvus/Claude Context.

---

## Idea: `context: fork` para Fase C diferida

Si se reactiva Fase C de F37 (subagentes `gotchas-researcher` + `gotcha-classifier`), el patrón `context: fork` en skills de Claude Code (documentado en docs oficiales Mayo 2026) permite que una skill lance un subagente Explore automáticamente desde el SKILL.md:

```yaml
---
name: gotchas-search
description: Buscar gotchas técnicos por keyword o dominio
context: fork
agent: gotchas-researcher
---
```

Esto eliminaría la necesidad de crear archivos separados en `~/.claude/agents/` — el subagente viviría integrado en la skill. Más cohesivo, menos archivos.

**Prerequisito:** Validar que `context: fork` + `agent: <custom>` funciona con agentes custom (la doc solo muestra `agent: Explore` y `agent: Plan` como built-ins). Si no soporta custom, mantener archivos separados.

---

## Decisión

No hacer nada ahora. Este DRAFT se reactiva cuando:

1. `wc -l Spec/gotchas/*.md` cruza ~1500 líneas totales (~500 gotchas × ~3 líneas promedio), **o**
2. Recall medido de la skill cae <70% tras 5+ features usando el flujo, **o**
3. Se incorpora un segundo dev al proyecto

Hasta entonces, BM25 stdlib es el approach correcto.
