# SPEC — Etapa 1: Pulido y deuda

> **Estado:** En curso (rama `feat/etapa1-pulido`), loop activo. Base: tag `e1-T0` (commit del SPEC).
> **Origen / autorización:** Sebastián, 2026-10-02: _"Etapa 1 = pulido y deuda (opción 2). Armá el borrador del SPEC."_ Es la primera etapa que estrena el método de [Docs/05](../../Docs/05-metodo-trabajo-autonomo.md) con `/loop`. **Loop autorizado** (2026-10-02, cita textual): _"Apruebo el SPEC-70. Autorizado el loop para la Etapa 1, rama feat/etapa1-pulido, commits y tags locales, sin push."_ > **Etiquetas:** locales `e1-T<n>`. **Nunca** `v*` (dispara `release.yml`). Sin push dentro de la etapa; el merge a `main` lo hace Sebastián al revisar.
> **Rama:** `feat/etapa1-pulido`.

---

## Objetivo

Cerrar deuda chica y verificable del cliente, sin backend, para estrenar el loop con riesgo bajo:

1. **Las notas en la papelera no se filtran a la UI.** Hoy el soft-delete (`deletedAt > 0`, `src/infra/repos/notesRepo.ts:231`) se respeta en búsqueda, grafo, hubs, cola de repaso, recientes y wikilinks, pero **no** en tres lugares (auditoría del 2026-10-02):
   - `src/app/projects/[projectId]/page.tsx:68-83` — "Notas vinculadas (N)" del proyecto lista y cuenta notas en papelera (el click lleva a "no encontrada"); `:93` `hasAnyNotes` las cuenta.
   - `src/hooks/useBacklinks.ts:23-35` — si A enlaza a B y A va a la papelera, B sigue mostrando a A en Backlinks y en el contador del toggle.
   - `src/hooks/useSimilarNotes.ts:76-84` — el soft-delete no borra el embedding, así que notas en papelera (y archivadas) aparecen entre las 5 similares.
   - No hay helper compartido: conviven 4 variantes de la condición (`typeof … === 'number' && … > 0`, `(… as number) > 0`, `doc.deletedAt === 0`, `!row.deletedAt`).
2. **Popovers tapados por el sidebar.** `src/components/editor/DistillIndicator.tsx:115-116` repite el bug que `22f7f3a` arregló en `PendingSyncIndicator`: `z-50` en `Popover.Popup` (estático, sin efecto) en vez de en `Popover.Positioner` → queda detrás del sidebar `z-30`.
3. **Share intent de Android con entidades HTML.** Chrome Android manda el título con `&#34;` en vez de `"`; llega crudo al textarea de Quick Capture y al inbox (`src/hooks/useShareIntent.ts:18-26`). No hay util de decodificación ni tests de esa ruta.

**Fuera de alcance (verificado resuelto el 2026-10-02):** fuentes Geist en el build (arreglado en `32d1cbf`; `npm run build` sin warnings, 3 woff2 en `dist/assets/`) y el popover de `PendingSyncIndicator` (arreglado en `22f7f3a`, v0.5.0+; si se sigue viendo en Tauri, es un build viejo → Pasos manuales).

## Invariantes

- **I1 — Producción intocable.** Ni CLI ni MCP sobre `secondmindv1`, sin deploy, sin push, sin tags `v*`. UI solo con `npm run dev:emu` / `npm run e2e:ui`.
- **I2 — Sin cambios de shape ni backend.** No se tocan `src/stores/*.ts` (shape de rows), `TINYBASE_SCHEMA_VERSION`, `UserPreferences`, `src/functions/`, `firestore.rules` ni índices. Todo es lectura/derivación del lado del cliente.
- **I3 — La infraestructura no filtra.** Sync, persistencia, `saveQueue`, `syncLinksFromEditor`, repos, export (`shapeExportData`/`collectExportData`) y la tab Papelera (`useTrashNotes`) conservan su comportamiento exacto. El filtro de "nota viva" es solo para vistas.
- **I4 — Equivalencia del helper.** Migrar un consumidor al helper no cambia su resultado para ningún valor de `deletedAt` que exista hoy (`undefined`, `0`, número > 0, string numérico si lo hubiera): si una variante vieja trataba un caso distinto, se registra como decisión del juez con el porqué.
- **I5 — Control positivo.** Todo test nuevo falla contra el código anterior o contra una mutación deliberada, y se reporta el FAIL observado.
- **I6 — Copy y visual son de Sebastián.** No se cambian textos (`src/locales/`) ni estilos más allá del z-index pedido; cualquier otra cosa visual se estaciona.
- **I7 — Verde.** Cada tanda cierra con `npm run verify` PASS; la etapa cierra además con `npm run e2e:ui` verde.

