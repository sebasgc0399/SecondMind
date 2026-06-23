# SPEC — Feature 66: Toggle de búsqueda semántica con reconocimiento afirmativo

> **Estado:** GO recibido (Claude web + Sebastián). **Decisiones D1–D6 CERRADAS** (abajo). En **Plan mode (SDD step 2)**. El plan refinado vuelve a **Claude web para GO/NO-GO antes de codear** (mismo flujo que SPEC-65 F2). NO implementado.
> **Por qué existe:** prerrequisito de **publicación del ToS**. El ToS (en revisión legal) afirma en **§7.1** que la búsqueda semántica requiere un **reconocimiento afirmativo** del usuario antes de transmitir su texto a OpenAI por primera vez, y que puede desactivarla cuando quiera. Hoy eso NO existe: el embedding se genera automático para todo usuario allowlisted. Este toggle hace que §7.1 sea verdad.
> **Decisión de producto (Sebastián):** punto medio — **encendida con reconocimiento afirmativo al primer uso** (NO opt-in puro ni opt-out puro). El usuario ve el aviso en el momento relevante, lo reconoce, y la búsqueda semántica queda activa hasta que la apague desde settings.
> **Fuera de alcance:** el reemplazo por embeddings locales on-device (proyecto aparte, parkeado — `Spec/drafts/DRAFT-embeddings-locales-on-device.md`). Este SPEC **mantiene OpenAI `text-embedding-3-small` (1536d)**; solo gatea su uso detrás del consentimiento. No mezclar las decisiones de dimensión/threshold de ese proyecto con este.

---

## Invariante legal (NO negociable — es lo que el SPEC debe blindar)

> La búsqueda semántica arranca **INERTE**: **NO se genera ni un embedding, NO sale ni un carácter de texto a OpenAI**, hasta que el usuario cruza un **reconocimiento afirmativo** (ve el aviso de datos sensibles y lo acepta explícitamente). Si el embedding corre en background **antes** del reconocimiento, el consentimiento llega tarde y **no sirve legalmente**.

**Consecuencia técnica dura:** el gate NO puede ser solo un `if` en el cliente. El egreso A1 es un **trigger de Firestore** (`generateEmbedding`) que corre **server-side con Admin SDK** sin importar lo que diga la UI. El invariante exige un **gate server-side** en ambos puntos de egreso. **El orden de implementación lo obliga: F2 (gate del trigger) primero y verificable solo, antes de cualquier UI.**

---

## Objetivo

Dar al usuario control sobre la búsqueda semántica, con el invariante de arriba como piso. El usuario decide (con conocimiento) si su texto se transmite a OpenAI para habilitar búsqueda por significado; mientras no lo decida, la app funciona con **búsqueda keyword local (Orama)**, que ya es independiente y degrada limpio.

---

## Mapa del pipeline actual (evidencia archivo:línea)

**Dos puntos de egreso de texto a OpenAI** (el "inventario de datos" de §7.1):

| #      | Punto                                                                                     | Qué lo dispara                                                                                                                            | Qué lo gatea HOY                                                                                                                              | Qué manda                                                         |
| ------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **A1** | `generateEmbedding` (trigger) — `src/functions/src/embeddings/generateEmbedding.ts:13-21` | `onDocumentWritten` sobre `users/{uid}/notes/{noteId}` — **cada vez que se escribe/edita una nota**                                       | `contentPlain` no vacío (`:29-31`) + `contentHash` distinto del anterior (`:50-54`). **NINGÚN consentimiento** — automático para todo usuario | `contentPlain` completo (`:61`) → `text-embedding-3-small`        |
| **A2** | `embedQuery` (callable) — `src/functions/src/search/embedQuery.ts:29-98`                  | `httpsCallable('embedQuery')` desde el cliente vía `embedQueryText()` (`src/lib/embeddings.ts:81-84`), llamado en `useHybridSearch.ts:70` | `requireVerified` (`:40`) → `assertAllowlisted` (`:44`) → rate-limit 60/min·1000/día (`:73`). **NINGÚN consentimiento**                       | `text` de la query (≤300 chars, `:56`) → `text-embedding-3-small` |

