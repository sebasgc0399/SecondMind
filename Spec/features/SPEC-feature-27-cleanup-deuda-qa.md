# SPEC F27 — Cleanup deuda QA Inbox+Notas (Registro de implementación)

> Estado: Completada abril 2026
> Commits: `c6f927f` SPEC, `3c782f1` F27.1 borrar `relatedNoteIds`, `d268602` F27.3 cleanup setTimeout batchStatus, `d9f97e9` F27.2 borrar embedding stale, `44e1d4a` merge.
> Gotchas operativos vigentes → `Spec/ESTADO-ACTUAL.md`

## Objetivo

Cerrar 3 ítems de deuda residual destapados por el QA del subsistema Inbox+Notas (Fases A+B post-F26 + post-fix de paquetes 1 y 2). Los 3 son ortogonales entre sí, chicos, y juntos forman un paquete coherente "post-QA cleanup" sin overlap con scope de feature.

Excluido por scope grande (evaluación aparte): `notesRepo.saveContent` retry/rollback en falla `updateDoc` (P1, requiere queue + UX feedback).

## Qué se implementó

- **F27.1 — Borrar campo muerto `relatedNoteIds`:** declarado en `InboxAiResult` pero nunca poblado por la CF `processInboxItem` (no estaba en `INBOX_CLASSIFICATION_SCHEMA`) ni consumido por la UI. 3 sites limpiados: `src/types/inbox.ts:24` (declaración), `src/hooks/useInbox.ts:70` (literal `[]` al construir aiResult desde TinyBase), `src/components/capture/InboxProcessorForm.tsx:42` (literal `[]` en initial state del draft). Sin migración: el campo nunca se persistió en Firestore.

- **F27.3 — Cleanup `setTimeout` de `batchStatus` en unmount:** el reset a `idle` tras 3s vivía dentro del callback `handleAcceptAll` sin cleanup. Si el usuario navegaba antes de los 3s, el timer disparaba `setState` post-unmount → React warning. Fix: extraer el reset a `useEffect` con dep `[batchStatus.kind]`, patrón canónico de gotcha F22 ("cleanup compartido entre side-effect y auto-dismiss timer = anti-pattern"; vivo en `DistillLevelBanner.tsx:67-71`). `handleAcceptAll` queda solo con `processing → await → done`; el reset a idle lo gobierna el effect. Archivos: `src/app/inbox/page.tsx`.

- **F27.2 — Borrar embedding stale con `contentPlain` vacío:** la CF `generateEmbedding` (Firebase Functions v2 `onDocumentWritten`) hacía early return cuando `contentPlain.trim() === ''` sin borrar el doc previo en `users/{uid}/embeddings/{noteId}`. El vector viejo seguía surfaceando en `useSimilarNotes` y `useHybridSearch`. Fix: mover `embeddingRef` y `existingDoc.get()` antes del split de paths, y reescribir el early return como `if (existingDoc.exists) await embeddingRef.delete().catch(...)` + `logger.info` estructurado. El guard `existingDoc.exists` (refinamiento sobre el SPEC original) evita log spam en el flujo "Nueva nota desde dashboard" donde `processInboxItem`-style writes vacíos no necesitan loggear nada. Archivos: `src/functions/src/embeddings/generateEmbedding.ts`.

E2E validado en producción:

- F27.3 con Playwright: aceptar batch de 2 items + navegar a `/notes` antes de los 3s → 0 React warnings de "Can't perform a React state update on an unmounted component".
- F27.2 con Firebase MCP: nota nueva con contenido → embedding generado en `users/{uid}/embeddings/{noteId}` (con `vector` + `contentHash` + `model`) → vaciar contentPlain (Ctrl+A + Delete) → wait autosave (2s) + CF (~3s) → embedding doc not found ✅.

## Decisiones clave

