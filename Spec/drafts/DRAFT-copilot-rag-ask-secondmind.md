# DRAFT — Copilot RAG "Ask SecondMind" (IA que conoce TU segundo cerebro)

> **Estado:** **DISCOVERY / brief pre-SPEC.** Nace de una pregunta de Sebastián (2026-06-30): _"¿se puede crear un LLM que viva dentro de SecondMind y se alimente individualmente, uno por usuario, tipo un Hermes entrenado con el conocimiento para que sea muy personalizado?"_. Este draft responde esa curiosidad con una **decisión de arquitectura** y deja la feature lista para escribir el SPEC. NO es un SPEC ni código.
>
> **Tesis central:** la sensación de "un LLM propio entrenado en mi conocimiento" se logra con **RAG** (Retrieval Augmented Generation) sobre los **embeddings que SecondMind YA tiene desplegados** + **Claude Haiku BYOK que YA está integrado** — **sin entrenar ningún modelo, sin GPUs, sin fine-tuning**. El modelo es el motor de razonamiento (compartido); las notas del usuario son la memoria (individual). Separar esas dos cosas es lo que vuelve viable lo que la intuición plantea como imposible.
>
> **Gate para retomar:** decisión de producto de Sebastián de priorizar un copilot conversacional sobre el conocimiento. La infra de retrieval ya existe (ver §3); lo que falta es la capa de generación con contexto + UI de chat. Antes de SPEC: confirmar scope (¿Q&A puntual? ¿chat con memoria? ¿citas obligatorias?) y el encuadre de consentimiento (§6).

## 1. La pregunta y por qué la intuición lleva a la solución cara

"Un LLM por usuario, entrenado con su conocimiento" suena a la máxima personalización. Pero apunta a la arquitectura **más cara, más frágil y peor** para este caso. Hay tres caminos; solo el tercero es viable y, de hecho, **ya está casi montado**.

| Camino | Qué implica | Veredicto para SecondMind |
| --- | --- | --- |
| **A. LLM desde cero por usuario** | Entrenar un modelo de lenguaje desde cero: millones de USD, miles de GPUs, **billones** de tokens de entrenamiento. Un usuario tiene ~cientos de notas (MBs de texto). | ❌ **Imposible.** No es cuestión de esfuerzo: la escala de datos a nivel individual no existe. Produciría texto basura. |
| **B. Fine-tune de un modelo open por usuario** | Tomar un base ya entrenado (Llama/Mistral — _Hermes es esto_, no un modelo desde cero) y ajustarlo con los datos del usuario. | ❌ **Mala idea acá.** Ver §2 — infra de GPU por-usuario, Anthropic no ofrece fine-tuning de Claude, re-entreno con cada nota nueva, y el fine-tune memoriza **mal** los hechos puntuales (es justo lo que necesitamos recuperar). |
| **C. RAG: recuperar + inyectar al prompt** | El conocimiento vive **afuera** del modelo, en el índice de embeddings. En el momento de responder se recuperan las notas relevantes del usuario y se le pasan a Claude como contexto. | ✅ **Esto es lo que querés.** Un solo modelo compartido (Claude Haiku); la "personalización" sale del aislamiento por-usuario que el modelo de datos **ya tiene**. Conocimiento fresco al instante. Compatible con el stack actual. |

## 2. Por qué fine-tuning por usuario (el "Hermes individual") NO encaja

Es el espejismo más tentador, así que vale enterrarlo con razones concretas, no por descarte vago:

- **Infra ausente.** El stack es Firebase + Cloud Functions (CPU, serverless). Fine-tuning e **inferencia** de un modelo open requieren GPUs. Un modelo por usuario = N artefactos de varios GB que hay que almacenar y servir. No hay forma de hacerlo en este stack sin montar un servicio de inferencia GPU entero.
- **Anthropic no ofrece fine-tuning de Claude.** El proveedor actual (Claude Haiku, BYOK) no soporta este camino. Habría que abandonar el proveedor y self-hostear modelos open — un giro de plataforma completo.
- **El conocimiento envejece al instante.** Las notas cambian a diario. Un fine-tune queda viejo apenas el usuario escribe una nota nueva; re-entrenar por cada cambio es lento y caro. RAG ve la nota nueva **apenas se genera su embedding** (segundos).
- **Fine-tuning memoriza el estímulo equivocado.** Enseña **estilo y formato**, no es confiable para recuperar **hechos puntuales** ("¿qué anoté del proyecto X el martes?"). Para recuperación factual exacta, RAG es estrictamente superior — y eso es justo el caso de uso de un segundo cerebro.