**Ruta única de generación:** SOLO el trigger A1 genera embeddings de notas. **No existe backfill, seed, batch ni cron** (`src/functions/src/index.ts:9`). → habilitar a un usuario con notas pre-existentes requiere un **backfill nuevo (F6)**.

**Consumo + degradación:**

- `useHybridSearch.ts:42-116`: en el `catch` (`:92-96`) setea `semanticResults=[]` silencioso, sin propagar error. La búsqueda **keyword (Orama, `useNoteSearch`) es independiente** (`:4,44`) y sigue funcionando. → **inerte ≠ roto.**
- `SemanticSection` (`src/app/notes/page.tsx:333-383`): renderiza solo con `hasQuery`; con `results=[]` no muestra nada. **Acá va el prompt "Activar búsqueda semántica"** (banner ~`:278`).
- `useSimilarNotes.ts:27-84`: sin embedding de la nota actual → `noEmbedding=true`, lista vacía.

**Dónde viven las preferencias:** `users/{uid}/settings/preferences` (`src/lib/preferences.ts:44`), doc Firestore **server-readable**, con `parsePrefs` defensivo + semántica **purge-on-schema-mismatch** (`:70-73`). Otro doc de settings: `users/{uid}/settings/aiKeys` (BYOK F48, suscripción module-cache análoga). **No existe ningún patrón de consentimiento persistido en el repo** — greenfield. Precedente de modal one-shot: `WelcomeModal.tsx` (F49, base-ui Dialog, `autoOpenedRef` + flag persistido).

---

## Decisiones CERRADAS (GO — Claude web + Sebastián)

| #      | Decisión cerrada                                                                                                                                                                 | Razón                                                                                                                                                                                                  |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **D1** | **Doc DEDICADO** `users/{uid}/settings/semanticSearch` (NO en `settings/preferences`). `enabled` + `acknowledgedAt` **ambos** en el doc dedicado.                                | Aislar el `acknowledgedAt` de la semántica **purge-on-schema-mismatch** de `parsePrefs` — un timestamp de consentimiento legal **no puede borrarse** por un bump de prefs de UI.                       |
| **D2** | **Gate server-side:** `generateEmbedding` lee el flag del doc dedicado y hace `return` temprano si `enabled !== true`. **Ausente→false** (sin doc, no hay egreso).               | Blinda el invariante de raíz. Helper `readSemanticConsent.ts` (mirror de `assertAllowlisted`). El cliente puede escribir su propio flag → el server **RE-LEE y verifica**, nunca confía en el cliente. |
| **D3** | **M-C (re-consent purgando):** usuarios existentes con embeddings pre-toggle arrancan `enabled=false` + sus embeddings se **PURGAN**; al re-reconocer, el backfill los regenera. | Postura legal más limpia (no hay embeddings sin consentimiento fresco). Población chica (beta cerrada, ~1 usuario real) → migración barata. **⚖ Pendiente de confirmación legal.**                     |
| **D4** | **D-B (borrar al desactivar):** apagar la búsqueda semántica dispara **bulk-delete** de `users/{uid}/embeddings/*`. Re-enable exige backfill.                                    | Coherente con "apago para no exponer" (los embeddings son **invertibles**, no anónimos). **⚖ Pendiente de confirmación legal.**                                                                        |
| **D5** | **Reconocimiento en el PRIMER USO de la búsqueda semántica** (no en el primer guardado de nota) + entrada alternativa desde el toggle de settings.                               | El aviso aparece "en el momento relevante" de §7.1; menos ruidoso que golpear a todo usuario nuevo de entrada.                                                                                         |
| **D6** | **Re-activar NO requiere re-reconocer** si ya existe `acknowledgedAt`; el modal solo en el **primer cruce**.                                                                     | Ya reconoció una vez; el toggle alcanza para re-activar.                                                                                                                                               |

> **⚖ Notas legales para el plan:** **D3 y D4 quedan "pendiente de confirmación legal"** — el abogado las valida en la próxima vuelta (tocan derechos del titular). No bloquea el plan, pero se anota: el plan construye la infra (helpers backfill + bulk-delete) de forma que el _comportamiento_ (purgar vs conservar) sea un punto de decisión acotado, fácil de ajustar si legal pide otra cosa.

**Implicación de alcance (M-C + D-B convergen):** ambas decisiones requieren **DOS piezas de infra nuevas que hoy NO existen**, y son las **dos caras de la misma moneda** → construirlas **una vez, como helpers reusables**, que sirven a D3 **y** D4:

