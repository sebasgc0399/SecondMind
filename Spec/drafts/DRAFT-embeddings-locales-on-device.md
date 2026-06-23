# DRAFT — Embeddings locales on-device (reemplazo de OpenAI)

> **Estado:** Investigación + spike de medición real **completados** (2026-06-23). **Decisión:** se difiere como **proyecto de producto aparte** — NO bloquea la beta. El motivo legal quedó **redimensionado** (OpenAI no es ilegal per se; ver §5). **Gate para retomar:** POC en un **Galaxy S23 físico** antes de comprometer la migración.
>
> Este draft es la **referencia** para ese proyecto futuro. Captura los números medidos, las restricciones verificadas y la recomendación. NO es un SPEC ni código. El prototipo del spike vivió fuera del repo (`_spike-emb`, ya borrado); su metodología quedó en el Apéndice para reproducir el POC.
>
> Detalle vivo en engram `architecture/local-embeddings` + memoria nativa `project-local-embeddings-spike`.

## 1. Motivo (redimensionado)

Hoy `generateEmbedding` (trigger) manda el `contentPlain` **completo** de cada nota y `embedQuery` (callable) el texto de cada búsqueda a OpenAI `text-embedding-3-small` (1536d), bajo la **key del operador** (no BYOK), automáticamente, para todo usuario. Dos motivaciones:

1. **Privacidad / Ley 1581** — que el texto nunca salga del dispositivo. **Redimensionado:** el flujo a OpenAI es jurídicamente una _transmisión a encargado_, y EE.UU. está en la lista de adecuación de la SIC → el status quo **no es violación clara** (ver §5). El cierre de ToS + toggle cubre la beta. Local sigue valiendo, pero por minimización/automaticidad, no por ilegalidad.
2. **Costo/operación** — dependencia de la key de Sebastián. Bajo hoy, pero real.

## 2. Arquitectura actual (anclada al repo)

| Pieza                                               | Qué hace                                                                                                                                                                                     | Qué sale del device           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `src/functions/src/embeddings/generateEmbedding.ts` | trigger `onDocumentWritten` sobre `notes/{noteId}`; SHA-256 de `contentPlain` evita re-embeddear; OpenAI 1536d → `users/{uid}/embeddings/{noteId}` `{vector, model, contentHash, createdAt}` | **texto completo de la nota** |
| `src/functions/src/search/embedQuery.ts`            | callable; query ≤300 chars; verified + allowlisted + rate-limit + maxInstances 5                                                                                                             | **texto de la query**         |
| `src/lib/embeddings.ts`                             | `cosineSimilarity` (dimension-agnostic), `fetchAllEmbeddings`, cache en memoria                                                                                                              | nada (ya local)               |
| `src/hooks/useHybridSearch.ts`                      | keyword (Orama) + semántico: `embedQueryText` → coseno client-side; `SEMANTIC_THRESHOLD = 0.3`                                                                                               | nada                          |
| `src/hooks/useSimilarNotes.ts`                      | coseno contra cache; `SIMILARITY_THRESHOLD = 0.5`                                                                                                                                            | nada                          |

**Clave:** el scoring **ya es client-side**. Lo único que viaja es **texto** (nota + query) hacia OpenAI. Para que "el texto nunca salga" hay que mover **las dos** generaciones de embedding al cliente.

## 3. Spike — números medidos (Chrome real + Node, no benchmarks ajenos)

### 3a. Calidad en español (set etiquetado: 22 notas + 12 queries con vocabulario distinto al de las notas → test semántico puro)

| Modelo                       | dims | tamaño q8 | R@5      | MRR      | nDCG@5   |
| ---------------------------- | ---- | --------- | -------- | -------- | -------- |
| **multilingual-e5-small q8** | 384  | 112 MiB   | **0.93** | **0.90** | **0.88** |
| multilingual-e5-small fp32   | 384  | 448 MiB   | 0.97     | 0.90     | 0.90     |
| paraphrase-ml-MiniLM-L12 q8  | 384  | 112 MiB   | 0.96     | 0.96     | 0.92     |
| **EmbeddingGemma-300m q4**   | 768  | 188 MiB   | **1.00** | **1.00** | **0.98** |