> **Matiz honesto:** fine-tuning **sí** tendría sentido para enseñarle a la IA un **estilo de escritura** o un **formato de salida** muy específico transversal a todos los usuarios (no por-usuario). Eso es un proyecto distinto y no es lo que pide la pregunta. La personalización **por conocimiento** es territorio de RAG.

## 3. Lo que YA existe en el repo (RAG está al ~80%)

SecondMind ya tiene desplegadas las piezas centrales de un pipeline RAG. Esto no es greenfield:

| Pieza | Archivo | Qué aporta al RAG |
| --- | --- | --- |
| **Índice semántico por-usuario** | `src/functions/src/embeddings/generateEmbedding.ts` (trigger) → `users/{uid}/embeddings/{noteId}` | El **retrieval index**. Cada nota ya tiene su vector (OpenAI `text-embedding-3-small`, 1536d), regenerado por SHA-256 del `contentPlain`. |
| **Vectorización de la query** | `src/functions/src/search/embedQuery.ts` (callable) + `src/lib/embeddings.ts` `embedQueryText` | Convierte la pregunta del usuario al mismo espacio vectorial. Ya con `assertAllowlisted` + `assertSemanticConsent` + `enforceRateLimit` + `maxInstances: 5`, query ≤300 chars. |
| **Scoring client-side** | `src/lib/embeddings.ts` (`cosineSimilarity`, `fetchAllEmbeddings`, `getEmbeddingsCache`) | El **ranking** de notas relevantes ya corre en el cliente, con cache en memoria. `useHybridSearch` (keyword Orama + semántico, `SEMANTIC_THRESHOLD = 0.3`) y `useSimilarNotes` (`SIMILARITY_THRESHOLD = 0.5`) ya hacen el "top-K por significado". |
| **Generación con Claude (BYOK)** | `src/functions/src/inbox/processInboxItem.ts`, `src/functions/src/notes/autoTagNote.ts` | El **patrón de generación** ya existe: `getUserAnthropicKey(userId, master.value())` → `new Anthropic({ apiKey })` → `model: 'claude-haiku-4-5-20251001'`, `tool_choice` forzado, `timeoutSeconds: 60`. Reusar tal cual. |
| **Aislamiento por-usuario** | `users/{uid}/...` (modelo de datos) | La "personalización individual" **sale gratis**: cada usuario solo recupera de SUS notas. No hay que construir nada para eso. |
| **Schemas compartidos** | `src/functions/src/lib/schemas.ts` | Patrón de tool-use con JSON enforcement para estructurar la respuesta si hiciera falta (ej. citas). |

**Lo único que falta** es la pieza del medio: una **CF de generación que arme el prompt RAG** (recuperar top-K → inyectar contenido como contexto → preguntar a Claude → devolver respuesta + citas) y una **UI de chat/Q&A**. El retrieval, el index, el scoring, el BYOK y el aislamiento ya están.

## 4. El flujo RAG concreto (lo que el SPEC tendría que diseñar)

1. Usuario hace una pregunta en lenguaje natural ("¿qué conclusiones saqué sobre X?").
2. La pregunta se vectoriza — reusar `embedQuery`/`embedQueryText` (ya con sus guards).
3. **Retrieval:** top-K embeddings más cercanos del usuario por coseno (reusar `getEmbeddingsCache` + `cosineSimilarity`; ya existe). K a calibrar (¿5? ¿8?).
4. Se trae el **contenido** de esas K notas (de Firestore / cache) y se arma el prompt:
   _"Basándote ÚNICAMENTE en estas notas del usuario: [nota1...notaK], respondé: [pregunta]. Citá las notas que uses por su título/ID."_
5. **Generación:** Claude Haiku BYOK responde — mismo patrón que `processInboxItem` (cliente Anthropic con la key del usuario). Si se quieren **citas estructuradas**, usar `tool_choice` forzado con un schema en `schemas.ts`.
6. La UI muestra la respuesta + **enlaces clicables a las notas fuente** (anti-alucinación: el usuario verifica de dónde salió).

Decisiones abiertas para el SPEC (no resolver acá): ¿dónde corre el armado del prompt — CF nueva o client-side con el BYOK?, ¿chat con memoria de conversación o Q&A sin estado?, K y umbral de retrieval, manejo de "no hay notas relevantes" (no inventar), tope de tokens de contexto, y si la respuesta debe ser **siempre** grounded (citas obligatorias) o admite razonamiento libre.

