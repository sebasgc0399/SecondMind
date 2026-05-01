# Cloud Functions — Tool use con schema enforcement

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.
> Origen: sub-sección "Tool use con schema enforcement (Fase 3.1)" del corpus monolítico (D-Plan-1 split de Cloud Functions en 2 archivos).

Ambas CFs con Claude usan `tools` + `tool_choice: { type: 'tool', name: '...' }` para forzar JSON válido. `enum` y `required` del JSON Schema garantizan valores a nivel de decoder — no depende de obediencia al prompt. Schemas compartidos en [`src/functions/src/lib/schemas.ts`](../../src/functions/src/lib/schemas.ts). Eliminó fallbacks null, stripJsonFence, código defensivo de parsing.

## Anthropic enforce `enum` en JSON Schema, NO `minimum`/`maximum`

`enum` se respeta a nivel de decoder. `minimum`/`maximum` para `number` son hints — el modelo puede retornar valores fuera de rango (ej. confidence `1.05` cuando el schema dice `[0,1]`). Validar manualmente en CF tras `tool_use` con clamp explícito: `Math.min(max, Math.max(min, value ?? default))`. Aplicable a cualquier campo numérico con rango. Patrón vivo en [autoTagNote.ts](../../src/functions/src/notes/autoTagNote.ts) (`noteTypeConfidence`).

## Confidence retornada por Haiku 4.5 varía con la claridad del input, no es plana

En testing E2E del `processInboxItem`: capturas fragmentarias o ambiguas (ej. `"explorar concepto cuántico tal vez"`) reciben `0.85` casi canónico, mientras que knowledge claros con substantivos definidos (ej. `"Concepto: clean architecture..."`, `"Idea: usar event sourcing..."`) reciben `0.92-0.95`. Esto invalida parcialmente la observación inicial de F26 ("tendencia a 0.85 canónico") — el modelo SÍ se anima a valores extremos cuando el input lo amerita. Implicación práctica: el threshold `HIGH_CONFIDENCE_THRESHOLD = 0.85` (`src/hooks/useInbox.ts`) es border-case por diseño — capturas claras quedan en bucket alto, ambiguas en "Revisar". Si Sebastián observa en uso real que casos legítimamente claros se quedan en `0.85` y deberían ser `>0.9`, refinar el system prompt con few-shot por banda antes de bajar el threshold (más resiliente que tunear el número). Aplicable a cualquier futura CF que pida self-assessment de confianza al modelo.

## Prompt caching `cache_control: { type: 'ephemeral' }` en system block de CFs Anthropic

Cuando el system prompt supera ~100 palabras (heurísticas, ejemplos detallados, schema explanations), pasarlo como string plano repite el costo de input tokens en cada invocación. Con `system: [{ type: 'text', text: PROMPT, cache_control: { type: 'ephemeral' } }]`, el segundo+ call dentro de los 5min TTL cuesta ~10% del costo de input. Aplicable a cualquier futura CF con system prompt extenso. Vivo en [autoTagNote.ts](../../src/functions/src/notes/autoTagNote.ts) (system block ~150 palabras con heurísticas Zettelkasten).
