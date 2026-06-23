# SPEC — Feature 66: Toggle de búsqueda semántica con reconocimiento afirmativo (BORRADOR)

> **Estado:** BORRADOR — pendiente **GO/NO-GO en Claude web** antes del plan (mismo flujo que SPEC-65 F2). NO implementado. Esta sesión fue research + redacción.
> **Por qué existe:** prerrequisito de **publicación del ToS**. El ToS (en revisión legal) afirma en **§7.1** que la búsqueda semántica requiere un **reconocimiento afirmativo** del usuario antes de transmitir su texto a OpenAI por primera vez, y que puede desactivarla cuando quiera. Hoy eso NO existe: el embedding se genera automático para todo usuario allowlisted. Este toggle hace que §7.1 sea verdad.
> **Decisión de producto ya tomada (Sebastián):** punto medio — **encendida con reconocimiento afirmativo al primer uso** (NO opt-in puro ni opt-out puro). El usuario ve el aviso en el momento relevante, lo reconoce, y la búsqueda semántica queda activa hasta que la apague desde settings.
> **Fuera de alcance:** el reemplazo por embeddings locales on-device (proyecto aparte, parkeado — `Spec/drafts/DRAFT-embeddings-locales-on-device.md`). Este SPEC **mantiene OpenAI `text-embedding-3-small` (1536d)**; solo gatea su uso detrás del consentimiento. No mezclar las decisiones de dimensión/threshold de ese proyecto con este.

---

## Invariante legal (NO negociable — es lo que el SPEC debe blindar)

> La búsqueda semántica arranca **INERTE**: **NO se genera ni un embedding, NO sale ni un carácter de texto a OpenAI**, hasta que el usuario cruza un **reconocimiento afirmativo** (ve el aviso de datos sensibles y lo acepta explícitamente). Si el embedding corre en background **antes** del reconocimiento, el consentimiento llega tarde y **no sirve legalmente**.

**Consecuencia técnica dura:** el gate NO puede ser solo un `if` en el cliente. El egreso A1 es un **trigger de Firestore** (`generateEmbedding`) que corre **server-side con Admin SDK** sin importar lo que diga la UI. El invariante exige un **gate server-side** en ambos puntos de egreso.

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

**Ruta única de generación:** SOLO el trigger A1 genera embeddings de notas. **No existe backfill, seed, batch ni cron** (verificado en `src/functions/src/index.ts:9` — solo `generateEmbedding` y `embedQuery` exportados de este dominio). → **Implicación clave: habilitar a un usuario con notas pre-existentes requiere construir un backfill que hoy no existe (F6).**

**Consumo + degradación:**

- `useHybridSearch.ts:42-116`: en el `catch` (`:92-96`) setea `semanticResults=[]` silencioso, sin propagar error. La búsqueda **keyword (Orama, `useNoteSearch`) es independiente** (`:4,44`) y sigue funcionando. → **inerte ≠ roto: sin embeddings, la búsqueda sigue dando resultados keyword.**
- `SemanticSection` (`src/app/notes/page.tsx:333-383`): renderiza solo con `hasQuery`; con `results=[]` no muestra nada. Icono `Sparkles`. **Acá iría el prompt "Activar búsqueda semántica"** (banner entre keyword y semantic, ~`:278`).
- `useSimilarNotes.ts:27-84`: sin embedding de la nota actual → `noEmbedding=true`, lista vacía. Sin fallback keyword (esperado).

**Dónde viven las preferencias:** `users/{uid}/settings/preferences` (`src/lib/preferences.ts:44`), doc Firestore **server-readable**. Patrón de campo aditivo consolidado (F46/F49/F58/F59): agregar campo a `parsePrefs` con ausente→default, **sin bumpear `PREFERENCES_SCHEMA_VERSION`** (`:17`). Otros docs de settings: `users/{uid}/settings/aiKeys` (BYOK F48). **No existe ningún patrón de consentimiento persistido en el repo** (ni ToS, ni edad, ni `acknowledgedAt`) — esto es greenfield. Precedente de modal one-shot: `WelcomeModal.tsx` (F49, base-ui Dialog, `autoOpenedRef` + flag persistido).