P@5 (~0.35) es ruido (la mayoría de queries tiene 1-3 relevantes). R@5/MRR/nDCG son las métricas reales: el relevante casi siempre cae en top-5 y el primero suele ser rank 1. **q8 apenas degrada vs fp32.** Cruzado con benchmarks (verificado): OpenAI 3-small es DÉBIL en multilingüe (MIRACL 44.0) vs e5-small es ~51 / avg ~60 → **local iguala o mejora el español**.

### 3b. Latencia en navegador real (Chrome 149, e5-small q8, texto corto)

| Config                                | nota      | query     | Aplica a                            |
| ------------------------------------- | --------- | --------- | ----------------------------------- |
| **WASM 1-thread**                     | **77 ms** | **31 ms** | **🎯 piso S23 / WebView Capacitor** |
| WASM 4-thread (cross-origin isolated) | 46 ms     | 20 ms     | Tauri desktop / PWA-en-Chrome       |
| WebGPU q8                             | 372 ms    | 341 ms    | (malo: int8 corre mal en GPU)       |
| WebGPU fp16                           | 61 ms     | 56 ms     | desktop GPU (pesa 195 MB)           |
| Node nativo (ref.)                    | 17 ms     | 7 ms      | server-side                         |

Throttle CDP real sobre WASM-1t (proxy de devices más débiles): 2× → 170/64 ms, 4× → 375/141 ms, 6× → 687/258 ms.

**WebGPU NO ayuda** acá (overhead de dispatch con modelo chico + input corto; EP WebGPU maneja mal int8). **WASM gana** — universal en todos los WebViews.

### 3c. Tamaño (medido + verificado byte a byte contra HF)

| Modelo                    | dims                 | menor viable                     | external-data       | licencia    |
| ------------------------- | -------------------- | -------------------------------- | ------------------- | ----------- |
| **multilingual-e5-small** | 384                  | **118 MB (int8, archivo único)** | no                  | MIT         |
| paraphrase-ml-MiniLM-L12  | 384                  | 118 MB                           | no                  | Apache      |
| EmbeddingGemma-300m       | 768→256 (matryoshka) | 175 MB (q4f16) / 309 MB (int8)   | **sí (2 archivos)** | Gemma       |
| gte-multilingual-base     | 768                  | 324 MB                           | sí                  | Apache      |
| OpenAI 3-small (hoy)      | 1536                 | N/A (API)                        | —                   | propietaria |

**Hallazgo:** español ⇒ multilingüe ⇒ vocab XLM-R 250k tokens ⇒ esa tabla domina el peso. Por eso e5-small q8 = 118 MB y **q4 NO ayuda** (mide 380 MB — no cuantiza la tabla de embeddings). **Piso real ~118 MB**, descarga única cacheada (Cache API/IndexedDB). En datos móviles es un costo real a gestionar.

## 4. Piso duro: el S23 dentro del WebView (verificado, alta confianza, refutación adversarial fallida)

