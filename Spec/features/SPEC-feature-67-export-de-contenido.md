# SPEC — Feature 67: Export de contenido del usuario

> **Estado:** **BORRADOR.** Research read-only completo (SDD step 2 parcial). Vuelve a **Claude web para GO/NO-GO sobre las decisiones D1–D6** antes del plan de implementación (mismo flujo que SPEC-66). **NO implementado. Decisiones ABIERTAS — este SPEC no las cierra.** > **Por qué existe:** prerrequisito de **publicación del ToS**. El ToS (en revisión legal) afirma en **§14** que «el Servicio le permite exportar su Contenido en un formato de uso común». Hoy **eso NO existe**. Conecta también con el **derecho de portabilidad de la Ley 1581** (Colombia). Es el segundo prerrequisito del ToS que falta implementar (el toggle de búsqueda semántica de SPEC-66 ya está mergeado).
> **Alcance (YAGNI duro — es lo que el SPEC debe blindar):** el feature **EXPORTA** — el usuario obtiene una **copia descargable** de su Contenido. **UNA sola dirección.** **NO** es sincronización, **NO** es backup automático, **NO** es import, **NO** es migración bidireccional, **NO** es export programado/periódico, **NO** persiste el archivo del lado servidor. Si el plan empieza a proponer cualquiera de esas, está **fuera de alcance** — frenarlo.

---

## Objetivo

Hacer verdad al **§14**: dar al usuario una vía para **obtener una copia de su Contenido** en un formato de uso común. Ni más. Mientras no exista, el §14 del ToS es una promesa incumplida y bloquea la publicación.

---

## Qué es "el Contenido del usuario" (inventario contra el modelo de datos REAL)