| ID  | Decisión                                                                                | Por qué                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | F27.2: mover `embeddingRef` y `existingDoc.get()` antes del split de paths.             | `admin.firestore().doc(...)` es construcción puramente sintáctica (cero I/O). Reusarla evita duplicar la declaración entre el path vacío y el path con contenido. Costo: 1 `.get()` extra para writes con `contentPlain === ''` (raros). Beneficio: legibilidad. |
| D2  | F27.2: agregar guard `if (existingDoc.exists)` antes del delete + log (refinó el SPEC). | `onDocumentWritten` también dispara en CREATE de nota vacía (flujo "Nueva nota desde dashboard"). Sin guard, cada create vacío spammeaba `logger.info`. Con guard, el log solo aparece cuando realmente borramos algo stale.                                     |
| D3  | F27.1: 1 commit para los 3 sites (no 3 commits chicos).                                 | Es UN cambio conceptual (eliminar campo muerto). Bisect-friendly. Fragmentar en 3 commits aporta ruido sin valor.                                                                                                                                                |
| D4  | F27.2 sin functions emulator local: smoke E2E directo en producción post-deploy.        | Montar emulator con mock OpenAI = scope alto. SecondMind no tiene staging Firebase. El fix es un if-block; riesgo bajo, validación post-deploy alcanza con UID test `gYPP7NIo5JanxIbPqMe6nC3SQfE3`.                                                              |
| D5  | F27.3 sin tests unitarios nuevos.                                                       | El patrón es match exacto al canónico de `DistillLevelBanner.tsx`, ya cubierto por su uso real. Tests del componente entero serían más útiles, fuera de scope.                                                                                                   |
| D6  | Anti-patrones residuales detectados (QuickCapture, capture/page) NO escalan a F27.      | Plan agent detectó 3 más vía grep (`setTimeout` sin cleanup en handlers). Quedan como observación backlog, no se fixean acá para mantener el paquete acotado y reversible. Si emergen como bug real, ticket dedicado.                                            |

## Lecciones

- **Construcción de `DocumentReference` Firestore es side-effect free.** Mover `admin.firestore().doc(...)` arriba de un early return es 100% safe (no hace I/O hasta que invocás `.get()`/`.set()`/`.delete()`). Aplicable a cualquier refactor que quiera centralizar el ref antes de un split de paths.

- **`onDocumentWritten` dispara en create + update + delete.** En CFs que reaccionan a content para mantener artefactos derivados (embeddings, índices, summaries cached), el path "vacío post-update" tiene que limpiar lo que se escribió antes. Pero ojo: el path "create vacío" también dispara — guard con `existingDoc.exists` evita log spam y round-trips innecesarios. Patrón aplicable a `onDocumentWritten` con artefactos derivados (futuras CFs sobre `users/{uid}/notes/`, `inbox/`, `tasks/` que generen embeddings/summaries/etc.).

- **`.delete()` en Firestore Admin SDK es idempotente.** Borrar un doc inexistente es no-op, no rejecta. El `.catch()` solo cubre errores reales (quotas, permissions, network). Permite escribir paths defensivos sin existence-check previo cuando log spam no importa.

- **El patrón canónico de auto-dismiss timer es: timer en `useEffect` separado del side-effect que lo dispara, dep en el state monitorizado, cleanup `clearTimeout` en return.** Match exacto a `DistillLevelBanner.tsx`. Cualquier nuevo auto-dismiss UI debe seguir esta estructura literal — no improvisar variantes con `useRef + setTimeout en handler`.

- **`window.setTimeout` (no `setTimeout`) garantiza tipo `number` en TS.** En Node-aware envs (vitest con `@types/node` cargados globalmente), `setTimeout` global puede inferirse como `NodeJS.Timeout`, lo que rompe `clearTimeout(id)` con tipo `number`. Prefijar `window.` es defensivo y consistente con el patrón canónico.

- **Plan agent acotado vale para fixes triviales pero ortogonales.** Para 3 cambios chicos pero sobre dominios distintos (types, UI hook, Cloud Function), el Plan agent atrapó 1 refinamiento real (guard de existencia) + validó decisiones de placement + sugirió orden de commits + detectó anti-patrones residuales fuera del scope. Costo: ~30s de prompt; beneficio: evitar gotcha sutil del log spam y tener una trail explícita de razones por commit.

- **F27 no introduce gotchas cross-feature nuevos.** El refinamiento de F27.2 (guard de existencia + log spam) es específico al dominio embeddings/CFs y ya está documentado en el commit + este SPEC; no escala a `ESTADO-ACTUAL.md` porque no se aplica a otra feature actualmente. El patrón de timer cleanup (F27.3) ya estaba escalado como gotcha F22. Conclusión: cerrar el paquete sin tocar `ESTADO-ACTUAL.md` salvo el pointer de fase completada.
