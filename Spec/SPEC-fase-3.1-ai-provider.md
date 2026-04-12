# SPEC — SecondMind · Fase 3.1: Schema Enforcement — Tool Use en Cloud Functions

> Alcance: Refactorizar las 2 Cloud Functions de AI para usar tool use de Anthropic con schema enforcement en vez de "Responde SOLO JSON" en el prompt. Elimina nulls, stripJsonFence, y fallbacks manuales sin cambiar de proveedor.
> Dependencias: Fase 3 (AI Pipeline) completada
> Estimado: 2-3 días (solo dev)
> Stack relevante: Firebase Cloud Functions v2 + Anthropic SDK (`@anthropic-ai/sdk`) + Claude Haiku 4.5

---

## Objetivo

Al terminar esta fase, las Cloud Functions de AI usan tool use con `tool_choice: { type: 'tool' }` para forzar a Claude Haiku a devolver JSON que cumple el schema definido. No más campos null, no más JSON envuelto en markdown fences, no más `stripJsonFence`. Los schemas se definen una sola vez y se reusan en ambas CFs. Cero cambios en el frontend — las CFs siguen escribiendo los mismos campos flat a Firestore.

---

## Features

### F1: Schemas compartidos

**Qué:** Módulo `src/functions/src/lib/schemas.ts` con los JSON Schemas de las respuestas de AI definidos una sola vez. Reemplaza los prompts "Responde SOLO JSON" por schemas tipados que tool use enforce.

**Criterio de done:**
- [ ] `schemas.ts` exporta `INBOX_CLASSIFICATION_SCHEMA` (6 campos: suggestedTitle, suggestedType, suggestedTags, suggestedArea, summary, priority)
- [ ] `schemas.ts` exporta `NOTE_TAGGING_SCHEMA` (2 campos: tags, summary)
- [ ] Ambos schemas usan `enum` para campos con valores fijos (suggestedType, suggestedArea, priority)
- [ ] TypeScript types `InboxClassification` y `NoteTagging` exportados para tipar las respuestas
- [ ] Los schemas siguen la estructura JSON Schema estándar (`type`, `properties`, `required`, `additionalProperties: false`)

**Archivos a crear:**
- `src/functions/src/lib/schemas.ts` — schemas + types

**Notas de implementación:**

```typescript
export const INBOX_CLASSIFICATION_SCHEMA = {
  type: 'object' as const,
  properties: {
    suggestedTitle: { type: 'string', description: 'Título conciso (max 80 chars)' },
    suggestedType: { type: 'string', enum: ['note', 'task', 'project', 'trash'] },
    suggestedTags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    suggestedArea: { type: 'string', enum: ['proyectos', 'conocimiento', 'finanzas', 'salud', 'pareja', 'habitos'] },
    summary: { type: 'string', description: 'Resumen de una línea' },
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
  },
  required: ['suggestedTitle', 'suggestedType', 'suggestedTags', 'suggestedArea', 'summary', 'priority'],
};

export interface InboxClassification {
  suggestedTitle: string;
  suggestedType: 'note' | 'task' | 'project' | 'trash';
  suggestedTags: string[];
  suggestedArea: string;
  summary: string;
  priority: string;
}
```

Las 6 áreas del enum coinciden con las keys de `AREAS` de `src/types/area.ts`. Los 4 tipos y 4 prioridades coinciden con los valores que F1 de Fase 3 ya producía.

---

### F2: Refactorizar processInboxItem con tool use

**Qué:** Reemplazar la llamada `messages.create` con prompt "Responde SOLO JSON" por una llamada con `tools` + `tool_choice` que enforce el schema. Eliminar `stripJsonFence`, eliminar fallbacks manuales por null, extraer el resultado del `tool_use` block.

**Criterio de done:**
- [ ] La llamada a Anthropic usa `tools: [{ name: 'classify_inbox', input_schema: INBOX_CLASSIFICATION_SCHEMA }]`
- [ ] `tool_choice: { type: 'tool', name: 'classify_inbox' }` fuerza la respuesta como tool call
- [ ] El resultado se extrae de `response.content.find(b => b.type === 'tool_use').input` — ya es un objeto, no un string
- [ ] No hay import de `stripJsonFence` ni llamada a `JSON.parse` de la respuesta
- [ ] No hay fallbacks manuales (`?? 'conocimiento'`, `?? 'medium'`) — el schema los garantiza via `enum`/`required`
- [ ] El system prompt se simplifica: solo contexto de productividad, sin instrucciones de formato JSON
- [ ] Los 6 campos flat escritos a Firestore mantienen la misma estructura (cero impacto en frontend)
- [ ] El log incluye el `suggestedType` como antes

**Archivos a modificar:**
- `src/functions/src/inbox/processInboxItem.ts` — refactor de la llamada AI + cleanup

**Notas de implementación:**

El prompt cambia de:
```
System: ... Responde SOLO con JSON válido, sin markdown: { suggestedTitle, ... }
User: Clasifica esta captura: "{rawContent}"
```

A:
```
System: Eres un asistente de productividad personal. Analizas capturas rápidas
del usuario y sugieres cómo clasificarlas. El usuario tiene estas áreas:
Proyectos, Conocimiento, Finanzas, Salud y Ejercicio, Pareja, Hábitos.

User: Clasifica esta captura: "{rawContent}"
```

Las instrucciones de formato desaparecen — el schema del tool las reemplaza. El `description` de cada campo en el schema guía al modelo sobre qué generar.

