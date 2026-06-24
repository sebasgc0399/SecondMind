# SPEC — Feature 67: Export de contenido del usuario

> **Estado:** **GO PARCIAL** (Claude web + Sebastián). **5 de 6 decisiones CERRADAS** — D1, D2, D3, D5, D6 (abajo). **D4 (client vs server) ABIERTA** con **recomendación fundamentada + gaps verificados** — se cierra con Sebastián y de ahí sale el plan (SDD step 2). **NO implementado.**
>
> **Por qué existe:** prerrequisito de **publicación del ToS**. El ToS (en revisión legal) afirma en **§14** que «el Servicio le permite exportar su Contenido en un formato de uso común». Hoy **eso NO existe**. Conecta también con el **derecho de portabilidad de la Ley 1581** (Colombia). Es el segundo prerrequisito del ToS que falta implementar (el toggle de búsqueda semántica de SPEC-66 ya está mergeado).
>
> **Alcance (YAGNI duro — es lo que el SPEC debe blindar):** el feature **EXPORTA** — el usuario obtiene una **copia descargable** de su Contenido. **UNA sola dirección.** **NO** es sincronización, **NO** es backup automático, **NO** es import, **NO** es migración bidireccional, **NO** es export programado/periódico, **NO** persiste el archivo del lado servidor. Si el plan empieza a proponer cualquiera de esas, está **fuera de alcance** — frenarlo. (La idea del export JSON por-ID quedó diferida a [`Spec/drafts/DRAFT-export-json-sidecar.md`](../drafts/DRAFT-export-json-sidecar.md), gateada por un eventual import/backup.)

---

## Objetivo

Hacer verdad al **§14**: dar al usuario una vía para **obtener una copia de su Contenido** en un formato de uso común. Ni más. Mientras no exista, el §14 del ToS es una promesa incumplida y bloquea la publicación.

---

## Qué es "el Contenido del usuario" (inventario contra el modelo de datos REAL)

