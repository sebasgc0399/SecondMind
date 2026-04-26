# SPEC F26 — Inbox: batch processing + confidence (Registro de implementación)

> Estado: Completada abril 2026
> Commits: `db28495` SPEC, `269e700` F26.1 backend CF (schema + system prompt + persistencia), `dddb602` F26.1 cliente (store schema + repo row + types + lectura `useInbox`), `60c698c` badge visual de confidence en `InboxItem`, `a503625` F26.2 `acceptHighConfidence` + UI agrupada en 2 secciones.
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

Reducir la fricción del procesamiento one-by-one del Inbox aprovechando que **9/10 capturas se aceptan tal como las sugiere la AI**. Solución de dos partes acopladas:

1. La Cloud Function que clasifica cada item devuelve también un **confidence score global** (0..1).
2. La UI agrupa los items en dos buckets ("Alta confianza ≥0.85" y "Revisar") y ofrece un botón **"Aceptar N items"** que actúa solo sobre el bucket alto, ejecutando la conversión correspondiente a cada `aiSuggestedType` (`note/task/project/trash`) sin abrir cada item uno por uno.

El bucket "Revisar" preserva el flujo manual existente — no cambia el modelo mental del Inbox como staging visible. **No** se introduce auto-accept silencioso en background; decisión explícita para postergar ese cambio de paradigma hasta validar con uso real.

## Qué se implementó

- **F26.1 — Confidence en CF + cliente:** `processInboxItem` devuelve un campo nuevo `confidence: number (0..1)` global (un solo número, no por campo), persistido como `aiConfidence` en Firestore con guard defensivo `typeof === 'number' ? x : 0` (Firestore rechaza `undefined`). Cliente extiende el schema TinyBase + `InboxRow` del repo + `InboxAiResult.confidence?` (opcional para compat con items pre-deploy) y `useInbox` lo lee con guard `> 0` que neutraliza el `default: 0` del schema para items pre-deploy. Archivos tocados: `src/functions/src/lib/schemas.ts`, `src/functions/src/inbox/processInboxItem.ts`, `src/stores/inboxStore.ts`, `src/infra/repos/inboxRepo.ts`, `src/types/inbox.ts`, `src/hooks/useInbox.ts`.

- **F26.2 — UI bucket alta confianza + batch accept:** `useInbox` exporta `HIGH_CONFIDENCE_THRESHOLD = 0.85` y `acceptHighConfidence` que itera items con `confidence >= threshold` llamando `inboxRepo.*` directo (no los wrappers del hook que navegan), con switch sobre `aiSuggestedType` (`note/task/project` → `convertTo*`, `trash` → `dismiss`), contando `ok` y `failed` por throw o por `null` retornado del converter. UI parte items en 2 secciones (`Alta confianza` / `Revisar`) con header + count; sección alta tiene botón "Aceptar N items" con label transitorio (`Procesando...` → `✓ N aceptados` → idle a los 3s, agrega `⚠ M fallaron` si hubo errores). Badge `%` verde (≥0.85) / ámbar (<0.85) en footer de cada `InboxItem`. Archivos tocados: `src/hooks/useInbox.ts`, `src/components/capture/InboxItem.tsx`, `src/app/inbox/page.tsx`.

## Decisiones clave

| ID  | Decisión                                                                           | Por qué                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Threshold `0.85` hardcodeado, no setting de usuario.                               | Si el modelo tiende a valores canónicos (ver Lecciones), ajustar requiere cambio consciente. Setting prematuro genera fricción sin valor demostrado.                                      |
| D2  | Sin script retroactivo para items pre-deploy.                                      | Caen en bucket "Revisar" naturalmente vía guard `> 0` en lectura. Re-disparar la CF para backfillear cuesta tokens y agrega complejidad sin beneficio.                                    |
| D3  | Sin auto-accept silencioso en background.                                          | Inbox sigue siendo staging visible que el user abre y revisa. Cambio de paradigma → feature aparte si tras 1 mes con F26.2 el bucket alto demuestra acertar siempre.                      |
| D4  | Confidence global (un número), no por campo.                                       | El caso de uso (batch accept) no necesita granularidad por campo. Un solo número es más simple para el modelo y para el usuario.                                                          |
| D5  | `acceptHighConfidence` llama `inboxRepo.*` directo, no los wrappers de `useInbox`. | Los wrappers usan `useNavigate()` (incondicional en el hook). El repo es puro y reusable sin Router context. Patrón ya consolidado: `useTasks` expone `tasksRepo.*` directo sin wrappear. |
| D6  | Sin sistema de toast nuevo (no `BatchActionToast.tsx`).                            | El codebase no tiene sonner ni equivalente. Crear infra solo para esta feature es scope creep. Feedback inline en el botón (label transitorio 3s) cumple.                                 |