## Plan por tandas

| Id     | Objetivo                                                            | Áreas                                                                                                                       | Tamaño | Riesgo | Depende |
| ------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ------- |
| **T1** | Helper `isTrashedNote` + cerrar las 3 fugas de papelera, con tests  | `src/lib/noteGuards.ts` (nuevo), `projects/[projectId]/page.tsx`, `useBacklinks`, `useSimilarNotes`                         | ~300   | Bajo   | —       |
| **T2** | Migrar los consumidores existentes al helper (refactor sin cambio)  | `useGraph`, `useKnowledgeHubs`, `useReviewQueue`, `useGlobalSearch`, `useOnboarding`, `useHybridSearch`, `useTrashNotes`, … | ~200   | Bajo   | T1      |
| **T3** | Popovers: z-index en el Positioner (`DistillIndicator` + barrido)   | `src/components/**` con `Popover.Positioner`/`Menu.Positioner`/`Select.Positioner`                                          | ~100   | Bajo   | —       |
| **T4** | Share intent: decodificar entidades HTML, con función pura testeada | `src/lib/decodeHtmlEntities.ts` (nuevo), `src/hooks/useShareIntent.ts`                                                      | ~200   | Bajo   | —       |

Modelos (Docs/05 § 3): todas las tandas son de riesgo bajo → writer y fixer `sonnet`, reviewer `opus`.

### T1 — Papelera: helper y fugas

- **Qué:**
  - `src/lib/noteGuards.ts` con `isTrashedNote(row)` (y si hace falta `isLiveNote`) que acepte una row cruda de TinyBase (`deletedAt` posiblemente `undefined`/no numérico). Test unitario propio.
  - Proyecto: "Notas vinculadas" y su contador excluyen notas en papelera; `hasAnyNotes` cuenta solo notas vivas. Extraer la derivación del `useMemo` de la página a un hook o función testeable (p. ej. `useProjectNotes`), siguiendo Docs/03 ("lógica en hooks").
  - `useBacklinks`: saltear links cuyo `sourceId` esté en papelera **o** no exista en `notesTable`.
  - `useSimilarNotes`: excluir notas en papelera y archivadas (mismo criterio que `useHybridSearch.ts:38-45`).
- **Fuentes de verdad:** este SPEC § Objetivo; `src/hooks/useKnowledgeHubs.ts` + su test como patrón; `src/hooks/useHybridSearch.ts:38-45`.
- **Criterio de cierre:** tests nuevos de los 3 consumidores + helper en verde; `npm run verify` PASS.
- **Control positivo:** cada test nuevo falla con el filtro quitado (mutación) — reportar el FAIL.
- **Mirar con lupa (revisor):** que el contador del toggle de backlinks (`NoteEditorContainer.tsx:46,156`) quede consistente con el panel; restaurar una nota de la papelera la hace reaparecer (reactividad: el hook debe depender de las cells de `deletedAt`, no solo de `links`); `useSimilarNotes` con cache de embeddings que referencia notas ya purgadas; I3.

### T2 — Migración al helper

- **Qué:** reemplazar las variantes de la condición por el helper en los consumidores de vista: `useGraph.ts:44`, `useKnowledgeHubs.ts:32`, `useReviewQueue.ts:24`, `useGlobalSearch.ts:48,122`, `useOnboarding.ts:67`, `useHybridSearch.ts:38-45`, `wikilink-suggestion.ts:37`, `RecentNotesCard.tsx:20`, `useNoteSearch.ts:41,64,80`, `useTrashNotes.ts:40` (inversa). Donde el consumidor trabaja sobre el doc de Orama ya normalizado (`rowToOramaDoc`), decidir si el helper aplica o se deja (decisión del juez).
- **Fuentes de verdad:** auditoría de T1 (tabla en § Avance); I3, I4.
- **Criterio de cierre:** `grep` de `deletedAt` en `src/hooks` y `src/components` muestra solo el helper o usos de infraestructura justificados; tests existentes intactos y en verde; `npm run verify` PASS.
- **Control positivo:** mutar el helper (p. ej. `> 0` → `>= 0`) hace fallar tests de al menos 3 consumidores distintos — reportar cuáles.
- **Mirar con lupa:** I4 (la variante `!row.deletedAt` de `useOnboarding` y `=== 0` sobre Orama tratan `undefined` distinto); que no se haya tocado infraestructura (I3); que el refactor no cambie dependencias de memo/hooks reactivos.

### T3 — Popovers detrás del sidebar

