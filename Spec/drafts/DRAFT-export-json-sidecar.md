# DRAFT — Export JSON sidecar (fidelidad exacta del grafo por-ID)

> **Estado:** **PARKING-LOT.** Idea **diferida** en la decisión **D2 de [SPEC-67](../features/SPEC-feature-67-export-de-contenido.md)** (export de contenido). El export de SPEC-67 es **Markdown solo**. Este draft guarda la idea del export JSON para no perderla, **con su razón de ser y su gate de retoma**. NO es un SPEC ni código.
>
> **Gate para retomar:** que se construya **import** (traer un export de vuelta a SecondMind con el grafo intacto) o una feature de **backup completo reimportable**. Recién ahí el JSON gana sentido **con ese objetivo explícito** — no "por las dudas".
>
> **Import y backup están FUERA de alcance del export actual** (SPEC-67 es una sola dirección: sacar una copia). Este draft NO los reabre; los registra como el escenario futuro donde el JSON valdría.

## 1. Qué es

Un export **JSON estructurado por `noteId`**, como **complemento o alternativa** al export Markdown de SPEC-67. Captura:

- Cada nota con su **`content` TipTap (ProseMirror JSON) verbatim** — sin la serialización lossy que implica pasar a Markdown.
- Las **referencias de links por `noteId` exacto** (de la colección `links/` o de los nodos `wikilink` del `content`), conservando `context` y `linkType`.
- El resto del Contenido (tasks, projects, objectives, habits, inbox) con sus IDs y vínculos intactos.

A diferencia del Markdown (que reconstruye el grafo **por título**), el JSON preserva el grafo **por identidad opaca** (`noteId` autogenerado por Firestore).

## 2. Qué problema resuelve

**Fidelidad EXACTA del grafo por ID, sin la ambigüedad del matching por título** que tiene el Markdown. Las **tres fallas verificadas en SPEC-67** (todas derivadas del desacople identidad-`noteId` vs presentación-`título`) **desaparecen** con referencias por ID:

1. **Stale title** — `attrs.noteTitle` se congela al insertar y nunca se refresca en rename (verificado: cero callers de propagación). El Markdown puede emitir `[[Título Viejo]]`; el JSON apunta por `noteId`, inmune.
2. **Colisión / ambigüedad** — títulos duplicados o "Sin título" rompen el matching por nombre de archivo en Obsidian/Logseq; el `noteId` es único por construcción.
3. **Dangling** — wikilinks colgados a notas hard-deleted; en JSON el ID dangling es explícito y diagnosticable, no un `[[Título]]` falso.

Además: `content` TipTap **verbatim** (cero pérdida de marks de progressive summarization L1/L2/L3, tablas, code blocks, atributos de nodos).

## 3. Por qué se difirió (de la decisión D2 de SPEC-67)

El **objetivo del §14 del ToS** es exportar el Contenido en un **formato de uso común**, en **una sola dirección**. Para eso:

- El **Markdown con wikilinks fresh-resolved ya cumple** — es **legible** por humanos e **interoperable** con herramientas de uso común (Obsidian/Logseq/Foam reconstruyen el grafo bidireccional por título automáticamente). Es lo que el §14 pide.
- El **JSON por-ID NO es "de uso común"** ni para un humano ni para otra herramienta: **nadie consume `noteId` de SecondMind**. Un export JSON sería un archivo que ningún tercero sabe leer.
- Su **único consumidor real** sería la **re-importación de alta fidelidad** dentro del propio SecondMind — que está fuera de alcance.

→ Construir el JSON ahora sería trabajo para un consumidor que no existe. **Markdown solo.**

## 4. Qué lo gatea (cuándo retomarlo)

Retomar este draft **solo si** aparece uno de estos objetivos explícitos:

- **Import** — una feature que traiga un export de vuelta a SecondMind reconstruyendo el grafo **por ID exacto** (round-trip sin pérdida). Ahí el JSON es el formato natural (el Markdown perdería identidad).
- **Backup completo reimportable** — un snapshot fiel del estado del usuario pensado para restaurar, no para leer.

En cualquiera de los dos, el JSON se evalúa **con ESE objetivo** (fidelidad de round-trip / restore), no como característica "por si acaso" del export legible. El diseño concreto (shape del JSON, versionado de schema, cómo se reconcilian IDs al reimportar) se define en el SPEC de esa feature, no acá.

## 5. Referencias cruzadas

- **Origen:** [SPEC-67 — Export de contenido](../features/SPEC-feature-67-export-de-contenido.md), decisión **D2** (Markdown solo) y la sección "El punto arquitectónico clave: wikilinks / backlinks" (las 3 fallas del matching por título).
- **Alcance del export actual:** una sola dirección. Import/backup **fuera de alcance** de SPEC-67 — este draft es el lugar donde esa idea espera su objetivo.