## Lecciones

- **Buscar prior art de shapes de campo antes de inventar.** F26.1 replicó 1:1 el patrón de `noteTypeConfidence: number (0..1)` ya existente en `NOTE_TAGGING_SCHEMA` (`src/functions/src/lib/schemas.ts`). Aplicable a cualquier feature que agregue un campo "score" / "probability" / "confidence" — buscar primero, copiar el shape, evitar divergencia.

- **TinyBase v8 `setTablesSchema` es estricto en escritura.** Sin declarar el campo nuevo en el schema del store (con `default: <valor>`), el persister no lo manda a Firestore. No es laxo — agregar al store es paso obligatorio. Los stores actuales declaran `default` para todos los campos; seguir el patrón.

- **Hooks que invocan `useNavigate` no son reusables fuera de Router context.** Si necesitás llamar la lógica desde otro hook o desde una utility no-React, llamá al repo directamente. Patrón consolidado: `useTasks` expone `tasksRepo.*` sin wrappers. Wrappear solo cuando la navegación es parte del contrato esperado para todos los consumidores.

- **Converters como `tasksRepo.createTask` retornan `null` silenciosamente además de throw.** Ver `inboxRepo.ts:97-100`. Cualquier loop que cuente `ok` / `failed` debe chequear ambos casos: `try { const r = await x(); if (!r) failed++; else ok++; } catch { failed++ }`. Solo contar throws subestima fallos reales.

- **`default: 0` en schema TinyBase colisiona con "no definido".** Items pre-deploy se leen como `0` (no `undefined`). Si la lógica distingue ausencia de valor 0 (caso F26: confidence real = 0 vs item sin procesar), agregar guard `> 0` en lectura. La alternativa (no declarar default) puede afectar otras lógicas que dependen del fallback.

- **Cloud Function `update()` con `undefined` falla en Firestore.** Si la respuesta del modelo cacheada o malformada puede no incluir un campo nuevo, defender en el escritor con `typeof === 'number' ? x : 0`. Aplica también a otros valores opcionales escritos a Firestore desde CFs.

- **Confidence del modelo Haiku 4.5 tiende a un valor canónico (0.85 observado en E2E) sin la dispersión esperada.** En testing con prompts de claridad variada (`comprar leche mañana` esperado >0.9, `explorar concepto cuántico tal vez algún día` esperado <0.7, `leer doc TinyBase` esperado ~0.85) el modelo asignó `0.85` exacto a los 3. Implicación: el threshold 0.85 puede necesitar ajuste, o el system prompt requiere refinamiento (ej. few-shot con ejemplos de cada banda) para que el modelo se anime a valores extremos. Validar con uso real antes de tunear.

- **Feedback inline transitorio se oculta junto con su contenedor cuando ese contenedor depende del estado que el feedback acaba de modificar.** En F26.2, la sección "Alta confianza" se condiciona por `high.length > 0`; al aceptar todos los items, `high.length === 0` y la sección se oculta antes de que el label `✓ N aceptados` cumpla sus 3s. Trade-off: o se preserva la sección con condición especial mientras `batchStatus.kind === 'done'`, o se confía en el empty state alternativo (`Inbox limpio 🎉`) como feedback. F26 eligió la segunda — agregar la lógica solo si el feedback se siente faltante con uso real.

- **Tokens semánticos `--accent-success` / `--accent-warning` no están definidos en el design system actual.** Tailwind directo (`emerald-*` / `amber-*`) es el fallback hasta que se promuevan. Considerar promoverlos a `src/index.css` `@theme inline { ... }` cuando una segunda feature necesite el mismo color semántico.
