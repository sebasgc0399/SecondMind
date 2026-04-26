# SPEC F27 — Cleanup deuda técnica QA Inbox+Notas

> Alcance: cerrar 3 ítems de deuda residual detectados en el QA del subsistema Inbox+Notas (Fases A+B post-F26).
> Dependencias: F26 (inbox-batch-confidence) ya merged y deployed.
> Estimado: medio día.
> Stack relevante: TypeScript strict, Firebase Functions v2 (Node 22), React + TinyBase.

---

## Objetivo

Cerrar deuda técnica acumulada que el QA destapó pero que no entró en los 2 paquetes de fix anteriores (`fix/baserepo-update-mutation` y `fix/inbox-batch-title-and-copy`). Los 3 ítems son chicos, ortogonales entre sí, y juntos forman un paquete coherente "post-QA cleanup" sin overlap con scope de feature.

**Excluido del scope** (evaluación aparte): `notesRepo.saveContent` sin retry/rollback en falla `updateDoc` (P1, fix serio = queue + UX feedback, scope grande). Queda en backlog.

---

## Features

### F27.1 — Borrar `relatedNoteIds` de `InboxAiResult` (campo muerto)

**Qué:** El tipo `InboxAiResult` declara `relatedNoteIds: string[]` pero el campo nunca se popula. La CF `processInboxItem` no lo incluye en `INBOX_CLASSIFICATION_SCHEMA`, los call sites lo pasan como `[]` literal, y la UI nunca lo lee. Eliminar la declaración + los 2 sites que lo populan.

**Criterio de done:**

- [ ] `grep -r "relatedNoteIds" src/` devuelve 0 matches.
- [ ] `tsc -b` (parte de `npm run build`) verde.
- [ ] Tests existentes verdes (no requiere tests nuevos — fix de cleanup, sin cambio de comportamiento).

**Archivos a modificar:**

- `src/types/inbox.ts` — eliminar campo `relatedNoteIds: string[]` de `InboxAiResult` (línea 24).
- `src/hooks/useInbox.ts` — eliminar `relatedNoteIds: []` del literal que construye `aiResult` (línea 70).
- `src/components/capture/InboxProcessorForm.tsx` — eliminar `relatedNoteIds: []` del literal que construye el `edited` initial state (línea 42).

**Notas de implementación:** ninguna — eliminación trivial, sin migración (no había datos persistidos).

---

### F27.2 — Borrar embedding stale cuando `contentPlain` queda vacío

**Qué:** En la CF `generateEmbedding`, cuando una nota queda con `contentPlain.trim() === ''` (el usuario borró todo el contenido), la CF hace early return sin borrar el embedding previo. El vector viejo sigue en `users/{uid}/embeddings/{noteId}` y surfacéa stale en `useSimilarNotes` y `useHybridSearch`. Cambiar el early return para que primero intente borrar el embedding si existe.

**Criterio de done:**

- [ ] Editar una nota que tenía contenido y borrar todo → tras el debounce + onSnapshot del client, el doc en `users/{uid}/embeddings/{noteId}` queda eliminado.
- [ ] Crear una nota vacía (sin tocar después) → no falla con "no such document" (delete idempotente: `.delete()` en doc inexistente es no-op).
- [ ] Logs estructurados de la CF muestran `generateEmbedding: empty content, deleted stale embedding` con `{ userId, noteId }` cuando aplica.
- [ ] `npm run deploy:functions` exitoso.

**Archivos a modificar:**

- `src/functions/src/embeddings/generateEmbedding.ts` — reemplazar el `if (!contentPlain) return;` (línea 27) por un bloque que borre el embedding si existe.

**Notas de implementación:**

- Patrón: `embeddingRef.delete()` es idempotente — borrar un doc inexistente no falla. Usar `.catch()` defensivo solo para loggear errores reales (cuotas, permisos), no para existence check.
- Mantener el guard del `contentHash` (líneas 33-36) — sigue siendo correcto cuando hay contenido.
- Ejemplo de la nueva ruta empty-content:

  ```ts
  if (!contentPlain) {
    const embeddingRef = admin.firestore().doc(`users/${userId}/embeddings/${noteId}`);
    await embeddingRef.delete().catch((err) => {
      logger.warn('generateEmbedding: delete stale embedding failed', {
        userId,
        noteId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    logger.info('generateEmbedding: empty content, deleted stale embedding', {
      userId,
      noteId,
    });
    return;
  }
  ```

---