1. **Backfill** — generar embeddings de notas existentes **post-consentimiento**, idempotente vía `contentHash`, en chunks (patrón de batching de `deleteAccount.ts:92-101`). Sirve a: enable inicial (F6), re-enable (D4/D6), re-consent (D3-M-C).
2. **Bulk-delete de embeddings por usuario** — borrar `users/{uid}/embeddings/*` en chunks. Sirve a: desactivar (D4-D-B) **y** la purga de la migración (D3-M-C).

---

## Modelo de datos (D1 cerrada)

Doc dedicado **`users/{uid}/settings/semanticSearch`**:

- `enabled: boolean` — estado actual on/off. **Ausente→false** = inerte. Solo pasa a `true` cruzando el reconocimiento (o re-activando con `acknowledgedAt` ya seteado).
- `acknowledgedAt: number | null` — **registro de auditoría** del reconocimiento (timestamp). Default `null`. Se setea **una vez** (primer cruce) y persiste aunque luego se desactive (D6).

El **gate de egreso** (server) chequea `enabled === true`. `acknowledgedAt` es la evidencia legal. Doc dedicado → **inmune al purge-on-schema-mismatch** de `parsePrefs` (módulo propio, sin `_schemaVersion` de prefs).

---

## Sub-features (F1–F9)

### F1 — Doc dedicado de consentimiento (D1)

- **Qué:** módulo nuevo `src/lib/semanticConsent.ts` que lee/escribe `users/{uid}/settings/semanticSearch` (`{ enabled, acknowledgedAt }`), con suscripción `onSnapshot` + cache module-level + dedup (mismo patrón que `preferences.ts:101` / `subscribeApiKeys`).
- **Criterio de done:** ausente→`{enabled:false, acknowledgedAt:null}`; `markAcknowledged()` setea ambos atómicamente; `setEnabled(false)` apaga sin tocar `acknowledgedAt`.
- **Archivos:** nuevo `src/lib/semanticConsent.ts`, nuevo `src/types/semanticConsent.ts` (o inline), tests nuevos. **No** toca `preferences.ts`/`PREFERENCES_SCHEMA_VERSION`.

### F2 — Gate server-side en `generateEmbedding` (EL INVARIANTE — primero) (D2)

- **Qué:** el trigger NO genera embedding si `enabled !== true`. Server-side, autoritativo.
- **Criterio de done:** con `enabled=false`/doc ausente, una escritura de nota **no produce ninguna llamada a OpenAI** (verificable: logs + ausencia de `embeddings/{noteId}`). Con `enabled=true`, genera normal.
- **Cómo:** helper `src/functions/src/lib/readSemanticConsent.ts` (mirror de `assertAllowlisted.ts:15` / `getUserAnthropicKey.ts:11`, Admin SDK `.get()`, ausente→false). Gate **al inicio** de `generateEmbedding` (antes del check de `contentPlain`), `return` temprano.
- **Verificación aislada:** esta F se prueba **sola** (sin UI) — escribir nota con doc ausente/`enabled:false` ⇒ cero embeddings. Es el gate del invariante.
- **Archivos:** `src/functions/src/embeddings/generateEmbedding.ts`, nuevo `src/functions/src/lib/readSemanticConsent.ts`.

### F3 — Gate en `embedQuery` + gating cliente (defensa en profundidad)

- **Qué:** la query no se embebe sin consentimiento, en server (autoritativo) y cliente (UX).
- **Criterio de done:** `embedQuery` con `enabled!==true` lanza `permission-denied` (`semantic-search-disabled`); el cliente degrada a keyword y NO llama a `embedQuery` cuando `enabled=false`.
- **Cómo:** server — assert tras `assertAllowlisted` (`embedQuery.ts:44`) reusando `readSemanticConsent`. Cliente — `useHybridSearch.ts` no dispara `embedQueryText` si `enabled=false` (vía hook `useSemanticConsent`); `useSimilarNotes.ts` idem.
- **Archivos:** `src/functions/src/search/embedQuery.ts`, `src/hooks/useHybridSearch.ts`, `src/hooks/useSimilarNotes.ts`, nuevo hook `useSemanticConsent`.

