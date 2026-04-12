# SPEC — SecondMind · Fase 3.1: Schema Enforcement — Tool Use en Cloud Functions (Completada)

> Registro de lo implementado en el refactoring de las Cloud Functions de AI.
> Completada: Abril 2026

---

## Objetivo

Las 2 Cloud Functions de AI (`processInboxItem`, `autoTagNote`) usaban prompts "Responde SOLO JSON" + `stripJsonFence` + fallbacks manuales para parsear respuestas de Claude Haiku. Esto producía nulls en campos (especialmente `suggestedArea` para inputs basura), JSON wrapeado en markdown fences, y ~120 líneas de código defensivo de parsing y validación. Fase 3.1 migró ambas CFs a tool use de Anthropic con `tool_choice: { type: 'tool' }` — enforcement a nivel de decoder, no de obediencia al prompt. Cero cambios en el frontend; las CFs siguen escribiendo los mismos campos flat a Firestore.

---

## Features implementadas

### F1: Schemas compartidos

Módulo `src/functions/src/lib/schemas.ts` con 2 JSON Schemas y 2 interfaces TypeScript. `INBOX_CLASSIFICATION_SCHEMA` define 6 campos required (`suggestedTitle`, `suggestedType`, `suggestedTags`, `suggestedArea`, `summary`, `priority`) con `enum` en los campos con valores fijos — los valores coinciden exactamente con los que Fase 3 ya producía (`VALID_TYPES`, `VALID_AREAS`, `VALID_PRIORITIES` del antiguo `processInboxItem.ts` y las keys de `AREAS` de `src/types/area.ts`). `NOTE_TAGGING_SCHEMA` define 2 campos required (`tags`, `summary`). Ambos usan `additionalProperties: false` y `type: 'object' as const` para compatibilidad con el tipo `Anthropic.Tool['input_schema']` del SDK. Las interfaces `InboxClassification` y `NoteTagging` tipan el resultado de `toolBlock.input` con union types en los campos de enum.

### F2: Refactorizar processInboxItem con tool use

Reescritura de `src/functions/src/inbox/processInboxItem.ts`. Se eliminaron: import de `stripJsonFence`, constantes `VALID_TYPES`/`VALID_AREAS`/`VALID_PRIORITIES` y sus types, interface `AiSuggestion`, función `buildUserPrompt` (instrucciones de formato JSON en el prompt), función `parseSuggestion` (48 líneas de parsing manual con fallbacks `?? 'conocimiento'`, `?? 'medium'`). Se agregó: import de `INBOX_CLASSIFICATION_SCHEMA` e `InboxClassification` de schemas.ts, tool `classify_inbox` en `messages.create` con `tool_choice: { type: 'tool', name: 'classify_inbox' }`. El system prompt se simplificó a solo contexto de productividad (sin instrucciones de formato). El resultado se extrae de `toolBlock.input as InboxClassification` — ya es un objeto parseado, no un string. No hay `JSON.parse` ni `stripJsonFence`. El `docRef.update` con los 7 campos flat y el logging con `suggestedType` se mantuvieron idénticos. Net: -104/+40 líneas.

### F3: Refactorizar autoTagNote con tool use

Mismo tratamiento en `src/functions/src/notes/autoTagNote.ts`. Se eliminaron: import de `stripJsonFence`, función `buildUserPrompt`, función `parseTagResult`, interface `TagResult`. Se agregó tool `tag_note` con `NOTE_TAGGING_SCHEMA` y `tool_choice` forced. Edge case defensivo: si la respuesta no tiene `tool_use` block (no debería pasar con forced, pero defensivo), marca `aiProcessed: true` con `aiTags: '[]'` y `aiSummary: ''` para evitar re-procesamiento infinito por `onDocumentWritten`. Los guards `aiProcessed` y `contentPlain.trim()` se mantuvieron sin cambios. Net: -46/+28 líneas.

### F4: Cleanup — eliminar parseJson.ts

`src/functions/src/lib/parseJson.ts` eliminado. Grep verificó 0 referencias a `stripJsonFence` o `parseJson` en `src/functions/` tras F2 y F3. Build limpio en functions y raíz.

---

## Archivos — por feature

**F1 — Schemas compartidos:**

- `src/functions/src/lib/schemas.ts` — NUEVO (schemas + interfaces)

**F2 — processInboxItem con tool use:**

- `src/functions/src/inbox/processInboxItem.ts` — MODIFICADO (tool use, eliminado parsing manual)

**F3 — autoTagNote con tool use:**

- `src/functions/src/notes/autoTagNote.ts` — MODIFICADO (tool use, eliminado parsing manual)

**F4 — Cleanup:**

- `src/functions/src/lib/parseJson.ts` — ELIMINADO

---

## Verificación E2E

- Quick Capture con texto real ("Investigar como funciona FSRS..."): 6 campos flat correctos — `aiSuggestedType: 'task'`, `aiSuggestedArea: 'conocimiento'`, `aiPriority: 'medium'`, 4 tags relevantes, summary coherente, `aiProcessed: true`
- Quick Capture con basura ("asdf jkl qwerty"): todos los campos con valores válidos del enum, sin nulls — `aiSuggestedArea: 'conocimiento'`, `aiPriority: 'low'`, `aiSuggestedType: 'note'`
- Nota nueva con texto (FSRS): `aiTags` con 5 tags relevantes, `aiSummary` coherente, `aiProcessed: true`
- `/inbox`, `/inbox/process`, dashboard: sin regresión en renderizado de sugerencias AI
- Build functions + raíz: limpio
- Deploy exitoso: ambas funciones actualizadas en us-central1

---

## Checklist de completado

- [x] `schemas.ts` creado con `INBOX_CLASSIFICATION_SCHEMA` + `NOTE_TAGGING_SCHEMA` + types
- [x] `processInboxItem` usa tool use con schema enforcement — sin `stripJsonFence`, sin fallbacks null
- [x] `autoTagNote` usa tool use con schema enforcement
- [x] `parseJson.ts` eliminado
- [x] `cd src/functions && npm run build` compila sin errores
- [x] `npm run build` en raíz compila sin errores
- [x] Deploy exitoso: `firebase deploy --only functions`
- [x] Al capturar con Alt+N, la CF procesa correctamente (6 campos flat con valores válidos, sin nulls)
- [x] Al crear nota con texto, autoTagNote genera tags correctamente
- [x] Captura de basura produce `suggestedArea` con valor válido del enum (no null)
- [x] `/inbox`, `/inbox/process`, y dashboard funcionan sin regresión

---

## Observaciones post-implementación

1. **Tool use no mejora la calidad de clasificación, solo el formato.** Input basura "asdf jkl qwerty" devolvió `suggestedType: 'note'` en vez de `'trash'`. El modelo sigue decidiendo qué clasificar como trash vs note — tool use garantiza que el valor sea uno del enum, no que sea el correcto.

2. **El gotcha de nulls de Haiku ya no aplica.** Los `enum` + `required` del JSON Schema garantizan valores válidos a nivel de decoder. El fallback `?? 'conocimiento'` y las validaciones manuales de `parseSuggestion` ya no son necesarios. CLAUDE.md actualizado.

3. **`stripJsonFence` eliminado del repo.** El gotcha de markdown fences en las respuestas de Haiku ya no aplica — `toolBlock.input` es un objeto nativo del SDK, no un string.

---

## Siguiente fase

Continuar con **Fase 4 — Grafo + Resurfacing.** OpenAI SDK se agrega en Fase 4 cuando se implemente `text-embedding-3-small` para embeddings.
