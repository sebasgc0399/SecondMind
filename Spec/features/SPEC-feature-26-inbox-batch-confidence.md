# SPEC F26 — Inbox: batch processing + confidence

## Objetivo

Reducir la fricción del procesamiento one-by-one del Inbox aprovechando que **9/10 capturas se aceptan tal como las sugiere la AI**. Solución de dos partes acopladas:

1. La Cloud Function que clasifica cada item devuelve también un **confidence score global** (0..1).
2. La UI agrupa los items en dos buckets ("Alta confianza ≥0.85" y "Revisar") y ofrece un botón **"Aceptar todos"** que actúa solo sobre el bucket alto, ejecutando la conversión correspondiente a cada `aiSuggestedType` (`note/task/project/trash`) sin abrir cada item uno por uno.

El bucket "Revisar" preserva el flujo manual existente — no cambia el modelo mental del Inbox como staging visible. **No** se introduce auto-accept silencioso en background; es decisión explícita postergar ese cambio de paradigma.

## Hipótesis y constraints

- **Patrón `confidence` ya consolidado en codebase.** `NOTE_TAGGING_SCHEMA` define `noteTypeConfidence: number (0..1)` (`src/functions/src/lib/schemas.ts:73-78`). F26.1 replica el mismo shape para mantener consistencia.
- **Conversores ya existen.** `inboxRepo` expone `convertToNote/Task/Project` + `dismiss`; el batch los reusa en loop con `skipNavigate: true`. No se escribe lógica de conversión nueva.
- **`'trash'` no tiene `convertToTrash`.** Mapeo del batch: `note/task/project` → `convertTo*`, `trash` → `dismiss`.
- **Items pre-deploy.** Capturas existentes en Firestore no tienen `aiConfidence`. `useInbox` los lee como `undefined` → caen automáticamente en bucket "Revisar". Sin código defensivo extra, sin script retroactivo.
- **Threshold hardcodeado** = `0.85`, declarado como constante en `useInbox.ts`. Si después no calza con el comportamiento real del modelo, se promueve a setting de usuario en una feature futura.

## Sub-features

### F26.1 — Confidence score en Cloud Function de clasificación

**Qué:** El clasificador (`processInboxItem`) devuelve un campo nuevo `confidence: number (0..1)` que representa qué tan seguro está el modelo de su clasificación global (un solo número, no por campo). El valor se persiste en Firestore como `aiConfidence` y se expone vía `useInbox` en `aiResult.confidence`.

**Criterio de done:**

- Item nuevo capturado tras deploy de la CF tiene campo `aiConfidence` numérico entre 0 y 1 en Firestore (`users/{uid}/inbox/{itemId}.aiConfidence`).
- `useInbox().items[i].aiResult?.confidence` retorna el número o `undefined` (items pre-deploy).
- TypeScript compila sin errores; el tipo es opcional para preservar compat con items existentes.

**Archivos a tocar:**

1. `src/functions/src/lib/schemas.ts`
   - Agregar al `INBOX_CLASSIFICATION_SCHEMA.properties`:
     ```ts
     confidence: {
       type: 'number',
       minimum: 0,
       maximum: 1,
       description: 'Confianza global de la clasificacion (0 a 1).',
     },
     ```
   - Incluir `'confidence'` en el array `required`.
   - Agregar `confidence: number;` a `interface InboxClassification`.

2. `src/functions/src/inbox/processInboxItem.ts`
   - Actualizar `SYSTEM_PROMPT` para pedir auto-evaluación de confianza global. Sugerencia:
     > "Devuelve también `confidence` entre 0 y 1: qué tan seguro estás de la clasificación completa (tipo + área + título). Usa >0.9 para casos obvios, 0.7-0.9 para casos claros, <0.7 para ambigüedades."
   - Persistir en `docRef.update`: `aiConfidence: result.confidence`.

3. `src/types/inbox.ts`
   - Agregar `confidence?: number;` a `interface InboxAiResult` (opcional).

4. `src/hooks/useInbox.ts`
   - En el `useMemo` de `items`, agregar al construir `aiResult`:
     ```ts
     confidence: typeof row.aiConfidence === 'number' ? row.aiConfidence : undefined,
     ```
   - Validar que el campo `aiConfidence` se incluya en el `InboxRow` de `inboxRepo.ts` si la lectura lo exige (chequear en plan mode si TinyBase requiere declaración explícita).