### F6 — Helper de BACKFILL (reusable; D3 + D6 + enable) **[infra nueva]**

- **Qué:** CF callable `backfillEmbeddings` que itera `users/{uid}/notes` con `contentPlain`, genera embedding y escribe en chunks. Idempotente (`contentHash`: no regenera lo que ya está). Corre **solo post-reconocimiento** (`enabled===true` re-verificado server-side).
- **Criterio de done:** tras habilitar (primer ack o re-enable), las notas existentes quedan con embedding y la búsqueda semántica las encuentra.
- **Cómo:** patrón de batching/chunk de `deleteAccount.ts:92-101`; reusa la creación de embedding del trigger (factorizar la lógica OpenAI común si conviene). Region/secret/maxInstances como las CFs existentes.
- **Archivos:** nuevo `src/functions/src/embeddings/backfillEmbeddings.ts`, `src/functions/src/index.ts`. **Costo:** N llamadas OpenAI al habilitar (proporcional a las notas).

### F7 — Helper de BULK-DELETE de embeddings (reusable; D4 + D3-purga) **[infra nueva]**

- **Qué:** borrar `users/{uid}/embeddings/*` del usuario, en chunks (≤500/batch). Idempotente.
- **Criterio de done:** invocable desde (a) desactivar (D4-D-B) y (b) la purga de migración (D3-M-C); deja `embeddings/` vacío; **invalida también la cache en memoria** (`invalidateEmbeddingsCache`, `embeddings.ts:69`).
- **Cómo:** patrón de `onNoteDeleted.ts:33` (delete por doc) + chunking de `deleteAccount.ts:92-101`. Decidir en el plan: CF callable vs trigger sobre el cambio de `enabled`. **El comportamiento (cuándo purgar) queda acotado para ajustar si legal cambia D3/D4.**
- **Archivos:** nuevo `src/functions/src/embeddings/deleteUserEmbeddings.ts` (o similar), `src/functions/src/index.ts`.

### F4 — Reconocimiento afirmativo (modal de primer uso + surfacing) (D5)

- **Qué:** el aviso de datos sensibles + aceptación explícita, en el **primer uso de la búsqueda semántica**.
- **Criterio de done:** con `enabled=false`, al usar búsqueda semántica el usuario ve un **prompt** ("Activar búsqueda semántica") y, al activarlo, un **modal** con el aviso §7.1. Solo al aceptar se persiste `enabled=true` + `acknowledgedAt` (→ dispara backfill F6). Cerrar/cancelar deja todo inerte.
- **⚠ Copy PROVISIONAL:** el texto del aviso queda como **placeholder claro** — el copy final se **ata al texto legal de §7.1 del ToS** (en revisión). NO fijarlo en este plan.
- **Cómo:** modal estilo `WelcomeModal.tsx` (base-ui Dialog, overlays globales en `layout.tsx`). Surfacing en `SemanticSection` (`page.tsx:333-383`, banner ~`:278`). Entrada alternativa: el toggle de settings (F5).
- **Archivos:** nuevo `src/components/search/SemanticConsentModal.tsx`, `src/app/notes/page.tsx`, hook `useSemanticConsent`, i18n `es`/`en` (con strings placeholder marcadas).

### F5 — Toggle en settings (D6)

- **Qué:** control persistente activar/desactivar.
- **Criterio de done:** sección en settings que refleja el estado. **Encender** sin `acknowledgedAt` ⇒ abre el modal de F4; **encender** con `acknowledgedAt` ya seteado ⇒ activa directo (D6) + backfill. **Apagar** ⇒ `enabled=false` + dispara bulk-delete (F7, D4-D-B).
- **Archivos:** nuevo `src/components/settings/SemanticSearchSection.tsx` (patrón `LanguageSelector.tsx`), `src/app/settings/page.tsx` (sección tras Language, `:48`).

### F8 — Migración de usuarios existentes (D3-M-C) **[pendiente confirmación legal]**

- **Qué:** one-time, para usuarios con embeddings pre-toggle: setear `enabled=false` (doc dedicado ausente ya da eso) + **purgar** sus `embeddings/*` (helper F7). Al re-reconocer, backfill (F6).
- **Criterio de done:** ningún usuario queda con embeddings sin `acknowledgedAt`. Población chica → script/CF one-time bajo el protocolo de QA.
- **Cómo:** decidir en el plan (script Admin SDK one-time vs CF). Reusa F7.
- **Archivos:** script/CF de migración one-time (reusa `deleteUserEmbeddings`).