> **Fuente de verdad = los 7 stores/repos cliente reales, NO la tabla de entidades de CLAUDE.md ni `Docs/01`** (ver Hallazgo crítico #2). Lo que sigue está mapeado contra el código con archivo:línea.

### Entidades EXPORTABLES (Contenido del usuario per ToS §5) — 7

| Entidad                    | Path Firestore                           | Tipo (archivo:línea)                   | Qué es Contenido del usuario                                                                                                      | Dónde vive el dato                                                                                             |
| -------------------------- | ---------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **note / notes**           | `users/{uid}/notes/{noteId}`             | `src/types/note.ts:3`                  | `title`, `content` (TipTap JSON), `contentPlain`, `source`, `summaryL3` (resumen del usuario), `paraType`, `noteType`, `tagIds`   | **PARTIDO (crítico #1):** metadata + `contentPlain` en TinyBase; `content` **solo en Firestore**               |
| **task / tasks**           | `users/{uid}/tasks/{taskId}`             | `src/types/task.ts:3`                  | `name`, `description`, `status`, `priority`, `dueDate`, vínculos (`projectId`/`areaId`/`objectiveId`/`noteIds`)                   | TinyBase (`tasksStore`), doc liviano espejo del Row                                                            |
| **project / projects**     | `users/{uid}/projects/{projectId}`       | `src/types/project.ts:3`               | `name`, `status`, `priority`, fechas, vínculos (`taskIds`/`noteIds`/`areaId`/`objectiveId`)                                       | TinyBase (`projectsStore`)                                                                                     |
| **objective / objectives** | `users/{uid}/objectives/{objectiveId}`   | `src/types/objective.ts:3`             | `name`, `status`, `deadline`, vínculos (`projectIds`/`taskIds`/`areaId`)                                                          | TinyBase (`objectivesStore`)                                                                                   |
| **habit / habits**         | `users/{uid}/habits/{YYYY-MM-DD}`        | `src/types/habit.ts:24` (`HabitEntry`) | Los **registros diarios** (14 booleanos + `progress` + `date`). **NO** el catálogo de los 14 hábitos (hardcoded `habit.ts:5-22`)  | TinyBase (`habitsStore`), un doc por día                                                                       |
| **inboxItem / inbox**      | `users/{uid}/inbox/{itemId}`             | `src/types/inbox.ts:31`                | **`rawContent`** (captura cruda del usuario), `source`, `sourceUrl`. Los `aiResult`/`aiSuggested*` son **derivados** (excluibles) | TinyBase (`inboxStore`); el `rawContent` + flags AI aplanados en el Row (`repoRows.ts:107-122`)                |
| **noteLink / links**       | `users/{uid}/links/{sourceId__targetId}` | `src/types/link.ts:3`                  | **SOLO `linkType==='explicit'`** (wikilinks que el usuario escribió). `context` si lo escribió. **Condicionado** (ver abajo)      | TinyBase (`linksStore`), doc liviano; la verdad también está embebida en el `content` TipTap de la nota origen |

### EXCLUIDO (no es Contenido del usuario)

- **`embeddings`** (`users/{uid}/embeddings/{noteId}`, `Docs/01:320-331`) — **derivado**: vector 1536-dim generado por OpenAI, reconstruible desde las notas. Server-side only (sin store/repo cliente). **No exportar.**
- **`settings/preferences`** (`src/types/preferences.ts:1`), **`settings/aiKeys`** (`src/types/apiKey.ts:6`, `last4` de un secreto de terceros), **`settings/semanticSearch`** (`src/types/semanticConsent.ts:7`, evidencia de consentimiento §7.1) — **config/consentimiento**, no Contenido.
- **`userSecrets/{uid}/keys/{provider}`** — secreto BYOK cifrado AES-256-GCM (`Docs/01:121`), deny-all client-side. **Jamás se exporta.**
- **Campos AI/FSRS dentro de docs que SÍ se exportan:** `aiTags`, `aiSummary`, `aiProcessed`, `suggestedNoteType`, `noteTypeConfidence`, `fsrsState/Due/LastReview`, `viewCount`, `lastViewedAt` (`note.ts:19-34`), y `aiResult`/`aiSuggested*` de inbox — derivados por Claude Haiku / heurística / algoritmo, no escritura del usuario. **Distinción fina:** `summaryL3` **SÍ** es del usuario (resumen propio, `note.ts:17`); `aiSummary` **NO**.
- **Links `ai-suggested` no aceptados** (`linkType==='ai-suggested' && accepted===false`) — sugerencias de la AI que el usuario nunca confirmó.
- **Infra/sistema:** `config/app`, `allowlist/{email}`, `accessRequests/`, `rateLimits/` — kill-switch, gate de acceso, rate limiting.

### Dos hallazgos críticos del research

**#1 — El `content` de una nota NO vive en TinyBase.** El dato pesado (`content`, TipTap JSON serializado) vive **solo en el documento Firestore**, fuera del schema de TinyBase a propósito (`src/stores/notesStore.ts:5-7` comentario explícito · `src/infra/repos/notesRepo.ts:115-139` lo escribe con `setDoc(merge:true)` · `Docs/01:131`). TinyBase tiene la metadata + `contentPlain` (texto plano). **Implicancia dura:** exportar el contenido REAL de las notas requiere **leer Firestore** (no alcanza con TinyBase). El único lector cliente hoy es `useNote.ts:81-82` (`getDoc`, **una** nota a la vez, one-shot). No existe ningún fetch masivo del `content` de notas en el cliente.

**#2 — Las colecciones `areas/` y `tags/` NO existen.** La tabla de Entidades de CLAUDE.md y `Docs/01:113,115` las listan como `users/{uid}/areas/` y `users/{uid}/tags/`, pero **no hay `areasStore`/`tagsStore`/`areasRepo`/`tagsRepo` ni un solo write** (grep vacío). Son **documentación aspiracional desactualizada.** En la realidad: **areas = 6 keys hardcoded** (`src/types/area.ts:4-11`, label vía `buildAreaLabels`); **tags = inline** (`tagIds: string[]` en cada nota, `note.ts:13`, serializados como JSON-string en TinyBase). Se exportan **implícitamente como IDs dentro de cada entidad**, no como colecciones propias. **El set de colecciones a exportar son los 7 stores/repos reales, NO la lista de `Docs/01`.** (Verificado: `deleteAccount` usa `recursiveDelete` **ciego** sobre `users/{uid}` — `deleteAccount.ts:69` — no enumera colecciones, así que no contradice este inventario.)

### Gap de USABILIDAD (no de inventario) — a resolver en el plan

Exportar **keys opacas** sin su mapping a label produce un export **ininteligible**: los 14 booleanos de hábitos (`ejercicio`, `codear`…, label vía `buildHabitLabels`), los `areaIds` (label vía `buildAreaLabels`), y los enums (`paraType`, `noteType`, `status`) son IDs cuyo label se resuelve en runtime. **El export debe anexar los catálogos de labels** (key→label) aunque no sean "contenido creado por el usuario", o el archivo es inútil. **Excepción probable: `tagIds`** parecen ser **labels legibles** (no hay catálogo de tags ni generación de UUID; el AI los emite como strings en `suggestedTags` — `inboxRepo.ts:101-103`) → confirmar contra un doc de prod, pero la señal es fuerte.

---

## El punto arquitectónico clave: wikilinks / backlinks

> El corazón del producto. Un export que pierda la estructura de links es texto plano sin el grafo. **Este es el hallazgo que define el formato.**

### Cómo están representados HOY (archivo:línea)

- **Nodo TipTap, no mark.** Un wikilink es un `Node` ProseMirror `atom`/`inline` (`src/components/editor/extensions/wikilink.ts:27-98`). En el JSON aparece como `{ type: 'wikilink', attrs: { noteId, noteTitle } }` (`wikilink-suggestion.ts:81`). **Guarda AMBOS:** `noteId` (la **identidad** real del target) y `noteTitle` (el **texto visible**, capturado al insertar).
- **Colección `links/` derivada.** El cuerpo del editor es la fuente de verdad; la colección `links/` se deriva en **cada guardado** (autosave 2s): `useNoteSave.ts:118-133` → `extractLinks(json)` (`src/lib/editor/extractLinks.ts:12-34`, recorre el JSON y emite los nodos `wikilink`) → `syncLinksFromEditor` (`src/infra/syncLinksFromEditor.ts:108-151`, diff puro) → `linksRepo.syncLinks` (`linksRepo.ts:46-68`). ID compuesto determinístico `buildLinkId = sourceId__targetId` (`linksRepo.ts:18-20`). El doc también denormaliza `outgoingLinkIds`/`incomingLinkIds` dentro de cada nota (`note.ts:14-15`).
- **`linkedBy: ID.`** El target se identifica por **`noteId`**, no por título.
- **Backlinks = consulta inversa reactiva** sobre TinyBase en memoria (`useBacklinks.ts:16-38`), **NO** una query a Firestore. Resuelve el `sourceTitle` **fresh-first** (prioriza `notesTable[sourceId].title`, siempre al día; cae al denormalizado solo si la nota no está hidratada — `useBacklinks.ts:26-28`). **Esta frescura se PIERDE en un export estático.**

### El riesgo central: identidad (`noteId`) vs. presentación (`título`)

La identidad real es el `noteId` (opaco, autogenerado). Un export legible/interoperable (Markdown `[[Título]]`) se basa en el **título**. De ese desacople salen **tres fallas concretas** (todas verificadas en código):

1. **STALE TITLE** — `attrs.noteTitle` se **congela al insertar y NUNCA se refresca en rename**. **Confirmado:** grep de `updateWikilink|refreshTitle|onNoteRename|propagat` en `src/` = **cero matches**. Exportar usando `attrs.noteTitle` puede emitir `[[Título Viejo]]` que ya no matchea ningún archivo → link roto en el importador.
2. **AMBIGÜEDAD / COLISIÓN** — títulos duplicados o "Sin título" hacen el matching por nombre de archivo (en Obsidian/Logseq) ambiguo o fallido.
3. **DANGLING** — `onNoteDeleted` (hard delete) limpia `links/` pero **NO reescribe los nodos wikilink en el `content` de otras notas** (`onNoteDeleted.ts:13-17`). Quedan wikilinks colgados a notas inexistentes → `[[Título]]` sin destino. (Distinción soft vs hard delete: el soft-delete **no** dispara `onNoteDeleted`, deja `links/` vivos por diseño → el export puede tener wikilinks a notas en papelera.)

### Mitigación (recomendada, a validar en el plan)

- **(a)** Al exportar a Markdown, **resolver el título FRESCO desde `notesStore`/colección notes por `noteId`** (replicar el fresh-first de `useBacklinks.ts:26-28`), **no** confiar en `attrs.noteTitle`.
- **(b)** **Garantizar unicidad de nombres de archivo** (slug del título + sufijo con `noteId` corto ante colisión; fallback `Sin-titulo-<id>`).
- **(c)** Ante un `noteId` **dangling** (no resuelve a una nota exportada), **degradar a texto plano** o marcar `[[Título (roto)]]`, en vez de emitir un wikilink falso.
- **(d)** Elegir **UNA sola fuente de verdad** para los links del export (la colección `links/` por-ID **o** los nodos del `content`) — mezclarlas duplica o desincroniza. Los explicit están en ambos lados.

---

## Formato(s) — opciones con trade-offs (no se decide acá)

| Formato                          | Cómo representa los links                                                                | A favor                                                                                                                                | En contra                                                                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Markdown** (un `.md` por nota) | Wikilinks `[[Título]]` (sintaxis nativa Obsidian/Logseq/Foam), título **fresh-resolved** | "Formato de uso común" real (cumple §14 + Ley 1581), interoperable, legible por humanos; el importador reconstruye el grafo por título | Grafo por **título** (no ID) → ambigüedad por duplicados/stale/dangling (ver arriba). **No existe serializador TipTap-JSON→Markdown en el repo** (código nuevo completo)               |
| **JSON** (estructurado por-ID)   | Referencias por `noteId` exacto + `content` TipTap verbatim + docs de `links/`           | Preserva el **grafo exacto por ID** (cero ambigüedad), `content` sin serialización lossy, conserva `context`/`linkType`                | **No es "de uso común"** para un humano ni interoperable (Obsidian no entiende `noteId` de SecondMind); IDs opacos sin mapa                                                            |
| **Texto plano** (`contentPlain`) | Pierde los wikilinks (quedan como texto)                                                 | **Trivial**: `contentPlain` ya está en RAM (TinyBase), cero deps, cero parsing                                                         | **Lossy**: pierde TODO el formato (marks de progressive summarization L1/L2/L3, tablas, headings, code blocks) y los wikilinks → probablemente **insuficiente** para "uso común" legal |

> **Guardrail anti-scope-creep:** el JSON puede elegirse por **fidelidad del grafo**, **NO** se justifica con "round-trip / reimportable / backup". Import y backup están **fuera de alcance** — usar ese dato como característica, nunca como objetivo.

---

## Generación y entrega — client vs server (no se decide acá)

**Hechos del repo (verificados):**

- **Sin precedente de descarga client-side:** cero `new Blob` / `URL.createObjectURL` / `<a download>` / FileSaver en `src/` (el único hit, `useAutoUpdate.ts:58`, es el updater de Tauri, no datos del usuario). Todo el plumbing de descarga es **nuevo**.
- **Sin lib de zip** en deps (raíz, `src/functions`, landing). Un export multi-archivo (`.zip`) requiere **agregar dependencia** (`jszip` isomórfico ~94KB, o `archiver`/`yazl` solo-Node server-side). Un export de **un solo archivo** no la necesita.
- **Storage NO está configurado** (verificado en `firebase.json`: hay `firestore`/`functions`/`hosting`/`emulators`, **ningún bloque `storage`**, sin `storage.rules`). Todo proyecto Firebase tiene un bucket default, pero usarlo = **infra nueva** (bucket + rules + signed URL).
- **Moldes server-side reusables:** callable v2 (`saveApiKey.ts:27-92`, `embedQuery.ts:30-104` — `onCall` + `requireVerified` + `assertAllowlisted` + `sanitizeError` + `maxInstances`/`timeoutSeconds` explícitos) · iteración paginada **para leer** (`deleteUserEmbeddings.ts:14-32`, loop `coll.limit(BATCH_LIMIT).get()`, shape directo: cambiar `batch.delete` por acumular `doc.data()`) · recorrido completo (`deleteAccount.ts:69`). El Admin SDK bypassa rules.

| Enfoque         | Viabilidad                                                                                                                                                                                                                                     | A favor                                                                                                                          | En contra                                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client-side** | **PARCIAL.** Metadata + `contentPlain` ya en RAM (export trivial para ese subconjunto). El `content` rico exige `getDocs(collection notes)` (1 query, N reads facturados — patrón extrapolado de `embeddings.ts:29`, no existe hoy para notes) | Cero infra nueva; sin timeout de CF; privacidad (datos no salen a compute extra); descarga estándar **testeable en Playwright**  | Sin precedente de Blob/download; `.zip` → agregar `jszip` al bundle; **riesgo cross-plataforma en Tauri/Android** (origin nativo, sistema de descargas no estándar); dependiente del estado de sync de TinyBase                                                                                |
| **Server-side** | **COMPLETA.** Admin SDK trae `doc.data()` con `content` verbatim sin fan-out; molde de recorrido ya existe                                                                                                                                     | Acceso total y autoritativo; reusa moldes probados; un solo round-trip; independiente del sync del cliente; zip fuera del bundle | Infra nueva (CF + deploy server-side con review→merge→deploy per SDD); **timeout 540s** en corpus grande; **devolver binario:** un callable retorna JSON → `.zip` grande probablemente exige **Storage + signed URL** (no configurado) o base64 con **cota de payload (~10MB, sin verificar)** |

**Granularidad de la entrega** (acoplada al formato): **un archivo único** (JSON monolítico / NDJSON — cero dep de zip) **vs. zip con un `.md` por nota** (formato canónico Obsidian/Logseq, pero exige `jszip` + nombres de archivo únicos). Regla emergente: **Markdown ⇒ zip-multiarchivo · JSON ⇒ archivo-único.**

---

## Decisiones ABIERTAS (para cerrar en Claude web + Sebastián)

> **Orden recomendado: cerrar D2 (formato) PRIMERO** — D4 (client/server) y D5 (granularidad) se acoplan a él. Las recomendaciones son **a validar**, no cerradas.

| #      | Decisión                                                          | Opciones                                                                                                                                                               | Recomendación (a validar)                                                                                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1** | **Qué se exporta:** ¿solo notas, o todo el Contenido?             | A) Solo notas + wikilinks · B) **Todo** (7 entidades reales) · C) Notas + selector                                                                                     | **B.** §14 y Ley 1581 dicen "su Contenido", no "sus notas". Las otras 6 entidades son metadata plana ya en TinyBase → costo incremental bajo sobre solo-notas, y evita un segundo SPEC. Excluir derivados.                                                                           |
| **D2** | **Formato:** ¿Markdown, JSON, ambos o texto plano?                | A) Solo Markdown (frontmatter YAML) · B) Solo JSON (por-ID, verbatim) · C) Ambos (MD + JSON sidecar) · D) Texto plano                                                  | **A** como entregable principal (único que cumple el espíritu "uso común + interoperable"), asumiendo el serializador nuevo. Considerar **C** solo por fidelidad del grafo (sin venderlo como backup). Descartar **D** (lossy de más para un derecho legal).                         |
| **D3** | **Representación de wikilinks** en Markdown                       | A) `[[Título]]` **fresh-resolved** por `noteId` · B) `[[Título]]` con `attrs.noteTitle` (stale) · C) degradar dangling a texto plano · D) link MD estándar `[T](f.md)` | **A + C.** Resolver el título fresco (no `attrs.noteTitle`, que está congelado — verificado), nombres de archivo únicos, y degradar dangling. Único camino a un grafo Markdown sano.                                                                                                 |
| **D4** | **Generación:** ¿client-side o server-side?                       | A) Client (Blob + anchor) · B) Server (CF callable + Admin SDK)                                                                                                        | **Depende de D2 + cota de payload (sin verificar).** Un solo archivo moderado → **A** (cero infra, privacidad, testeable). Zip de corpus grande → **B**. **No cerrar sin verificar** el límite real del callable y que Storage sea usable (hoy **no está configurado**).             |
| **D5** | **Granularidad:** ¿un archivo, o zip un-`.md`-por-nota?           | A) Un solo archivo · B) Zip (un `.md` por nota + un archivo por entidad) · C) Zip con carpetas PARA                                                                    | **Acoplada a D2:** MD ⇒ **B** (formato que Obsidian/Logseq esperan, asumiendo `jszip`); JSON ⇒ **A** (cero dep). Resolver D2 primero.                                                                                                                                                |
| **D6** | **Estados a incluir:** ¿activos, archivados, papelera, dismissed? | A) Solo activos · B) Activos + archivados, **sin** papelera/dismissed · C) Todo (incl. soft-deleted y dismissed)                                                       | **B** (configurable/documentado). Lo archivado es Contenido vivo; lo que el usuario mandó a papelera/descartó expresa intención de eliminación e incluirlo confunde. Si el objetivo es legal-maximalista (Ley 1581), ofrecer **C**. Filtrar `deletedAt>0` es trivial (ya en el Row). |