## 5. RAG vs los caminos de entrenamiento — el cuadro de decisión

| | A. Desde cero | B. Fine-tune/usuario | **C. RAG** |
| --- | --- | --- | --- |
| Costo | 💀 millones USD | 🔴 muy alto (GPU train+infer) | 🟢 marginal (reusa infra) |
| Infra nueva | 💀 cluster de training | 🔴 servicio de inferencia GPU | 🟢 ninguna (Firebase + BYOK actual) |
| Datos suficientes por usuario | ❌ no (faltan ~6 órdenes de magnitud) | ⚠️ justo, calidad pobre | ✅ sí (no necesita "suficientes", recupera los que haya) |
| Conocimiento fresco | ❌ congelado al training | ❌ stale hasta re-entrenar | ✅ instantáneo (apenas se embeddea la nota) |
| Recuperación factual exacta | ⚠️ alucina | ❌ memoriza mal hechos puntuales | ✅ es su fuerte (cita la fuente) |
| Compatible con el stack actual | ❌ | ❌ (Anthropic no fine-tunea Claude) | ✅ ~80% ya desplegado |
| Personalización por-usuario | (entrenando N modelos) | (entrenando N modelos) | ✅ gratis, del aislamiento `users/{uid}` |

## 6. Encuadre de privacidad / consentimiento (NO ignorar)

Un copilot RAG **manda contenido de notas a Claude** (Anthropic, EE.UU.) en cada respuesta — exactamente el mismo tipo de operación que el flujo de embeddings a OpenAI. Por eso:

- **Ya hay precedente de gate:** `embedQuery` exige `assertSemanticConsent` (ver `src/functions/src/lib/readSemanticConsent.ts`, `markSemanticConsent.ts`, `semanticNoticeVersion.ts`). El copilot debe pasar por un **consentimiento equivalente** (probablemente el mismo aviso semántico, o una extensión versionada de él).
- **BYOK reduce la fricción legal:** la generación corre bajo la **key del propio usuario** (igual que `processInboxItem`/`autoTagNote`), no la del operador → es el usuario quien contrata a Anthropic como encargado. Mantener ese encuadre.
- **Minimización:** mandar a Claude **solo las K notas recuperadas**, no todo el corpus. El retrieval ya acota qué texto sale.
- **Cruce con el draft de embeddings locales:** si algún día el retrieval pasa a embeddings on-device (ver `DRAFT-embeddings-locales-on-device.md`), el **retrieval** dejaría de tocar OpenAI, pero la **generación** RAG seguiría mandando texto a Claude — son operaciones distintas, cada una con su encuadre. No confundir "embedding local" con "generación local".
- Sin BYOK key del usuario, la generación queda deshabilitada (igual que hoy la IA de generación) — el copilot sería una feature gated por tener key configurada.

## 7. Referencias cruzadas

- **Origen:** pregunta de Sebastián del 2026-06-30 (sesión `claude/secondmind-personal-llm-qiqgdg`).
- **Infra de retrieval reusable:** `src/lib/embeddings.ts`, `src/hooks/useHybridSearch.ts`, `src/hooks/useSimilarNotes.ts`, `src/functions/src/search/embedQuery.ts`, `src/functions/src/embeddings/generateEmbedding.ts`.
- **Patrón de generación BYOK a reusar:** `src/functions/src/inbox/processInboxItem.ts`, `src/functions/src/notes/autoTagNote.ts`, `src/functions/src/lib/getUserAnthropicKey.ts`, `src/functions/src/lib/schemas.ts`.
- **Gate de consentimiento semántico:** `src/functions/src/lib/readSemanticConsent.ts`, `markSemanticConsent.ts`, `semanticNoticeVersion.ts`.
- **Relacionado:** `DRAFT-embeddings-locales-on-device.md` (mover el **retrieval** on-device; ortogonal a este draft, que es sobre **generación**).
- **Convenciones aplicables al SPEC futuro:** `Docs/01-arquitectura-hibrida-progresiva.md` (schemas Firestore), `Docs/03-convenciones-y-patrones.md` (Cloud Functions v2), reglas de "Cloud Functions v2" en `CLAUDE.md` (`sanitizeError`, `maxInstances`, secret management BYOK).