---

## Modelo de datos propuesto

Dos campos nuevos (nombres tentativos):

- `semanticSearchEnabled: boolean` — estado actual on/off. **Default `false` (ausente→false)** = inerte. Solo pasa a `true` cruzando el reconocimiento.
- `semanticSearchAcknowledgedAt: number | null` — **registro de auditoría** del reconocimiento (timestamp del momento en que el usuario aceptó el aviso). Default `null`.

El **gate de egreso** chequea `semanticSearchEnabled === true`. `acknowledgedAt` es la evidencia legal de que el aviso fue visto y aceptado (no se puede llegar a `enabled=true` sin pasar por el modal que lo setea).

> **⚠ Decisión D1 (abierta):** dónde vive este registro. `settings/preferences` tiene semántica **purge-on-schema-mismatch** (`parsePrefs` → `DEFAULT_PREFERENCES` si `_schemaVersion` no matchea, `preferences.ts:70-73`). Un **timestamp de consentimiento legal no debería poder borrarse** por una futura migración de prefs de UI. Ver Decisiones abiertas.

---

## Sub-features (F1–F9)

### F1 — Modelo de consentimiento (flag + timestamp)

- **Qué:** agregar `semanticSearchEnabled` + `semanticSearchAcknowledgedAt` al modelo de preferencias del usuario (o a un doc dedicado — D1).
- **Criterio de done:** el flag se lee/escribe; default ausente = inerte (`enabled=false`); el `acknowledgedAt` se setea atómicamente con `enabled=true` en el reconocimiento.
- **Archivos:** `src/types/preferences.ts`, `src/lib/preferences.ts` (`parsePrefs`/`DEFAULT_PREFERENCES`, patrón aditivo F58/F59) — **o** nuevo módulo `src/lib/semanticConsent.ts` + doc `users/{uid}/settings/semanticSearch` (D1). Tests en `src/lib/preferences.test.ts` (sentinel anti-bump).

### F2 — Gate server-side en `generateEmbedding` (EL INVARIANTE)

- **Qué:** que el trigger NO genere embedding si el usuario no reconoció. Gate **server-side** (el trigger ignora la UI).
- **Criterio de done:** con `enabled=false` (o ausente), una escritura de nota **no produce ninguna llamada a OpenAI** (verificable en logs + ausencia del doc `embeddings/{noteId}`). Con `enabled=true`, genera normal.
- **Cómo (D2):** ver Decisiones abiertas — Opción 1 (leer `settings/preferences` dentro del trigger, `return` temprano; patrón `getUserAnthropicKey.ts:11`/`assertAllowlisted.ts:15`) vs Opción 2 (flag en la nota, leído de `event.data.after`).
- **Archivos:** `src/functions/src/embeddings/generateEmbedding.ts` (gate al inicio, antes del check de `contentPlain`), nuevo helper `src/functions/src/lib/readSemanticConsent.ts` (mirror de `assertAllowlisted`).

### F3 — Gate en `embedQuery` + gating cliente (defensa en profundidad)

- **Qué:** que la query no se embeba sin consentimiento, en server (autoritativo) y cliente (UX).
- **Criterio de done:** `embedQuery` con `enabled=false` lanza `permission-denied` (`semantic-search-disabled`) y el cliente degrada a keyword. El cliente NO llama a `embedQuery` cuando `enabled=false`.
- **Cómo:** server — assert tras `assertAllowlisted` (`embedQuery.ts:44`), reusando el helper de F2. Cliente — `useHybridSearch.ts` no dispara `embedQueryText` si el flag es false (lee el flag vía `usePreferences`/hook nuevo); `useSimilarNotes.ts` idem.
- **Archivos:** `src/functions/src/search/embedQuery.ts`, `src/hooks/useHybridSearch.ts`, `src/hooks/useSimilarNotes.ts`.

### F4 — Reconocimiento afirmativo (modal de primer uso + surfacing)