---

## Gaps a verificar ANTES de cerrar las decisiones (en Claude web)

1. **⚑ Límite real de payload del callable v2 + bucket de Storage** (gatea D4 server-side). El límite de respuesta de `onCall` v2 (¿~10MB? ¿32MB de Cloud Run?) **no está verificado** contra docs de Firebase (usar context7). Storage **no está en `firebase.json`** (confirmado) → usar el bucket default = infra nueva (bucket + rules + signed URL). **Sin esto, D4 server-side queda sin piso.**
2. **⚑ Shape de `tagId`/`areaId` en prod** (gatea usabilidad del export). Señal fuerte de que `tagIds` son labels legibles y `areaIds` son keys de las 6 hardcoded; **confirmar contra un doc real** (Firebase MCP read-only) antes de prometer cobertura legible.
3. **¿Existen links `ai-suggested` en prod hoy?** `linksRepo` escribe `accepted:true`/`linkType:'explicit'` por defecto → el filtro "solo explicit" puede ser **teórico** (no hay AI-suggested generados aún). Confirmar si la decisión de filtrado es urgente o académica.
4. **Catálogos de labels** — el plan debe definir **anexar** los mappings key→label (hábitos, áreas, enums) o el export es ininteligible (gap de usabilidad, ver arriba).
5. **Inbox `dismissed`** — decidir si entra al export (capturas que el usuario descartó); ligado a D6.