### F27.3 — Cleanup `setTimeout` de `batchStatus` en unmount

**Qué:** En `src/app/inbox/page.tsx`, el handler `handleAcceptAll` (línea 73-78) hace `setTimeout(() => setBatchStatus({ kind: 'idle' }), 3000)` sin cleanup. Si el usuario navega antes de los 3s, el timer dispara `setBatchStatus` post-unmount → React warning. Extraer el reset a un `useEffect` con dep `[batchStatus.kind]` que limpie el timer en cleanup. Aplica el patrón canónico del gotcha F22 ("cleanup compartido entre side-effect y auto-dismiss timer").

**Criterio de done:**

- [ ] Aceptar batch en `/inbox` → navegar a otra ruta antes de los 3s → 0 warnings de "Can't perform a React state update on an unmounted component" en console.
- [ ] El label `"✓ N aceptados"` sigue apareciendo 3s cuando el componente queda montado (comportamiento UX preservado).
- [ ] Tests del proyecto verdes.

**Archivos a modificar:**

- `src/app/inbox/page.tsx` — sacar el `setTimeout` del callback `handleAcceptAll`; agregar `useEffect` con dep `[batchStatus.kind]` que arme + limpie el timer cuando el state pasa a `'done'`.

**Notas de implementación:**

- Patrón canónico (gotcha F22 vigente en `Spec/ESTADO-ACTUAL.md`): el timer va en su propio `useEffect`, no compartido con el side-effect que lo dispara. Patrón vivo en [`DistillLevelBanner.tsx`](../../src/components/editor/DistillLevelBanner.tsx).
- Esqueleto:

  ```tsx
  useEffect(() => {
    if (batchStatus.kind !== 'done') return;
    const id = window.setTimeout(() => setBatchStatus({ kind: 'idle' }), 3000);
    return () => window.clearTimeout(id);
  }, [batchStatus.kind]);
  ```

- `handleAcceptAll` queda solo con: `setBatchStatus({ kind: 'processing' }) → await → setBatchStatus({ kind: 'done', ...result })`. El reset a idle lo gobierna el `useEffect`.

---

## Orden de implementación

1. **F27.1** primero — cleanup puro, sin riesgo, baseline limpia para los siguientes commits.
2. **F27.3** segundo — UI client-side, no toca CFs ni rules. Validable con build + manual smoke en `/inbox`.
3. **F27.2** último — toca Cloud Functions, requiere `npm run deploy:functions` al cierre. Aislarlo al final para que un retraso del deploy no bloquee F27.1/F27.3.

Las 3 features son independientes (sin dependencias cruzadas), pero el orden anterior minimiza el blast radius de cada commit.

---

## Estructura de archivos

No se crean archivos nuevos. Solo modificaciones a:

```
src/
├── types/inbox.ts                                       # F27.1
├── hooks/useInbox.ts                                    # F27.1
├── components/capture/InboxProcessorForm.tsx            # F27.1
├── app/inbox/page.tsx                                   # F27.3
└── functions/src/embeddings/generateEmbedding.ts        # F27.2
```

---

## Checklist global

Al terminar la fase, TODAS estas condiciones deben ser verdaderas:

- [ ] F27.1, F27.2, F27.3 con sus criterios de done individuales cumplidos.
- [ ] `npm run build` verde (TS strict + Vite).
- [ ] `npm test` verde (suite completa, sin tests nuevos requeridos).
- [ ] `npm run lint` no introduce errores nuevos en los archivos tocados (errors pre-existentes en otros archivos quedan fuera de scope).
- [ ] CFs deployadas: `npm run deploy:functions` exitoso (necesario por F27.2).
- [ ] Hosting deployado: `npm run build && npm run deploy` exitoso (cambios client-side de F27.1/F27.3).
- [ ] Rama `feat/cleanup-deuda-qa` mergeada `--no-ff` a `main` y pusheada a origin.
- [ ] SPEC archivado a registro de implementación (formato compacto post-cierre).
- [ ] `Spec/ESTADO-ACTUAL.md` revisado: ¿algún hallazgo nuevo de implementación que valga escalar como gotcha cross-feature? Si no, no tocar.

---

## Siguiente fase

No hay siguiente fase planeada. La próxima feature se decide post-F27 según prioridad real. Candidatos vigentes en `Spec/ESTADO-ACTUAL.md` sección "Candidatos próximos" + el ítem P1 `saveContent` retry/rollback que quedó fuera del scope de este SPEC.