- **Qué:** el aviso de datos sensibles + aceptación explícita, en el momento relevante.
- **Criterio de done:** con `enabled=false`, al intentar usar búsqueda semántica el usuario ve un **prompt** ("Activar búsqueda semántica") y, al activarlo, un **modal** con el aviso §7.1 (qué texto se manda, a quién/dónde, que puede desactivar). Solo al aceptar ("Entiendo y activar") se persiste `enabled=true` + `acknowledgedAt`. Cerrar/cancelar deja todo inerte.
- **Cómo:** modal estilo `WelcomeModal.tsx` (base-ui Dialog, montado en overlays globales). Surfacing en `SemanticSection` (`page.tsx:333-383`, banner ~`:278`). Hook `useSemanticSearchConsent`.
- **Archivos:** nuevo `src/components/search/SemanticConsentModal.tsx`, `src/app/notes/page.tsx` (banner + montaje), nuevo hook, i18n (`es`/`en`). El **copy del aviso debe alinearse con el texto final de §7.1 del ToS** (revisión legal).

### F5 — Toggle en settings

- **Qué:** control persistente para activar/desactivar.
- **Criterio de done:** una sección en settings refleja el estado y permite apagar/encender. Encender desde acá (si nunca reconoció) abre el mismo modal de F4. Apagar setea `enabled=false` (efecto de borrado → D4).
- **Archivos:** nuevo `src/components/settings/SemanticSearchSection.tsx` (patrón `LanguageSelector.tsx`), `src/app/settings/page.tsx` (sección nueva tras Language, `:48`).

### F6 — Backfill al habilitar (NO existe hoy)

- **Qué:** al reconocer/habilitar, generar embeddings de las notas **existentes** (que nunca se embebieron por estar inerte).
- **Criterio de done:** tras habilitar, las notas pre-existentes con `contentPlain` quedan con embedding y la búsqueda semántica las encuentra.
- **Cómo (a definir en el plan):** CF callable `backfillEmbeddings(uid)` que itera `users/{uid}/notes`, genera y escribe en chunks (patrón de batching de `deleteAccount.ts:92-101`). Solo corre **post-reconocimiento** (consistente con el invariante: el texto sale recién después del consentimiento). Idempotente (reusar el `contentHash` para no regenerar).
- **Archivos:** nuevo `src/functions/src/embeddings/backfillEmbeddings.ts`, `src/functions/src/index.ts`. **Nota de costo:** un usuario con muchas notas paga N llamadas a OpenAI al habilitar.

### F7 — Migración de usuarios EXISTENTES _(DECISIÓN ABIERTA — no resolver acá)_

- Usuarios que YA tienen embeddings (generados automático antes del toggle) nunca dieron el reconocimiento afirmativo que §7.1 exige. Ver D3.

### F8 — Borrado de embeddings al desactivar _(DECISIÓN ABIERTA — no resolver acá)_

- Al apagar tras haber usado, ¿se borran `users/{uid}/embeddings/*`? Ver D4. Requeriría un mecanismo de bulk-delete por-usuario que **hoy no existe** (solo hay borrado por-nota en `onNoteDeleted.ts:33` y recursivo total en `deleteAccount.ts:69`).

### F9 — QA

- **Criterio de done:** verificar el invariante de raíz — con `enabled=false`, escribir una nota **NO** crea `embeddings/{noteId}` (server-side, Firebase MCP/emulador); `embedQuery` rechaza; la búsqueda da keyword. Tras reconocer: backfill puebla, semántica funciona. Apagar: comportamiento de D4. Golden path + edge (race de desactivación, doble-click del modal, re-enable). Preferir **emulador** (harness SPEC-55) por el peso legal; escrituras a prod solo bajo el protocolo de QA de CLAUDE.md step 5.

---

## Decisiones abiertas (para cerrar con Sebastián en Claude web — el GO/NO-GO sale de acá)

### D1 — Ubicación del registro de consentimiento