---

## Archivos que tocaría (tentativo; depende de las decisiones)

> Inventario preliminar — el plan afina según D2/D4/D5.

**Si client-side (D4=A):**

- Nuevo `src/lib/export/` — serializador TipTap-JSON→Markdown (**código nuevo, no existe**) + builder del export + lógica de descarga (Blob + anchor). Resolver wikilinks fresh (D3).
- Nuevo hook `useExportContent` (orquesta lectura de TinyBase + `getDocs(collection notes)` para el `content` rico).
- Nueva sección/botón en **Settings** (`src/app/settings/page.tsx` + nuevo `src/components/settings/ExportSection.tsx`).
- Posibles deps nuevas: serializador MD (`@tiptap/static-renderer` o walker custom) + `jszip` (si D5=B).
- i18n `es`/`en`.

**Si server-side (D4=B):**

- Nueva CF callable `exportContent` (`src/functions/src/account/` o nuevo `src/functions/src/export/`) — reusa `requireVerified` + `assertAllowlisted` + `sanitizeError` + iteración paginada (molde `deleteUserEmbeddings.ts:22-30`) + `timeoutSeconds`/`maxInstances` altos (molde `deleteAccount.ts:140-146`).
- `src/functions/src/index.ts` — export nuevo.
- Posible **infra de Storage nueva** (bucket + `storage.rules` + signed URL) si el `.zip` excede la cota del payload del callable.
- Cliente: invocación + descarga del archivo/URL devuelto.