### F9 — QA

- **Criterio de done:** verificar el invariante de raíz — con `enabled=false`/doc ausente, escribir una nota **NO** crea `embeddings/{noteId}` (server-side, emulador/Firebase MCP); `embedQuery` rechaza; búsqueda da keyword. Tras reconocer: backfill puebla, semántica funciona. Apagar: bulk-delete + cache invalidada. Re-enable sin re-ack (D6). Edge: race de desactivación, doble-click del modal, doc parcial. **Preferir emulador** (harness SPEC-55) por el peso legal; prod solo bajo protocolo CLAUDE.md step 5.

---

## Archivos que tocaría (inventario; el plan afina)

**Backend (Cloud Functions):**

- `src/functions/src/embeddings/generateEmbedding.ts` — gate server-side (F2).
- `src/functions/src/search/embedQuery.ts` — assert consentimiento (F3).
- nuevo `src/functions/src/lib/readSemanticConsent.ts` — helper lectura (mirror `assertAllowlisted.ts`).
- nuevo `src/functions/src/embeddings/backfillEmbeddings.ts` — backfill reusable (F6).
- nuevo `src/functions/src/embeddings/deleteUserEmbeddings.ts` — bulk-delete reusable (F7).
- migración one-time (F8, reusa F7).
- `src/functions/src/index.ts` — exports nuevos.

**Modelo de datos:**

- nuevo `src/lib/semanticConsent.ts` (+ tipo + tests) — doc dedicado `settings/semanticSearch` (D1). **No** toca `preferences.ts`.

**Cliente:**

- `src/hooks/useHybridSearch.ts`, `src/hooks/useSimilarNotes.ts` — gating cliente (F3).
- nuevo hook `useSemanticConsent`.
- nuevo `src/components/search/SemanticConsentModal.tsx` (F4, copy placeholder).
- nuevo `src/components/settings/SemanticSearchSection.tsx` (F5).
- `src/app/notes/page.tsx` (banner + montaje modal), `src/app/settings/page.tsx` (sección).
- i18n `es`/`en` (strings de aviso marcadas como placeholder).

**Rules:** sin cambios (el doc dedicado cae bajo el catch-all `users/**`; gate server-side autoritativo). **Docs al cerrar:** `Spec/ESTADO-ACTUAL.md`, gotchas.

---

## Orden de implementación (post-GO del plan — el invariante manda)

1. **F1** doc dedicado de consentimiento.
2. **F2** gate del trigger — **el invariante primero, verificable solo** (sin UI).
3. **F3** gate de `embedQuery` + gating cliente.
4. **F6 + F7** helpers reusables (backfill + bulk-delete) — base de D3/D4/D6.
5. **F4** modal + surfacing (copy placeholder).
6. **F5** toggle de settings.
7. **F8** migración one-time (D3-M-C) — tras confirmación legal.
8. **F9** QA (emulador, foco en el invariante server-side).

## Riesgos / cabos

- **⚖ D3 y D4 pendientes de confirmación legal** — la infra (F6/F7) se construye con el comportamiento (purgar/borrar) acotado para ajustar sin re-arquitecturar.
- **Copy del aviso (F4) = placeholder** hasta el texto final de §7.1.
- **Costo OpenAI del backfill** proporcional a las notas del usuario al habilitar.
- **Dimensionar la población live (`embeddings/` del usuario real)** quedó pendiente — Firebase MCP no conectado; chequeo rápido para Claude web.
- **No confundir con embeddings locales** — este SPEC mantiene OpenAI 1536d.

## Checklist (estado)

- [x] Invariante legal articulado.
- [x] Pipeline actual mapeado con archivo:línea.
- [x] **Decisiones D1–D6 cerradas (GO).**
- [x] Archivos a tocar inventariados.
- [ ] **Plan refinado (SDD step 2)** → este paso (Explore/Plan agents).
- [ ] **GO/NO-GO del plan en Claude web** antes de codear.
- [ ] Implementación (rama `feat/toggle-busqueda-semantica`).