- **A) En `settings/preferences`** (campo aditivo, patrón F58/F59). ✓ Simple, server-readable, cero infra nueva. ✗ Sujeto a `purge-on-schema-mismatch` de `parsePrefs`: un futuro bump de `PREFERENCES_SCHEMA_VERSION` **borraría el consentimiento legal**. Mitigado por la regla "nunca bumpear para aditivos", pero deja un campo legal rehén de esa disciplina.
- **B) Doc dedicado** `users/{uid}/settings/semanticSearch` (o `settings/consent`). ✓ Aislado de la semántica de purga; registro de auditoría más limpio; el `acknowledgedAt` no se puede borrar por una migración de prefs de UI. ✗ Módulo + read path nuevos (cliente y server).
- _Recomendación tentativa:_ **B** por el peso legal del `acknowledgedAt`; el `enabled` podría ir en preferences y el `acknowledgedAt` en el doc dedicado, o ambos en el dedicado.

### D2 — Cómo gatear el trigger server-side

- **Opción 1 — el trigger lee `settings/preferences` (o el doc de D1) y hace `return` temprano.** ✓ Autoritativo y centralizado (una sola fuente de verdad del consentimiento); patrón conocido (`getUserAnthropicKey`/`assertAllowlisted`); `parsePrefs` reusable. ✗ +1 read Firestore por nota editada (~$0.06/mes a escala beta — imperceptible); race chica al **desactivar** (nota editada en los ~100ms de propagación se embebe una vez más). **El invariante crítico — no embeber ANTES del primer consentimiento — se cumple robusto** porque ausente→false.
- **Opción 2 — flag `_semanticSearchConsent` en cada doc de nota, leído de `event.data.after`.** ✓ Cero reads extra; atómico con el contenido (sin race). ✗ Ensucia el schema de nota; **el consentimiento autoritativo se duplica por-nota** y depende de que el cliente lo escriba bien — más frágil para un invariante legal.
- _Recomendación tentativa:_ **Opción 1** (autoridad server-side centralizada). La race de desactivación es secundaria (el usuario ya había consentido); el invariante de "no embeber antes del primer consentimiento" queda blindado.
- **Rules:** sin cambios. El cliente puede escribir `enabled:true` en su propio doc (regla `users/**`, `firestore.rules:4-20`), por eso el server **vuelve a leer y verifica** — nunca confía en el cliente. Bloquear la escritura client-side rompería la UX de prefs; el gate server-side es obligatorio igual.

### D3 — Usuarios existentes con embeddings pre-toggle _(peso legal)_

- **M-A "Grandfather":** marcar `enabled=true` + `acknowledgedAt=<fecha migración>`, conservar embeddings. ✗ **NO es un reconocimiento afirmativo** — choca con la letra de §7.1. Probablemente inaceptable dado el invariante.
- **M-B "Re-consent, embeddings dormidos":** `enabled=false`; los embeddings existentes **quedan** en Firestore pero la búsqueda no los usa hasta re-reconocer; al re-reconocer se reusan (sin backfill). ✗ Vectores (dato personal, invertible) persisten sin consentimiento actual — aunque se generaron bajo el ToS previo (no es transferencia nueva).
- **M-C "Re-consent, purgar hasta consentir":** `enabled=false` + **borrar** los embeddings existentes; al re-reconocer, backfill. ✓ Postura legal más limpia (no hay embeddings sin consentimiento fresco). ✗ Re-incurre costo OpenAI + el usuario pierde semántica hasta re-reconocer.
- _No resolver acá._ Población real = beta cerrada (~1 usuario prod `gYPP7…` + allowlist) → la migración es sobre un set chico, ejecutable en cualquier dirección. **(Dimensionar el conteo exacto de `embeddings/` quedó pendiente: Firebase MCP no estaba conectado esta sesión.)**

### D4 — Borrado de embeddings al DESACTIVAR _(peso legal)_

- **D-A "Conservar":** apagar solo frena la generación futura + bloquea el uso en búsqueda; los embeddings quedan. ✗ Incoherente con "apago para dejar de exponer mis datos" (vectores invertibles). ✓ Re-enable instantáneo (sin backfill).
- **D-B "Borrar":** apagar dispara bulk-delete de `users/{uid}/embeddings/*`. ✓ Coherente legalmente. ✗ Re-enable exige backfill (costo + latencia); necesita un mecanismo de bulk-delete que **hoy no existe**.
- **D-C "Híbrido":** preguntar al desactivar ("¿borrar también los datos generados?") o purgar tras X días.
- _No resolver acá._