**Snippet referencia (system prompt actualizado):**

```ts
const SYSTEM_PROMPT = `Eres un asistente de productividad personal. Analizas capturas rapidas del usuario y sugieres como clasificarlas. El usuario tiene estas areas: Proyectos, Conocimiento, Finanzas, Salud y Ejercicio, Pareja, Habitos.

Devuelve confidence entre 0 y 1: que tan seguro estas de la clasificacion completa (tipo + area + titulo). Usa >0.9 para casos obvios, 0.7-0.9 para casos claros, <0.7 para ambiguedades.`;
```

---

### F26.2 — UI: agrupación por bucket + acción batch

**Qué:** En `/inbox`, los items pendientes se agrupan en dos secciones:

- **"Alta confianza (≥0.85)"** — items con `aiResult?.confidence >= 0.85`. Botón **"Aceptar N items"** que itera el bucket y ejecuta el converter correcto para cada `aiSuggestedType` con `skipNavigate: true`. Toast con resultado (`N aceptados, M fallaron`).
- **"Revisar"** — todo lo demás: items sin `confidence` (pre-deploy o sin AI procesada aún), items con `confidence < 0.85`. Comportamiento idéntico al actual (procesamiento manual uno a uno).

Cada `InboxItem` muestra un badge visual del confidence (% o color) cuando está disponible.

**Criterio de done:**

- Items con `confidence ≥ 0.85` aparecen bajo encabezado "Alta confianza"; el resto bajo "Revisar".
- Botón "Aceptar N items" visible solo si el bucket alto tiene ≥1 item; al click, los procesa todos sin navegar y muestra toast con conteo de éxitos/fallos.
- Items procesados desaparecen del listado (status pasa a `processed` o `dismissed` según el tipo).
- Items "Revisar" se procesan exactamente como hoy, sin cambios de UX.
- Cada `InboxItem` con `aiResult.confidence` definido muestra badge (porcentaje o equivalente visual).

**Archivos a tocar:**

1. `src/app/inbox/page.tsx`
   - Particionar `items` en dos arrays según threshold.
   - Renderizar dos secciones con encabezado (count en cada uno).
   - Botón "Aceptar N items" en encabezado del bucket alto, deshabilitado si N=0.

2. `src/hooks/useInbox.ts`
   - Exportar constante `HIGH_CONFIDENCE_THRESHOLD = 0.85`.
   - Nuevo método en `UseInboxReturn`:
     ```ts
     acceptHighConfidence: () => Promise<{ ok: number; failed: number }>;
     ```
   - Implementación: filtrar items con `confidence >= threshold`, iterar, mapear `aiSuggestedType` al converter (`note → convertToNote`, `task → convertToTask`, `project → convertToProject`, `trash → dismiss`), todos con `skipNavigate: true`. Acumular ok/failed.

3. `src/components/capture/InboxItem.tsx`
   - Badge mínimo del confidence cuando `aiResult?.confidence !== undefined`. Decisión visual concreta a definir en plan mode (color por threshold, número, o ambos). Mantener escala chica (no dominar la card).

**Snippet referencia (acceptHighConfidence):**

```ts
const acceptHighConfidence = useCallback(async () => {
  let ok = 0;
  let failed = 0;
  const targets = items.filter(
    (i) =>
      typeof i.aiResult?.confidence === 'number' &&
      i.aiResult.confidence >= HIGH_CONFIDENCE_THRESHOLD,
  );
  for (const item of targets) {
    try {
      const type = item.aiResult?.suggestedType ?? 'note';
      if (type === 'trash') {
        dismiss(item.id);
      } else if (type === 'task') {
        await inboxRepo.convertToTask(item.id);
      } else if (type === 'project') {
        await inboxRepo.convertToProject(item.id);
      } else {
        await inboxRepo.convertToNote(item.id);
      }
      ok += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok, failed };
}, [items, dismiss]);
```

> Nota: el snippet usa `inboxRepo` directo en vez de los wrappers `convertToNote/Task/Project` del hook porque esos navegan por defecto. Validar en plan mode si conviene exponer un parámetro `skipNavigate` en los wrappers o llamar al repo directamente. Probable: directo al repo, los wrappers son para uso single-item.