- **WebGPU: NO** en el Android System WebView (Capacitor). Excluido desde M121, sigue tras flag que una app empaquetada no puede setear. Fuentes: caniuse (v149 no soportado), Intent-to-Ship Chromium, Capacitor #8044 (cerrado "not planned"), razón arquitectónica (WebView sin proceso GPU separado).
- **WASM multi-thread: NO.** Necesita SharedArrayBuffer → `crossOriginIsolated` → imposible en WebView single-process **aun con COOP/COEP** (WhatWG #6060, Intent-to-Ship Document-Isolation-Policy: _"not possible due to lack of process isolation in Android WebView"_).
- **WASM-SIMD single-thread: SÍ** (Chromium 91+, sin headers). **Único backend acelerado en el S23.** Corre en Web Worker (sin SAB, vía postMessage) sin congelar la UI.

**Estimación S23 (no medida en device):** el CPU del spike fue un **i7-7700HQ (2017)**, cuyo single-core es **más débil** que el SD8Gen2 del S23 → 77/31 ms es pesimista en silicio. Con overhead de WebView + throttling térmico, planning realista **~80-170 ms/nota, ~30-65 ms/query** para texto corto/chunked. El **query path (decenas de ms) es usable**; el re-embedding masivo es lo pesado (one-time/background).

Por plataforma: **Tauri desktop** sí puede WebGPU + multi-thread; **PWA en Chrome del S23** sí tiene WebGPU; solo el **APK Capacitor** queda en WASM-1t.

## 5. Encuadre legal (no es asesoría legal)

Verificación adversarial: conclusión central **confirmada**, framing **"partial"**.

- **Cierto:** con cero llamadas a OpenAI, el texto de notas y queries deja de transferirse a EE.UU.
- **Sobre-dramatizado:** el flujo a OpenAI es jurídicamente **transmisión a encargado** (DPA), no transferencia a tercero. Y **EE.UU. sigue en la lista de adecuación de la SIC** (Circular 005/2017, reafirmada por 002/2025) → status quo **no ilegal per se**.
- **Por qué local igual vale:** (1) hoy el texto se transfiere **automáticamente, sin opt-out**; (2) **minimización por diseño**; (3) deja de **depender de una adecuación revocable**; (4) elimina **un 2do encargado extranjero**.
- **Lo que NO resuelve:** el texto y el vector **siguen en Firestore** (Google, EE.UU.). Los vectores **no son anónimos** — los embeddings son **invertibles** (ataques recuperan atributos sensibles 80-99%) → `embeddings/` debe protegerse igual que `notes/` (ya es el caso). Si el objetivo se endurece a "ningún dato sale de Colombia", eso es **otro proyecto** (residencia de datos).

## 6. Arquitecturas (3 opciones, no 2)

| Opción                                                        | Texto sale del device | Resuelve privacidad    | Offline | Esfuerzo          |
| ------------------------------------------------------------- | --------------------- | ---------------------- | ------- | ----------------- |
| **A. Local client-side total** (nota + query en el navegador) | **No**                | **Sí**                 | Sí      | **1.5-3 semanas** |
| B. Híbrido (algo aún va a OpenAI)                             | Sí, por-ruta          | **No** para esas rutas | No      | similar a A       |
| C. Modelo local en la CF (Node, sin OpenAI)                   | **Sí** (al CF)        | **No**                 | No      | **2-4 días**      |

**A es la única que cumple el objetivo.** La eliminación es **binaria por-ruta** (la Ley 1581 mira cada operación). **Regla:** el fallback ante fallo del modelo local debe ser **diferir/encolar** o **degradar a Orama (keyword, ya local)**, NUNCA reenviar a OpenAI. **C** es barata y quita el vendor OpenAI, pero el texto igual sale al CF → no da privacidad ni offline.

## 7. Recomendación

- **Runtime:** Transformers.js v4 (`@huggingface/transformers`) sobre ONNX Runtime Web, **WASM-SIMD single-thread en Web Worker**, con detección de capacidades para usar WebGPU/multi-thread **oportunísticamente** en desktop/PWA.
- **Modelo primario:** **multilingual-e5-small q8** (384d, 118 MB, MIT, archivo único, el ONNX más rodado, ya supera a OpenAI en español). Menor riesgo.
- **A/B de calidad:** **EmbeddingGemma-300m** (q4f16 175 MB, matryoshka 768→256 — reduce 3× el storage de vectores) **solo si el S23 aguanta** (en el spike fue 6× más lento que e5-small → probablemente demasiado para WASM-1t; validar en device).
- **Comodín ultraligero:** Model2Vec/POTION (~30-50 MB, casi instantáneo) como tier para devices muy débiles, a costa de calidad.

## 8. Migración (Opción A, realista 1.5-3 semanas) — touchpoints y gotchas

1. **Threshold roto (el más silencioso):** e5 da cosenos en **0.80-0.90**; `SEMANTIC_THRESHOLD = 0.3` (calibrado para OpenAI) dejaría pasar TODO. Recalibrar ese y `SIMILARITY_THRESHOLD = 0.5` con notas reales.
2. **Cambio de dimensión 1536→384 = corte duro.** Vectores viejos incomparables con nuevos (coseno entre dims distintas da basura sin error). Re-embeber todo el corpus + **guard de dimensión/`model`** en `fetchAllEmbeddings`/cache (hoy el campo `model` se guarda pero nadie lo lee). Volumen real: 1 cuenta de prod → backfill chico.
3. **`embedQuery` desaparece** (+ su rate-limit/allowlist/maxInstances/`OPENAI_API_KEY` para search). `generateEmbedding` o desaparece (cliente escribe `embeddings/` → abrir write en rules) o pasa a generador Node-local (Opción C).
4. **Bundling:** `optimizeDeps.exclude(['@huggingface/transformers'])`, `.wasm` al glob de workbox (hoy `js,css,html,ico,png,svg,woff2` → el SW no precachearía el runtime), `resolve.dedupe` preventivo (dedupe-gotcha latente), `wasm-unsafe-eval` en `script-src` de `tauri.conf.json` (hoy falta).
5. **Carga del modelo (~118 MB):** dynamic import en Web Worker, descarga on-demand, cache atado al **origin invariante** (no tocar `androidScheme`/`useHttpsScheme` o se huérfana el cache — gotcha SPEC-56).
6. **Matriz de 3 plataformas:** web/PWA, Tauri/WebView2, Android/WebView — soporte distinto en cada una.

## 9. Gate para retomar

**POC en S23 físico** (lo único no medido): e5-small q8 WASM-1t en el WebView real → latencia/recall/calor sobre notas reales. Es el gate antes de comprometer la migración. Opcional: head-to-head directo OpenAI vs e5-small sobre el corpus real (necesita la OpenAI key del proyecto); los benchmarks + spike ya apuntan a local ≥ OpenAI en español.

---

## Apéndice — set de prueba y metodología (referencia para el POC, no es código del repo)

**Harness del spike** (en `_spike-emb`, fuera del repo, borrado): Node 24 + `@huggingface/transformers` v4.2.0 (onnxruntime-node nativo) para calidad+latencia baseline; Chrome real vía Playwright para latencia WASM/WebGPU; CDP `Emulation.setCPUThrottlingRate` para throttling; server local con `COEP: credentialless` para habilitar `crossOriginIsolated` y medir multi-thread. Modelos e5 requieren prefijos `query:` / `passage:`; pooling mean + normalize. Métricas: P@5, R@5, MRR, nDCG@5 sobre ground-truth juzgado a mano.

**Set etiquetado** (22 notas en español estilo Zettelkasten/PARA + 12 queries con vocabulario deliberadamente distinto al de las notas):

Notas (id → tema): n01 Claude/mito IA · n02 redes neuronales · n03 embeddings/búsqueda semántica · n04 contraseñas/gestores · n05 phishing/ingeniería social · n06 cifrado e2e · n07 método PARA · n08 Zettelkasten · n09 Pomodoro/foco · n10 fondo de emergencia · n11 interés compuesto · n12 diversificar cartera · n13 masa madre · n14 sofrito · n15 entrenamiento de fuerza · n16 sueño/recuperación · n17 estoicismo · n18 hábitos atómicos · n19 Firestore offline · n20 React render · n21 privacidad de datos · n22 café de especialidad.

Queries → relevantes (ground-truth): "cómo funcionan los modelos de lenguaje" → n01,n02 · "encontrar apuntes parecidos por significado" → n03 · "proteger mis cuentas de los hackers" → n04,n05,n06 · "organizar mi conocimiento personal" → n07,n08 · "concentrarme mejor y rendir más" → n09,n18 · "hacer crecer mis ahorros a largo plazo" → n11,n12,n10 · "qué hago si pierdo mi trabajo" → n10 · "recetas y técnicas de cocina" → n13,n14,n22 · "mejorar mi salud física" → n15,n16 · "manejar la ansiedad con filosofía" → n17 · "guardar datos en una app que funcione sin internet" → n19 · "evitar mandar información privada al extranjero" → n21.

Para el POC en S23: reconstruir este set (o uno con notas reales de la cuenta) y medir e5-small q8 WASM-1t dentro del WebView de Capacitor, comparando latencia/recall contra estos números de referencia desktop.