> **Fuente de verdad = los 7 stores/repos cliente reales, NO la tabla de entidades de CLAUDE.md ni `Docs/01`** (ver Hallazgo crítico #2). Lo que sigue está mapeado contra el código con archivo:línea.

### Entidades EXPORTABLES (Contenido del usuario per ToS §5) — 7 (D1=B)

| Entidad                    | Path Firestore                           | Tipo (archivo:línea)                   | Qué es Contenido del usuario                                                                                                      | Dónde vive el dato                                                                                             |
| -------------------------- | ---------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **note / notes**           | `users/{uid}/notes/{noteId}`             | `src/types/note.ts:3`                  | `title`, `content` (TipTap JSON), `contentPlain`, `source`, `summaryL3` (resumen del usuario), `paraType`, `noteType`, `tagIds`   | **PARTIDO (crítico #1):** metadata + `contentPlain` en TinyBase; `content` **solo en Firestore**               |
| **task / tasks**           | `users/{uid}/tasks/{taskId}`             | `src/types/task.ts:3`                  | `name`, `description`, `status`, `priority`, `dueDate`, vínculos (`projectId`/`areaId`/`objectiveId`/`noteIds`)                   | TinyBase (`tasksStore`), doc liviano espejo del Row                                                            |
| **project / projects**     | `users/{uid}/projects/{projectId}`       | `src/types/project.ts:3`               | `name`, `status`, `priority`, fechas, vínculos (`taskIds`/`noteIds`/`areaId`/`objectiveId`)                                       | TinyBase (`projectsStore`)                                                                                     |
| **objective / objectives** | `users/{uid}/objectives/{objectiveId}`   | `src/types/objective.ts:3`             | `name`, `status`, `deadline`, vínculos (`projectIds`/`taskIds`/`areaId`)                                                          | TinyBase (`objectivesStore`)                                                                                   |
| **habit / habits**         | `users/{uid}/habits/{YYYY-MM-DD}`        | `src/types/habit.ts:24` (`HabitEntry`) | Los **registros diarios** (14 booleanos + `progress` + `date`). **NO** el catálogo de los 14 hábitos (hardcoded `habit.ts:5-22`)  | TinyBase (`habitsStore`), un doc por día                                                                       |
| **inboxItem / inbox**      | `users/{uid}/inbox/{itemId}`             | `src/types/inbox.ts:31`                | **`rawContent`** (captura cruda del usuario), `source`, `sourceUrl`. Los `aiResult`/`aiSuggested*` son **derivados** (excluibles) | TinyBase (`inboxStore`); el `rawContent` + flags AI aplanados en el Row (`repoRows.ts:107-122`)                |
| **noteLink / links**       | `users/{uid}/links/{sourceId__targetId}` | `src/types/link.ts:3`                  | **SOLO `linkType==='explicit'`** (wikilinks que el usuario escribió). `context` si lo escribió. **Condicionado** (ver abajo)      | TinyBase (`linksStore`), doc liviano; la verdad también está embebida en el `content` TipTap de la nota origen |

### EXCLUIDO (no es Contenido del usuario) — D1=B excluye derivados

- **`embeddings`** (`users/{uid}/embeddings/{noteId}`, `Docs/01:320-331`) — **derivado**: vector 1536-dim generado por OpenAI, reconstruible desde las notas. Server-side only (sin store/repo cliente). **No exportar.**
- **`settings/preferences`** (`src/types/preferences.ts:1`), **`settings/aiKeys`** (`src/types/apiKey.ts:6`, `last4` de un secreto de terceros), **`settings/semanticSearch`** (`src/types/semanticConsent.ts:7`, evidencia de consentimiento §7.1) — **config/consentimiento**, no Contenido. (El `locale` de `preferences` SÍ lo lee el export para resolver labels — ver Gap de usabilidad —, pero no se exporta como Contenido.)
- **`userSecrets/{uid}/keys/{provider}`** — secreto BYOK cifrado AES-256-GCM (`Docs/01:121`), deny-all client-side. **Jamás se exporta.**
- **Campos AI/FSRS dentro de docs que SÍ se exportan:** `aiTags`, `aiSummary`, `aiProcessed`, `suggestedNoteType`, `noteTypeConfidence`, `fsrsState/Due/LastReview`, `viewCount`, `lastViewedAt` (`note.ts:19-34`), y `aiResult`/`aiSuggested*` de inbox — derivados por Claude Haiku / heurística / algoritmo, no escritura del usuario. **Distinción fina (D1):** `summaryL3` **SÍ** es del usuario (resumen propio, `note.ts:17`); `aiSummary` **NO**.
- **Links `ai-suggested` no aceptados** (`linkType==='ai-suggested' && accepted===false`) — sugerencias de la AI que el usuario nunca confirmó. (Cabo: en prod `linksRepo` escribe `accepted:true`/`linkType:'explicit'` por defecto → el filtro puede ser **teórico** hoy; igual se implementa por corrección. Confirmación empírica pendiente de Firebase MCP.)
- **Infra/sistema:** `config/app`, `allowlist/{email}`, `accessRequests/`, `rateLimits/` — kill-switch, gate de acceso, rate limiting.

### Dos hallazgos críticos del research

**#1 — El `content` de una nota NO vive en TinyBase.** El dato pesado (`content`, TipTap JSON serializado) vive **solo en el documento Firestore**, fuera del schema de TinyBase a propósito (`src/stores/notesStore.ts:5-7` comentario explícito · `src/infra/repos/notesRepo.ts:115-139` lo escribe con `setDoc(merge:true)` · `Docs/01:131`). TinyBase tiene la metadata + `contentPlain` (texto plano). **Implicancia dura:** exportar el contenido REAL de las notas requiere **leer Firestore** (no alcanza con TinyBase). El único lector cliente hoy es `useNote.ts:81-82` (`getDoc`, **una** nota a la vez, one-shot). No existe ningún fetch masivo del `content` de notas en el cliente (un export client-side haría `getDocs(collection notes)` — 1 query, N reads).

**#2 — Las colecciones `areas/` y `tags/` NO existen.** La tabla de Entidades de CLAUDE.md y `Docs/01:113,115` las listan como `users/{uid}/areas/` y `users/{uid}/tags/`, pero **no hay `areasStore`/`tagsStore`/`areasRepo`/`tagsRepo` ni un solo write** (grep vacío). Son **documentación aspiracional desactualizada.** En la realidad: **areas = 6 keys hardcoded** (`src/types/area.ts:4-11` → `proyectos`, `conocimiento`, `finanzas`, `salud`, `pareja`, `habitos`; label vía `buildAreaLabels`); **tags = inline** (`tagIds: string[]` en cada nota, `note.ts:13`, serializados como JSON-string en TinyBase). Se exportan **implícitamente como IDs dentro de cada entidad**, no como colecciones propias. **El set de colecciones a exportar son los 7 stores/repos reales, NO la lista de `Docs/01`.**

### Gap de USABILIDAD (verificado — Gap 3) — define un requisito del export

Verificado desde código (Firebase MCP no conectado esta sesión; confirmación empírica contra prod **pendiente**, pero la confianza estructural es altísima):

- **`tagIds` = labels legibles**, NO UUIDs. No hay colección/tipo de tags ni capa de resolución ID→label; el valor almacenado **ES** el display. La AI los emite como strings libres (`schemas.ts:83-88`) y el usuario como input comma-split (`AiSuggestionCard.tsx:50-54`), ambos verbatim a `tagIds` (`notesRepo.ts:183`). **El nombre `tagIds` es un misnomer: son labels.** → **NO necesitan catálogo.**
- **`areaId`, `paraType`, `noteType`, `priority`, las 14 keys de hábitos, `projectStatus`/`objectiveStatus`/`taskStatus` = keys OPACAS Y LOCALE-DEPENDIENTES.** El label legible **NO se persiste** — se resuelve en render vía i18n `t()` (`buildAreaLabels`/`buildHabitLabels`/`buildParaTypeLabels`). → **El export DEBE anexar los catálogos key→label en el locale del usuario**, o el archivo es ininteligible. **Consecuencia para D4:** el cliente tiene el i18n `t()` cargado y reusa los `build*Labels(t)` directo; un export server-side **no** tiene el `t()` del cliente y tendría que **replicar cada catálogo + leer el `locale`** del usuario de `settings/preferences`. (Ver D4.)

---

## El punto arquitectónico clave: wikilinks / backlinks

> El corazón del producto. Un export que pierda la estructura de links es texto plano sin el grafo. **Este es el hallazgo que definió el formato (D2/D3).**

### Cómo están representados HOY (archivo:línea)

- **Nodo TipTap, no mark.** Un wikilink es un `Node` ProseMirror `atom`/`inline` (`src/components/editor/extensions/wikilink.ts:27-98`). En el JSON aparece como `{ type: 'wikilink', attrs: { noteId, noteTitle } }` (`wikilink-suggestion.ts:81`). **Guarda AMBOS:** `noteId` (la **identidad** real del target) y `noteTitle` (el **texto visible**, capturado al insertar).
- **Colección `links/` derivada.** El cuerpo del editor es la fuente de verdad; la colección `links/` se deriva en **cada guardado** (autosave 2s): `useNoteSave.ts:118-133` → `extractLinks(json)` (`src/lib/editor/extractLinks.ts:12-34`, recorre el JSON y emite los nodos `wikilink`) → `syncLinksFromEditor` (`src/infra/syncLinksFromEditor.ts:108-151`, diff puro) → `linksRepo.syncLinks` (`linksRepo.ts:46-68`). ID compuesto determinístico `buildLinkId = sourceId__targetId` (`linksRepo.ts:18-20`). El doc también denormaliza `outgoingLinkIds`/`incomingLinkIds` dentro de cada nota (`note.ts:14-15`).
- **`linkedBy: ID.`** El target se identifica por **`noteId`**, no por título.
- **Backlinks = consulta inversa reactiva** sobre TinyBase en memoria (`useBacklinks.ts:16-38`), **NO** una query a Firestore. Resuelve el `sourceTitle` **fresh-first** (prioriza `notesTable[sourceId].title`, siempre al día; cae al denormalizado solo si la nota no está hidratada — `useBacklinks.ts:26-28`). **Esta frescura se PIERDE en un export estático** → hay que replicarla (D3).

### El riesgo central: identidad (`noteId`) vs. presentación (`título`)

La identidad real es el `noteId` (opaco, autogenerado). El Markdown `[[Título]]` se basa en el **título**. De ese desacople salen **tres fallas concretas** (todas verificadas en código), que D3 mitiga:

1. **STALE TITLE** — `attrs.noteTitle` se **congela al insertar y NUNCA se refresca en rename**. **Confirmado:** grep de `updateWikilink|refreshTitle|onNoteRename|propagat` en `src/` = **cero matches**. Exportar usando `attrs.noteTitle` puede emitir `[[Título Viejo]]` que ya no matchea ningún archivo.
2. **AMBIGÜEDAD / COLISIÓN** — títulos duplicados o "Sin título" hacen el matching por nombre de archivo (en Obsidian/Logseq) ambiguo o fallido.
3. **DANGLING** — `onNoteDeleted` (hard delete) limpia `links/` pero **NO reescribe los nodos wikilink en el `content` de otras notas** (`onNoteDeleted.ts:13-17`). Quedan wikilinks colgados a notas inexistentes. (El soft-delete **no** dispara `onNoteDeleted`, deja `links/` vivos → el export puede tener wikilinks a notas en papelera; D6 excluye la papelera del export.)

---

## Decisiones CERRADAS (GO — Claude web + Sebastián)

| #      | Decisión cerrada                                                                                                                                                                                                                                                                                                                                                                                              | Razón                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1** | **B — exportar TODO el Contenido** (las 7 entidades reales). **Excluir** los derivados (embeddings, campos AI/FSRS, `aiSummary`, links `ai-suggested` no aceptados). Se exporta lo que el usuario **creó**, no lo que el sistema derivó. `summaryL3` SÍ, `aiSummary` NO.                                                                                                                                      | §14 y Ley 1581 dicen "su Contenido", no "sus notas". Las otras 6 entidades son metadata plana ya en TinyBase → costo incremental bajo, y cubre legalmente mejor.                                                                                                                                                                                                                                                                     |
| **D2** | **MARKDOWN SOLO. NO JSON sidecar.**                                                                                                                                                                                                                                                                                                                                                                           | Evaluado sin atajo YAGNI: el JSON por-ID solo agrega valor para **re-importación de alta fidelidad**, que está **fuera de alcance** (el export es una dirección). El Markdown con wikilinks **fresh-resolved** ya preserva el grafo de forma legible e interoperable — que es lo que el §14 pide. Un JSON sería un archivo que nadie consume. → diferido a [`DRAFT-export-json-sidecar.md`](../drafts/DRAFT-export-json-sidecar.md). |
| **D3** | **A + C** — wikilinks `[[Título]]` con título **FRESH-RESOLVED por `noteId`** (no `attrs.noteTitle`, congelado), **nombres de archivo únicos** (slug + sufijo `noteId` corto ante colisión, fallback `Sin-titulo-<id>`), y **degradar los dangling a texto plano marcado**. **UNA sola fuente de verdad** para los links (elegir la colección `links/` por-ID **O** los nodos del `content`, **no mezclar**). | Único camino a un grafo Markdown sano dadas las 3 fallas verificadas (stale/colisión/dangling).                                                                                                                                                                                                                                                                                                                                      |
| **D5** | **Acoplada a D2: Markdown ⇒ ZIP** con **un `.md` por nota** (+ un archivo por las otras entidades). Requiere **`jszip`**. **Anexar los catálogos de labels** (key→label de hábitos, áreas, enums) o el export es ininteligible (Gap de usabilidad).                                                                                                                                                           | Es el formato que Obsidian/Logseq esperan (cada nota = un archivo) y maximiza la portabilidad real.                                                                                                                                                                                                                                                                                                                                  |
| **D6** | **B — exportar activos + archivados, SIN papelera ni dismissed.** Filtro `deletedAt>0` trivial (ya en el Row).                                                                                                                                                                                                                                                                                                | Lo archivado es Contenido vivo; lo que el usuario mandó a papelera/descartó expresa intención de eliminar e incluirlo confunde. **⚖ Cabo legal:** si el abogado en la vuelta legal exige incluir papelera por Ley 1581, es un **cambio de filtro chico** (quitar el `deletedAt>0`), no re-arquitectura.                                                                                                                              |

---

## D4 — ABIERTA: recomendación fundamentada (cerrar con Sebastián)

> Los 4 gaps que gateaban D4 quedaron **verificados** (sección siguiente). Integrados con el alcance, apuntan a un ganador con **una salvedad de validación en device**.

### Recomendación: **generación CLIENT-SIDE, entrega ruteada por plataforma, web como superficie primaria** (mismo molde que `deleteAccount`)

**Razones, en orden de peso:**

1. **Alineación con el ALCANCE (decisivo).** El SPEC prohíbe explícitamente «persistir el archivo del lado servidor». Client-side mantiene el export **efímero dentro de la sesión del usuario** — cero copia server-side, máxima privacidad, encaja limpio con "copia one-way". El server-side robusto (zip → Storage → signed URL) crea **exactamente** esa copia server-side (aunque sea con TTL) que el alcance descarta.
2. **Labels (Gap 3, decisivo).** Todas las keys opacas son **locale-dependientes** y se resuelven SOLO en el cliente vía i18n `t()` (`buildAreaLabels`/`buildHabitLabels`/…). Client-side las reusa directo. Server-side tendría que **duplicar cada catálogo + leer el `locale`** del usuario — duplicación frágil que driftea de la fuente i18n real. (`tagIds` ya son labels → no necesitan catálogo.)
3. **Cross-plataforma (Gap 4) — única debilidad de client-side, resoluble SIN infra server.** Un `<a download>` "universal" es una ilusión: anda en navegadores reales (web), es frágil en Tauri (WebView2 sin handler), casi seguro roto en Android (WebView sin `DownloadListener`, sin `@capacitor/filesystem`). Se resuelve **ruteando la entrega por plataforma** con los routers ya existentes (`isTauri()` en `src/lib/tauri.ts` / `isCapacitor()` en `src/lib/capacitor.ts`):
   - **Web:** `Blob` + `<a download>` (anda nativo en navegadores de verdad).
   - **Tauri/Android:** reusar el **precedente de `deleteAccount`** (`src/lib/account.ts:64-65` abre la web en el **navegador del sistema** vía `@capacitor/browser` `windowName:'_system'`) — la app nativa **rebota** el export a la web corriendo en el navegador del sistema, donde el download client-side anda nativo. **Cero plugins nativos nuevos.** Shape v1 concreto = espejo de `deleteAccount`: export client-side en **web**, Tauri **rebota** (o se difiere), Android **rebota** a la web en Custom Tab.
4. **Payload (Gap 1) — no es blocker.** El zip cabe inline en el callable (32 MB non-streaming, ~24 MB de zip útil; el "10 MB" viejo es 1st gen, no aplica). Pero client-side **ni toca el callable**.

**Costos / validación de la recomendación:**

- El **rebote nativo** exige que el usuario esté autenticado en el navegador del sistema (**fricción de re-login**) — el precedente `deleteAccount` lo acepta para una acción rara.
- La lógica de export (serializador TipTap→MD + `jszip` ~94 KB) va en el bundle → **lazy-load** de la ruta de export para no inflar el bundle principal.
- **⚑ Validación en device** (Tauri Windows + Android físico) del rebote/download — no verificable solo por config (Gap 4 lo marca como `needsDeviceValidation`).

### Alternativa honesta — server-side (CF v2 + Admin SDK → zip → Storage → signed URL → abrir en navegador del sistema)

El agente de cross-plataforma **la prefería** por el patrón signed-URL (resuelve el download con piezas ya probadas en el repo, sin plugins nativos, y sin rebote/re-login). **Gana SI** el producto exige **UX de export 100% in-app en nativo** (sin rebote ni re-login) **y** se acepta el costo: Storage **moderado** + el **gotcha de IAM** (rol `Service Account Token Creator` sobre la default Compute SA para que `getSignedUrl` firme vía `signBlob`) + la **copia server-side efímera** (mitigable con URL corta ~15 min + TTL lifecycle + delete explícito post-descarga). Reusa los moldes server-side probados (iteración paginada `deleteUserEmbeddings.ts:22-30`, callable `saveApiKey`/`embedQuery`) y el Admin SDK lee el `content` verbatim sin fan-out de `getDocs`.

### La pregunta que cierra D4 (para Sebastián)

**¿Es requisito de v1 una UX de export 100% in-app en las apps nativas (sin rebote al navegador del sistema, sin re-login)?**

- **NO** (web-primary aceptable, como `deleteAccount`) → **client-side** (recomendado): cero infra nueva, mejores labels, cero copia server-side, alineado al alcance.
- **SÍ** → **server-side** (CF + Storage + signed URL): asume Storage moderado + IAM + copia efímera, a cambio de UX nativa sin rebote.

---

## Gaps verificados (gateaban D4)

1. **Cota de payload del callable v2 — VERIFICADO.** `onCall` v2 (2nd gen / Cloud Run, `firebase-functions@7`) = **32 MB de respuesta non-streaming** (10 MB solo en streaming, que es opt-in; el repo usa `return` plano → non-streaming). El "**10 MB**" de la literatura vieja es **1st gen, NO aplica**. Con inflación base64 (~33%) → **~24 MB de zip útil** inline ≈ ~80-120 MB de Markdown crudo / decenas de miles de notas — fuera del rango realista de un KB personal de texto. **El zip cabe inline; no fuerza Storage.** Salvedad si server-side: guard que falle limpio (`resource-exhausted`) si el zip supera ~20 MB. _Fuente: `firebase.google.com/docs/functions/quotas` + `docs.cloud.google.com/functions/quotas`._
2. **Storage usable / costo — VERIFICADO: MODERADO.** El bucket default existe (no hay que crearlo) y `firebase-admin@13` ya trae el namespace de Storage (sin nueva dep). Lo que lo eleva a moderado: (a) **cambio de IAM** one-time fuera de `firebase deploy` — rol `Service Account Token Creator` sobre la default Compute SA (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`) para que `getSignedUrl()` firme vía la IAM `signBlob` API (sin esto **falla silencioso en runtime**, no en dev local); (b) **TTL/lifecycle** del bucket (config GCS, tampoco vía `firebase deploy`); (c) `storage.rules` deny-all + bloque en `firebase.json` + nuevo deploy target; (d) **primera vez** que el repo toca Storage (cero precedente/QA/emulador). _Fuente: `docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers`, `firebase.google.com/docs/storage/admin/start`._
3. **Shape de `tagId`/`areaId` — VERIFICADO desde código (empírico pendiente).** `tagIds` = **labels legibles** (no UUIDs; no hay path para que un UUID llegue ahí). `areaIds` = una de las **6 keys hardcoded** de `area.ts`. Los demás enums (paraType/noteType/priority/hábitos/statuses) = keys opacas **locale-dependientes** (i18n `t()` solo en cliente). → tags no necesitan catálogo; el resto **sí** (anexar key→label en el locale del usuario). **Firebase MCP no conectado esta sesión** → confirmación empírica contra prod (uid `gYPP7NIo5JanxIbPqMe6nC3SQfE3`) **pendiente** de que el MCP esté disponible; no bloquea (confianza estructural altísima).
4. **Descarga cross-plataforma — VERIFICADO.** `<a download>` con `Blob`: **web** OK (navegadores reales); **Tauri** frágil/no-verificado (WebView2 sin handler; `tauri-plugin-dialog` instalado pero **falta `tauri-plugin-fs`** para escribir el archivo); **Android** casi seguro **roto** (WebView sin `DownloadListener`, `@capacitor/filesystem` **ausente**). Patrón robusto sin plugins nativos = **abrir en el navegador del sistema** (`@capacitor/browser` `_system`, **ya usado** en `account.ts`; Tauri `shell.open` con allowlist a ampliar). **Requiere validación en device.**

---

## Archivos que tocaría (tentativo — el plan afina tras cerrar D4)

> Inventario preliminar. **Si D4 = client-side (recomendado):**

- Nuevo `src/lib/export/` — **serializador TipTap-JSON→Markdown** (**código nuevo, no existe en el repo** — debe cubrir marks de progressive summarization L1/L2/L3, tablas TableKit, code blocks lowlight, y wikilinks como nodos) + builder del ZIP (`jszip`) + resolución fresh de wikilinks (D3) + anexado de catálogos de labels (`build*Labels(t)`).
- Nuevo hook `useExportContent` — orquesta lectura de TinyBase (metadata + `contentPlain`) + `getDocs(collection notes)` para el `content` rico (crítico #1).
- Entrega ruteada por plataforma reusando `isTauri()`/`isCapacitor()` + el patrón `@capacitor/browser` `_system` de `account.ts` (rebote nativo).
- Nueva sección/botón en **Settings** (`src/app/settings/page.tsx` + nuevo `src/components/settings/ExportSection.tsx`); **lazy-load** de la ruta de export.
- Deps nuevas: serializador MD (`@tiptap/static-renderer` o walker custom) + `jszip`.
- i18n `es`/`en`.

> **Si D4 = server-side:** nueva CF callable `exportContent` (`src/functions/src/export/`, reusa `requireVerified`/`assertAllowlisted`/`sanitizeError` + iteración paginada `deleteUserEmbeddings.ts:22-30` + `timeoutSeconds`/`maxInstances` altos) · `src/functions/src/index.ts` · **infra Storage** (bucket default + `storage.rules` deny-all + bloque `firebase.json` + IAM `signBlob` + TTL) · replicar catálogos de labels + leer `locale` server-side · cliente abre la signed URL en el navegador del sistema.

**Rules:** sin cambios (lectura owner-only ya cubierta; server-side bypassa). **Docs al cerrar:** `Spec/ESTADO-ACTUAL.md`, gotchas (candidato fuerte: el `signBlob`/IAM de `getSignedUrl` en CF v2 si se va server-side).

---

## Riesgos / cabos

- **Serializador TipTap-JSON→Markdown = código nuevo no trivial** (el trabajo real, independiente de D4) — marks de progressive summarization (L1/L2/L3), tablas (TableKit F62), code blocks (lowlight), wikilinks como **nodos** (no marks). Nada reusable en el repo.
- **Cross-plataforma (D4)** — la descarga es client-side en cualquier escenario; el rebote al navegador del sistema (recomendación) **requiere validación en device** (Tauri Windows + Android físico) + re-login en el navegador del sistema.
- **Gap de usabilidad** — keys opacas **locale-dependientes** necesitan catálogos de labels anexados; client-side los tiene gratis (i18n `t()`), server-side los duplica.
- **⚖ Cabo legal D6** — si el abogado exige incluir papelera por Ley 1581, es un cambio de filtro chico.
- **Cabo (no blocker)** — links `ai-suggested` pueden no existir en prod hoy (`linksRepo` escribe `accepted:true`/`explicit`); el filtro "solo explicit" se implementa igual por corrección. Confirmación empírica pendiente de Firebase MCP.
- **No confundir con backup/import** — una sola dirección; vigilar que el plan no deslice persistencia server-side del archivo. El JSON sidecar quedó **parkeado** en `Spec/drafts/DRAFT-export-json-sidecar.md`.
- **QA:** el export es **read-only sobre datos** → bajo riesgo. Preferir emulador (harness SPEC-55) con un corpus sintético rico (notas con wikilinks/tablas/distill, papelera, archivados, dangling, títulos duplicados). Si se valida con el corpus real del usuario, es solo lectura.

---

## Checklist (estado)

- [x] Objetivo acotado al §14 articulado.
- [x] Inventario del Contenido exportable con archivo:línea (7 entidades reales + exclusiones).
- [x] Hallazgos críticos: `content` fuera de TinyBase (#1) · `areas`/`tags` no existen como colecciones (#2).
- [x] **Análisis de wikilinks** (el punto clave): representación actual + riesgo identidad-vs-presentación + mitigación.
- [x] **Decisiones D1, D2, D3, D5, D6 CERRADAS** (GO Claude web + Sebastián).
- [x] **Gaps que gateaban D4 verificados** (payload 32 MB · Storage moderado+IAM · shapes desde código · cross-plataforma) con fuentes.
- [x] **D4 con recomendación fundamentada** (client-side, web-primary, rebote nativo) + alternativa server-side + la pregunta que la cierra.
- [ ] **Cerrar D4 con Sebastián** (¿UX in-app nativa requisito de v1?).
- [ ] (Opcional) Confirmación empírica de `tagId`/`areaId` + links `ai-suggested` vía Firebase MCP cuando esté disponible.
- [ ] **Plan refinado (SDD step 2)** tras cerrar D4.
- [ ] Implementación (rama `feat/export-de-contenido`).