- **Qué:** en `DistillIndicator.tsx:115-116` mover el `z-50` del `Popover.Popup` al `Popover.Positioner`. Barrido de todos los `*.Positioner` de base-ui en `src/components/` (excepto `src/components/ui/`, que no se edita): cualquiera que ponga el z-index en el Popup o no tenga z-index y pueda abrirse junto al sidebar recibe el mismo arreglo. Patrón: `PendingSyncIndicator.tsx:155`, `CodeBlockNodeView.tsx:70`.
- **Fuentes de verdad:** commit `22f7f3a` (causa: el Popup es `position: static`, el z-index no aplica); `Spec/gotchas/ui-componentes.md`.
- **Criterio de cierre:** test (o chequeo estático en vitest) que falle si un `Positioner` de `src/components/` no lleva clase `z-`; verificación en el emulador (`npm run dev:emu`, Playwright MCP en `localhost:5180`, viewport 1280 con sidebar visible): abrir el popover de Distill en una nota y comprobar con `elementFromPoint` sobre el popup que el elemento visible es el popup y no el sidebar; captura en `test-results/` o scratchpad. `npm run verify` PASS.
- **Control positivo:** el chequeo estático falla contra `DistillIndicator` sin el arreglo; `elementFromPoint` devuelve el sidebar sin el arreglo (si el popup no se superpone al sidebar en ese layout, registrarlo y decir cómo se forzó la superposición).
- **Mirar con lupa:** que el barrido no edite `src/components/ui/`; que un Positioner fuera de Portal no necesite además un wrapper `relative z-50` (patrón `TableToolbar.tsx:65-68`); que no se cambie ningún otro estilo (I6).

### T4 — Share intent con entidades HTML

- **Qué:**
  - `src/lib/decodeHtmlEntities.ts`: decodifica numéricas decimales y hex (`&#34;`, `&#x22;`) y las con nombre comunes (`&quot; &amp; &lt; &gt; &#39; &apos; &nbsp;`), sin `DOMParser` (vitest corre en `node`), con `String.fromCodePoint` y tolerancia a entidades inválidas (se dejan tal cual).
  - Extraer de `useShareIntent.ts:18-26` una función pura (`buildSharedContent(event)`) que arme `content`/`sourceUrl` y decodifique título **y** texto; el hook la usa.
  - Tests de ambas.
- **Fuentes de verdad:** `src/hooks/useShareIntent.ts`; `src/components/capture/QuickCaptureProvider.tsx:18-42`; `Spec/gotchas/capacitor-mobile.md`.
- **Criterio de cierre:** tests verdes (incluye `"Hola &#34;mundo&#34;"` → `Hola "mundo"`, doble codificación `&amp;#34;` → `&#34;` — decodificar una sola vez, URL con `&amp;` en query); `npm run verify` PASS.
- **Control positivo:** los tests fallan con el hook/función sin decodificar.
- **Mirar con lupa:** decodificar una sola pasada (no recursivo); que una URL compartida no se rompa (`&amp;` en query se decodifica a `&` — decidir y registrar); no tocar nada de `android/` (el cambio es solo web); que el `sourceUrl` guardado siga siendo el mismo que antes salvo entidades.

## Verificación de la etapa

- `npm run verify` PASS en la rama tras cada tanda.
- `npm run e2e:ui` verde (3 viewports) antes del cierre.
- Grep final: `deletedAt` en `src/hooks` y `src/components` solo vía helper o infraestructura justificada.

## Avance

_(una entrada por tanda, ver plantilla)_

## Decisiones del juez (a ratificar)

_(vacío)_

## Estacionadas para Sebastián

_(vacío)_

## Pasos manuales de Sebastián

1. **Popover de sincronización en desktop.** Abrir la app Tauri instalada → Ajustes → "Acerca de" y anotar la versión. Si es ≥ 0.5.0 y el popover de "pendientes de sincronizar" sigue detrás del sidebar, avisar (es otro bug).
   **Qué deberías ver:** versión 0.6.0 y el popover por encima del sidebar.
2. **Share intent en Android (tras el próximo release, no en esta etapa).** Compartir una página desde Chrome Android cuyo título tenga comillas.
   **Qué deberías ver:** comillas normales en Quick Capture, no `&#34;`.
3. **Papelera.** En la app (emulador o la tuya tras el merge+deploy), mandar a la papelera una nota que enlaza a otra y está vinculada a un proyecto.
   **Qué deberías ver:** desaparece de Backlinks de la otra nota, de "Notas vinculadas" del proyecto y de "Notas similares"; al restaurarla, vuelve.

## Resumen de cierre

_(lo escribe el autor de la última tanda)_