**Rules:** probablemente sin cambios (lectura owner-only ya cubierta; server-side bypassa). **Docs al cerrar:** `Spec/ESTADO-ACTUAL.md`, gotchas.

---

## Riesgos / cabos

- **Serializador TipTap-JSON→Markdown = código nuevo no trivial** — debe cubrir marks de progressive summarization (L1/L2/L3), tablas (TableKit F62), headings, code blocks (lowlight), y los **wikilinks como nodos** (no marks). No hay nada reusable en el repo.
- **Stale-title / dangling de wikilinks** (verificado) — mitigación = fresh-resolve + degradar dangling (D3).
- **Storage no configurado** (verificado) — server-side + zip grande = infra nueva, no "solo una CF más".
- **Cota de payload del callable sin verificar** — bloquea cerrar D4 server-side.
- **Gap de usabilidad** — keys opacas necesitan catálogos de labels anexados.
- **Cross-plataforma** — la descarga (`<a download>`) puede comportarse distinto en Tauri/Android (origin nativo); validar si D4=client.
- **QA:** el export es **read-only sobre datos** → bajo riesgo. Preferir emulador (harness SPEC-55) con un corpus sintético rico (notas con wikilinks/tablas/distill, papelera, archivados, dangling). Si se valida con el corpus real del usuario, es solo lectura — sin escrituras que revertir.
- **No confundir con backup/import** — una sola dirección; vigilar que el plan no deslice persistencia server-side del archivo.

---

## Checklist (estado)

- [x] Objetivo acotado al §14 articulado.
- [x] Inventario del Contenido exportable con archivo:línea (7 entidades reales + exclusiones).
- [x] Hallazgos críticos: `content` fuera de TinyBase (#1) · `areas`/`tags` no existen como colecciones (#2).
- [x] **Análisis de wikilinks** (el punto clave): representación actual + riesgo identidad-vs-presentación + mitigación.
- [x] Formatos planteados con trade-offs (sin decidir).
- [x] Client vs server planteado con hechos del repo verificados (Storage no configurado, sin precedente de download, moldes reusables).
- [x] **Decisiones ABIERTAS D1–D6** con opciones, trade-offs y recomendación a validar.
- [x] Gaps a verificar antes de cerrar listados.
- [x] Archivos que tocaría (tentativo).
- [ ] **Verificar gaps** (payload callable, Storage usable, shape `tagId`/`areaId`, links ai-suggested en prod).
- [ ] **GO/NO-GO de las decisiones D1–D6 en Claude web.**
- [ ] **Plan refinado (SDD step 2)** tras el GO.
- [ ] Implementación (rama `feat/export-de-contenido`).