## Decisiones de scope (anti-creep)

Documentadas explícitamente para que no vuelvan como tentación durante la implementación:

- **Threshold = 0.85 hardcodeado.** Constante en `useInbox.ts`. No setting de usuario en F26.
- **Sin script retroactivo.** Items pre-deploy quedan en bucket "Revisar" hasta procesarlos manualmente. No se re-dispara la CF para backfillearlos.
- **Sin selección múltiple manual** (checkboxes por item). Solo "todos los de alta confianza". Si emerge necesidad de control granular, se agrega después.
- **Sin auto-accept silencioso en background.** Inbox sigue siendo staging visible que el user abre y revisa. Decisión explícita: mantener modelo mental, evitar paradigm shift prematuro. Si tras 1 mes con F26.2 el bucket "Alta confianza" siempre acierta, ese cambio futuro tiene base sólida.
- **Confidence global, no por campo.** Un solo número que evalúa la clasificación completa (tipo + área + título). Más simple para el modelo y para el usuario.
- **Áreas dinámicas, review prompt, re-procesamiento** — fuera de F26. No son la fricción real reportada. Si emergen como problema, futuras features.

## Orden de implementación

1. **F26.1 primero** (CF + tipo + lectura). Sin esto, F26.2 no tiene buckets para agrupar.
2. **Deploy CF antes de codear F26.2** para empezar a generar items con `confidence` en el dataset real, así la UI tiene datos para validar manualmente.
3. **F26.2 después.**

## Verificación E2E

Con dev server (`npm run dev`) + Firebase MCP + Playwright MCP, UID `gYPP7NIo5JanxIbPqMe6nC3SQfE3`:

1. **F26.1 — confidence se persiste:**
   - Crear nuevo item via Quick Capture.
   - Esperar ~3-5s (CF async).
   - Verificar con Firebase MCP que `users/gYPP7NIo5JanxIbPqMe6nC3SQfE3/inbox/{itemId}` tiene `aiConfidence: <número 0-1>`.
   - Probar 3 capturas con grados de claridad distintos (ej. "comprar leche" debería ser >0.9, "explorar X concepto a futuro" debería ser <0.7).

2. **F26.2 — agrupación + batch accept:**
   - Abrir `/inbox`.
   - Confirmar dos secciones con counts correctos según el dataset actual.
   - Click "Aceptar N items" en bucket alto.
   - Verificar toast con `N aceptados, 0 fallaron` (idealmente).
   - Verificar que items procesados desaparecen del listado.
   - Verificar con Firebase MCP que `status` cambió a `processed` (o `dismissed` si era trash) en cada uno.
   - Verificar que items "Revisar" siguen ahí intactos.

3. **Regresión:**
   - Procesar manualmente un item del bucket "Revisar" via flujo single-item (`/inbox/process/...`). Debe funcionar idéntico a hoy.
   - Quick Capture sigue funcionando.

## Deploy pipeline al cerrar

- `npm run deploy:functions` — **obligatorio** (cambió `processInboxItem` + schema).
- `npm run build && npm run deploy` — UI cambió.
- Tauri: opcional (cambio 100% client-side sin tocar `src-tauri/`).
- Android: opcional (sin cambios en `android/`).

## Checklist

- [ ] F26.1 — schema CF actualizado con `confidence` (required).
- [ ] F26.1 — `processInboxItem.ts` system prompt + persiste `aiConfidence`.
- [ ] F26.1 — `InboxAiResult.confidence?` agregado.
- [ ] F26.1 — `useInbox` lee `aiConfidence`.
- [ ] F26.1 — Deploy CF + verificación E2E paso 1.
- [ ] F26.2 — `acceptHighConfidence` en `useInbox`.
- [ ] F26.2 — `/inbox` agrupa en 2 buckets + botón.
- [ ] F26.2 — Badge confidence en `InboxItem`.
- [ ] F26.2 — Verificación E2E pasos 2 y 3.
- [ ] Deploy hosting.
- [ ] Merge `--no-ff` a main.
- [ ] Step 8 SDD: archivar SPEC + escalar gotchas si aplica.