Extracción del resultado:
```typescript
const response = await client.messages.create({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 512,
  tools: [{
    name: 'classify_inbox',
    description: 'Clasifica una captura de inbox del usuario',
    input_schema: INBOX_CLASSIFICATION_SCHEMA,
  }],
  tool_choice: { type: 'tool', name: 'classify_inbox' },
  messages: [{ role: 'user', content: `${systemPrompt}\n\n${rawContent}` }],
});

const toolBlock = response.content.find((b) => b.type === 'tool_use');
if (!toolBlock || toolBlock.type !== 'tool_use') {
  // Edge case: no debería pasar con tool_choice forced, pero defensivo
  logger.error('No tool_use block in response', { userId, itemId });
  return;
}
const result = toolBlock.input as InboxClassification;
```

`toolBlock.input` ya es un objeto parseado con los campos del schema — no es un string. No necesita `JSON.parse`. No necesita `stripJsonFence`.

**Nota sobre el system prompt con tool use:** Anthropic recomienda poner el system prompt en el campo `system` del request, no concatenado al user message. Verificar si la API de `messages.create` soporta `system` como parámetro top-level (sí lo soporta). Usar:
```typescript
{
  model: '...',
  system: SYSTEM_PROMPT,
  tools: [...],
  tool_choice: { type: 'tool', name: '...' },
  messages: [{ role: 'user', content: `Clasifica esta captura:\n"${rawContent}"` }],
}
```

---

### F3: Refactorizar autoTagNote con tool use

**Qué:** Mismo tratamiento que F2 pero para la CF de auto-tagging de notas.

**Criterio de done:**
- [ ] La llamada usa `tools: [{ name: 'tag_note', input_schema: NOTE_TAGGING_SCHEMA }]` + `tool_choice` forced
- [ ] El resultado se extrae de `toolBlock.input` como objeto directo
- [ ] No hay `stripJsonFence` ni `JSON.parse` de la respuesta
- [ ] Si la respuesta no tiene `tool_use` block (edge case), marca `aiProcessed: true` con `aiTags: '[]'` (evita re-procesamiento)
- [ ] El guard `aiProcessed` y `contentPlain.trim()` se mantienen sin cambios
- [ ] Los campos escritos a Firestore mantienen la misma estructura

**Archivos a modificar:**
- `src/functions/src/notes/autoTagNote.ts` — refactor de la llamada AI + cleanup

---

### F4: Cleanup — eliminar parseJson.ts

**Qué:** Eliminar el módulo `stripJsonFence` que ya no tiene consumidores.

**Criterio de done:**
- [ ] `src/functions/src/lib/parseJson.ts` eliminado
- [ ] No hay imports huérfanos que referencien a `parseJson` en ningún archivo
- [ ] `cd src/functions && npm run build` compila limpio
- [ ] `npm run build` en raíz compila sin regresión

**Archivos a eliminar:**
- `src/functions/src/lib/parseJson.ts`

---

## Orden de implementación

1. **F1: schemas.ts** → Primero. Define los schemas que F2 y F3 consumen.
2. **F2: processInboxItem** → Consume schemas. Testeable E2E con una captura.
3. **F3: autoTagNote** → Consume schemas. Testeable creando una nota.
4. **F4: Cleanup** → Al final. Eliminar parseJson.ts solo después de confirmar build limpio.

---

## Estructura de archivos

```
src/functions/
├── src/
│   ├── lib/
│   │   ├── schemas.ts           # NUEVO — JSON Schemas + types
│   │   └── parseJson.ts         # ELIMINADO en F4
│   ├── inbox/
│   │   └── processInboxItem.ts  # MODIFICADO — tool use
│   └── notes/
│       └── autoTagNote.ts       # MODIFICADO — tool use
```

---

## Definiciones técnicas

### D1: ¿Cómo funciona tool use como schema enforcement?

Cuando se usa `tool_choice: { type: 'tool', name: 'X' }`, Anthropic fuerza al modelo a responder exclusivamente con un `tool_use` block que cumple el `input_schema` de la tool `X`. El modelo no puede devolver texto libre, ni wrappear en markdown, ni omitir campos `required`. Los `enum` restringen los valores posibles. Es enforcement a nivel de decodificador — no depende de obediencia al prompt.

### D2: ¿Por qué no agregar OpenAI ahora?

Simplicidad. El problema actual (nulls, JSON malformado) se resuelve 100% con tool use sin cambiar de proveedor. OpenAI se agrega en Fase 4 cuando realmente se necesite para embeddings — no antes. YAGNI.

### D3: ¿Cambia el costo?

No. Tool use con Haiku tiene un overhead fijo de ~50-100 tokens extra por la definición de la tool en el prompt. A $1/MTok y ~100 requests/mes, el incremento es < $0.01/mes.

---

## Checklist de completado

- [ ] `schemas.ts` creado con `INBOX_CLASSIFICATION_SCHEMA` + `NOTE_TAGGING_SCHEMA` + types
- [ ] `processInboxItem` usa tool use con schema enforcement — sin `stripJsonFence`, sin fallbacks null
- [ ] `autoTagNote` usa tool use con schema enforcement
- [ ] `parseJson.ts` eliminado
- [ ] `cd src/functions && npm run build` compila sin errores
- [ ] `npm run build` en raíz compila sin errores
- [ ] Deploy exitoso: `firebase deploy --only functions`
- [ ] Al capturar con Alt+N, la CF procesa correctamente (6 campos flat con valores válidos, sin nulls)
- [ ] Al crear nota con texto, autoTagNote genera tags correctamente
- [ ] Captura de basura ("asdf") produce `suggestedType: 'trash'` y `suggestedArea` con valor válido del enum (no null)
- [ ] `/inbox`, `/inbox/process`, y dashboard funcionan sin regresión
- [ ] Logs muestran las invocaciones exitosas con `suggestedType`

---

## Siguiente fase

Continuar con **Fase 4 — Grafo + Resurfacing**. OpenAI SDK se agrega en Fase 4 cuando se implemente `text-embedding-3-small` para embeddings.