### D5 — Punto de surfacing del primer reconocimiento

- **Primer uso de la búsqueda semántica** (recomendado — el aviso aparece "en el momento relevante" de §7.1) vs **primer guardado de nota** (más ruidoso, golpea a todo usuario nuevo de entrada). Tentativa: primer uso de búsqueda + entrada alternativa desde el toggle de settings.

### D6 — ¿Re-enable requiere re-reconocer?

- Si ya hay `acknowledgedAt`, ¿re-activar tras desactivar requiere ver el modal de nuevo, o basta el toggle? Tentativa: con `acknowledgedAt` ya seteado, el toggle alcanza (ya reconoció una vez); el modal solo en el primer cruce.

---

## Archivos que tocaría (inventario; el plan post-GO afina)

**Backend (Cloud Functions):**

- `src/functions/src/embeddings/generateEmbedding.ts` — gate server-side (F2).
- `src/functions/src/search/embedQuery.ts` — assert consentimiento (F3).
- nuevo `src/functions/src/lib/readSemanticConsent.ts` — helper de lectura (mirror `assertAllowlisted.ts`).
- nuevo `src/functions/src/embeddings/backfillEmbeddings.ts` — backfill al habilitar (F6).
- _(según D4/D3)_ nuevo bulk-delete de embeddings por usuario.
- `src/functions/src/index.ts` — exports nuevos.

**Modelo de datos:**

- `src/types/preferences.ts` + `src/lib/preferences.ts` (+ `preferences.test.ts`) — campos aditivos; **o** nuevo `src/lib/semanticConsent.ts` + doc dedicado (D1).

**Cliente:**

- `src/hooks/useHybridSearch.ts`, `src/hooks/useSimilarNotes.ts` — gating cliente (F3).
- nuevo hook `useSemanticSearchConsent` (o extender `usePreferences`).
- nuevo `src/components/search/SemanticConsentModal.tsx` (F4).
- nuevo `src/components/settings/SemanticSearchSection.tsx` (F5).
- `src/app/notes/page.tsx` (banner + montaje modal, F4), `src/app/settings/page.tsx` (sección, F5).
- i18n `es`/`en` para modal + settings.

**Rules:** sin cambios (gate server-side autoritativo). **Docs al cerrar:** `Spec/ESTADO-ACTUAL.md`, gotchas si aplica.

---

## Orden de implementación tentativo (post-GO, lo afina el plan)

1. F1 modelo de consentimiento (+ D1 resuelta).
2. F2 gate del trigger (+ D2) — **el invariante primero**, verificable solo.
3. F3 gate de `embedQuery` + gating cliente.
4. F6 backfill al habilitar.
5. F4 modal de reconocimiento + surfacing.
6. F5 toggle de settings.
7. F7/F8 según D3/D4.
8. F9 QA (emulador, foco en el invariante server-side).

## Riesgos / cabos

- **Copy del aviso (F4) atado al texto legal final de §7.1** — coordinar con la revisión legal antes de fijarlo.
- **Backfill (F6) es infra nueva** y tiene costo OpenAI proporcional a las notas del usuario al habilitar.
- **Bulk-delete por usuario no existe** — lo necesitan D4-B y D3-C.
- **Dimensionar la población live (`embeddings/` del usuario real)** quedó pendiente — Firebase MCP no conectado esta sesión; chequeo rápido para Claude web.
- **No confundir con el proyecto de embeddings locales** — este SPEC mantiene OpenAI 1536d; nada de cambio de dimensión/threshold acá.

## Checklist (estado)

- [x] Invariante legal articulado.
- [x] Pipeline actual mapeado con archivo:línea.
- [x] Decisiones abiertas con opciones + trade-offs (D1–D6).
- [x] Archivos a tocar inventariados.
- [ ] **GO/NO-GO en Claude web** (D1–D6) → de ahí sale el plan.
- [ ] Plan refinado (`~/.claude/plans/`) tras el GO.
- [ ] Implementación (rama `feat/toggle-busqueda-semantica`).
