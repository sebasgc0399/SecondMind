# SPEC F38 — Clean Arch cleanup post-F37

> Estado: pendiente
> Branch: `feat/clean-arch-cleanup-f38`
> Pre-requisitos: working tree limpio en main, branch creada.

## Objetivo

Cerrar las 3 deudas localizadas detectadas en el audit Clean Arch post-F37 + agregar un guard rail (ESLint) que prevenga drift futuro. La arquitectura no cambia (siguen las 4 capas; siguen los 6 repos sobre el factory `createFirestoreRepo` introducido en F10). El valor de F38 es **higiene + guardia**: hoy `src/components/**` ya está 100% limpio de imports `firebase/firestore`, pero hay 3 archivos fuera de capa-3 que tocan Firestore directo y nada impide que aparezcan más. El audit detectó:

1. **`src/lib/editor/syncLinks.ts` (126 líneas)** — capa 3 mal ubicada. Hace `setDoc/deleteDoc` a `links/` + cross-entity `notesStore.setPartialRow` para `incomingLinkIds`. Nació pre-F10 y nunca migró.
2. **`src/hooks/useNoteSuggestions.ts:3`** — `onSnapshot` directo a Firestore para 3 campos solo-en-Firestore (`suggestedNoteType`, `noteTypeConfidence`, `dismissedSuggestions`). Los writes ya van vía `notesRepo`; las lecturas filtran. NO documentado en `Docs/04 § Excepciones reconocidas`.
3. **`src/app/capture/page.tsx:64`** — page de la ventana Tauri capture hace `setDoc` directo a `users/{uid}/inbox/{id}` saltándose `inboxRepo`.

Más una falta estructural: la regla ESLint `no-restricted-imports` recomendada por `Docs/04 § Reglas a setear desde el principio` (#1) nunca se implementó. Hoy el proyecto cumple por disciplina, no por enforcement.

**Descartado tras audit:** reestructurar a `src/features/<feature>/` (cohabitan UI + hook + repo + types por feature). Los hooks (41) y repos (6) se comparten activamente entre features, así que la migración produciría un `shared/` igual de grande sin beneficio neto. La estructura híbrida actual (componentes split por feature, hooks/repos/types por tipo) coincide con el patrón documentado en `Docs/04 § Modularización por feature vs por tipo`.

**Out of scope:** migrar `lib/preferences.ts` a un `preferencesRepo` formal. Hoy son 4 prefs (al borde del threshold N>3 documentado in-place), pero migrar requiere decidir entre tabla TinyBase via persister vs mantener doc-único — es feature aparte, no cleanup.

---

## F38.1 — `linksRepo` + decisión arquitectónica cross-entity

### Decisión a tomar (Plan mode obligatorio)

`syncLinks` actual orquesta DOS entidades en una sola función:

- **Firestore writes** sobre `users/{uid}/links/{linkId}` — `setDoc` paralelo para nuevos, `deleteDoc` para borrados.
- **TinyBase mutation** sobre `notesStore` — actualiza `incomingLinkIds` de cada target afectado (sin write a Firestore; el persister F12 diff-based propaga eventualmente).

Mover el código crudo a `linksRepo` rompe el contrato del factory `createFirestoreRepo` ("cada repo toca solo su propia entidad/store"). El SPEC NO prescribe la solución — Plan mode debe elegir entre estas 3 opciones con un Plan agent dedicado:

**Opción A — `linksRepo` estándar + módulo orquestador en `src/infra/`:**

- `src/infra/repos/linksRepo.ts` con factory `createFirestoreRepo<LinkRow>` (CRUD vanilla: `createLink`, `deleteLink`, `listLinksForSource`).
- Nuevo `src/infra/syncLinksFromEditor.ts` (sin subcarpeta `operations/` — YAGNI, mismo criterio que aplicamos para descartar `src/features/`) que orquesta `linksRepo` + actualización de `incomingLinkIds` en `notesStore` (o `notesRepo.updateMeta` si se decide ir vía repo en lugar de TinyBase directo). Si aparece un segundo caso cross-entity con shape similar, extraer entonces a `src/infra/operations/`.
- Pro: separación de concerns clara. Cada repo atómico, la orquestación es explícita y testeable aparte.
- Contra: el archivo queda en el raíz de `src/infra/` que hoy solo contiene `repos/`. Convive bien con `Docs/04 § Mapping completo` (Capa 3 vive en `src/infra/repos/`) porque el orquestador también es Capa 3, solo cross-entity. `inboxRepo.convertToNote` también es cross-entity pero está dentro del repo "dueño del flujo" (`Docs/04 § Flujo avanzado`); links no tiene un dueño obvio.

**Opción B — `linksRepo` NO estándar (custom, sin factory):**

- `src/infra/repos/linksRepo.ts` con método `syncLinksFromEditor(input)` que hace todo (Firestore writes + TinyBase mutations sobre notesStore), sin pasar por el factory.
- Pro: trade-off honesto — el caso es genuinamente cross-entity y atómico (4 writes paralelos hoy con `Promise.all`). Acepta que el factory no aplica a todos los repos.
- Contra: primer repo que rompe el patrón "todos usan el factory". Establece precedente que puede crecer si nuevas operaciones cross-entity se agregan al patrón.

**Opción C — `linksRepo` standard + métodos en `notesRepo` para incomingLinkIds (DEBILITADA, incluida por completitud):**

- `src/infra/repos/linksRepo.ts` con `syncLinks(sourceId, sourceTitle, userId, newLinks)` que solo toca colección `links/` (sin tocar `notesStore`).
- `notesRepo.updateIncomingLinks(targetId, sourceId, isIncoming: boolean)` — método nuevo que hace `setPartialRow` sobre `incomingLinkIds`. No setDoc — confía en el persister F12.
- `useNoteSave` (caller actual) llama `await linksRepo.syncLinks(...)` y luego itera affectedTargets llamando `notesRepo.updateIncomingLinks(...)` por cada uno.
- Pro: cada repo toca solo su entidad. APIs simples. Sin concepto nuevo.
- Contra (fuerte): el cálculo del diff (links extraídos del editor vs links existentes en `linksStore` filtrados por sourceId) hoy vive dentro de `syncLinks`. Si `linksRepo.syncLinks` mantiene el diff interno, debe **retornar el resultado al caller** (`{ addedTargets, removedTargets }`) para que `useNoteSave` itere `notesRepo.updateIncomingLinks`. Eso fuerza al hook a conocer la lógica de diffing — exactamente lo que la capa 3 debe esconder. Alternativa "linksRepo triggea updateIncomingLinks desde adentro" desplaza el problema en lugar de resolverlo (linksRepo termina cross-llamando notesRepo, mismo cross-coupling pero invertido). Atomicidad parcial-fail también empeora (1 + N writes en lugar de Promise.all). Esta opción queda **NO recomendada** — incluida porque el SPEC merece dejar las 3 alternativas explícitas para que Plan mode lo confirme con datos.

**Recomendación inicial (revisable en Plan mode):** Opción A pragmática (orquestador en `src/infra/syncLinksFromEditor.ts`, sin subcarpeta `operations/`). Razones: (a) hace explícita la naturaleza cross-entity en lugar de esconderla dentro de un repo; (b) el module-name ya documenta "esto orquesta múltiples entidades, esperá efectos cross-store"; (c) Opción C queda debilitada por el problema del diffing (ver contra arriba); (d) Opción B establece precedente "repos sin factory" que conviene evitar mientras no haya un segundo caso. Plan agent debe validar contra los gotchas de F10/F12 (write amplification, persister diff-based) antes de cerrar la decisión.

### Una vez decidida la opción, sub-features

| Qué                                                  | Criterio                                                                                                                                                                  | Archivo                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Crear `linksRepo` (forma según opción elegida)       | API pública estable; tests del repo (paridad con `baseRepo.test.ts` para opción A; tests específicos para B/C)                                                            | `src/infra/repos/linksRepo.ts`, `src/infra/repos/linksRepo.test.ts`         |
| (Si Opción A) Crear módulo orquestador               | `syncLinksFromEditor(input): Promise<SyncLinksResult>` con misma firma que el actual `syncLinks`; tests del orquestador                                                   | `src/infra/syncLinksFromEditor.ts`, `src/infra/syncLinksFromEditor.test.ts` |
| Migrar callers                                       | `useNoteSave.ts:5` cambia import; firma del caller idéntica para no tocar consumers                                                                                       | `src/hooks/useNoteSave.ts`                                                  |
| Borrar `lib/editor/syncLinks.ts`                     | Archivo eliminado; sin imports residuales (grep `from '@/lib/editor/syncLinks'`)                                                                                          | `src/lib/editor/syncLinks.ts` (delete)                                      |
| Actualizar gotcha "linksRepo cross-entity" si aplica | Si la decisión introduce patrón nuevo (Opción A o B), agregar gotcha en `Spec/gotchas/relaciones-entidades.md` (no `tinybase-firestore`); actualizar índice ESTADO-ACTUAL | `Spec/gotchas/relaciones-entidades.md`, `Spec/ESTADO-ACTUAL.md`             |

**Snippet referencia (Opción A — orquestador):**

```typescript
// src/infra/syncLinksFromEditor.ts
import { linksRepo } from '@/infra/repos/linksRepo';
import { notesStore } from '@/stores/notesStore';
import { parseIds, stringifyIds } from '@/lib/tinybase';
import type { ExtractedLink } from '@/lib/editor/extractLinks';

export interface SyncLinksFromEditorInput {
  sourceId: string;
  sourceTitle: string;
  userId: string;
  newLinks: ExtractedLink[];
}

export interface SyncLinksFromEditorResult {
  outgoingLinkIds: string[];
  linkCount: number;
}

export async function syncLinksFromEditor(
  input: SyncLinksFromEditorInput,
): Promise<SyncLinksFromEditorResult> {
  // 1. Diff cálculo (filtrar self-links, dedupear, comparar con linksStore)
  // 2. await linksRepo.syncLinks(...) — Firestore writes paralelos
  // 3. Actualizar incomingLinkIds de affectedTargets en notesStore
  //    (persister F12 propaga eventually; consistente con el comportamiento actual)
  // ...
}
```

---

## F38.2 — `notesRepo.subscribeSuggestions` + migración `useNoteSuggestions`

| Qué                                                 | Criterio                                                                                                                                                                           | Archivo                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Agregar método de suscripción al notesRepo          | Firma `subscribeSuggestions(noteId, callback): () => void`. Internamente hace `onSnapshot` sobre `users/{uid}/notes/{noteId}` y entrega los 3 campos solo-en-Firestore al callback | `src/infra/repos/notesRepo.ts`          |
| Migrar `useNoteSuggestions` para consumir el método | Hook ya no importa `firebase/firestore` ni `db`/`auth`; usa `notesRepo.subscribeSuggestions(noteId, ...)` en el `useEffect` de subscribe                                           | `src/hooks/useNoteSuggestions.ts`       |
| Actualizar tests                                    | `useNoteSuggestions.test.tsx` mockea `notesRepo.subscribeSuggestions` (no `firebase/firestore` directo); cobertura sin regresión                                                   | `src/hooks/useNoteSuggestions.test.tsx` |

**Criterio de done:** `grep -r "from 'firebase/firestore'" src/hooks/useNoteSuggestions.ts` retorna 0 matches.

**Snippet referencia:**

```typescript
// notesRepo.ts — método nuevo
export interface NoteSuggestionsSnapshot {
  suggestedNoteType: NoteType | undefined;
  noteTypeConfidence: number | undefined;
  dismissedSuggestions: string[];
}

function subscribeSuggestions(
  noteId: string,
  callback: (snapshot: NoteSuggestionsSnapshot) => void,
): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) return () => {};
  const ref = doc(db, `users/${uid}/notes/${noteId}`);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      callback({
        suggestedNoteType: data?.suggestedNoteType as NoteType | undefined,
        noteTypeConfidence:
          typeof data?.noteTypeConfidence === 'number' ? data.noteTypeConfidence : undefined,
        dismissedSuggestions: Array.isArray(data?.dismissedSuggestions)
          ? (data.dismissedSuggestions as string[])
          : [],
      });
    },
    (error) => {
      console.error('[notesRepo] subscribeSuggestions error', error);
    },
  );
}

export const notesRepo = {
  // ...,
  subscribeSuggestions,
};
```

**Nota — re-renders por write a la nota:** `subscribeSuggestions` escucha el doc completo, así que cualquier write a la nota (cambio de título, tags, distillLevel, autoTagNote CF, etc.) dispara el callback aunque los 3 campos relevantes no hayan cambiado. Hoy no es problema de rendimiento (single-user, banner de sugerencias rara vez visible), pero si el re-render del banner se vuelve perceptible en uso real, considerar comparación shallow en el callback (early-return si los 3 campos coinciden con el snapshot anterior) o `query` con select del lado Firestore. NO implementar la optimización en F38.2 — agregar gotcha en `Spec/gotchas/relaciones-entidades.md` solo si la fricción se materializa.

---

## F38.3 — `inboxRepo.createFromCapture` + migración `app/capture/page.tsx`

| Qué                                                          | Criterio                                                                                                                                                                                                                                                                 | Archivo                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Agregar `createFromCapture(rawContent, source)` al inboxRepo | Internamente usa el factory `repo.create(...)` con `source: 'desktop-capture' \| 'web-clip' \| ...`; obtiene retry queue gratis (F29/F30 protect creates)                                                                                                                | `src/infra/repos/inboxRepo.ts`                                                             |
| Migrar `capture/page.tsx`                                    | `handleSave` llama `await inboxRepo.createFromCapture(trimmed, 'desktop-capture')`; el page ya no importa `setDoc/doc/serverTimestamp` ni `db`. `serverTimestamp()` reemplazado por `Date.now()` (consistente con resto de optimistic writes desde el cliente vía repos) | `src/app/capture/page.tsx`                                                                 |
| Verificar Chrome Extension / Share Intent / QuickCapture     | Auditar otros entrypoints que escriben a inbox (extension/, useShareIntent, QuickCaptureProvider). Si alguno usa `setDoc` directo, migrar también; si ya usan algún path canónico, documentar. NO modificar la extension fuera del repo                                  | `src/components/capture/QuickCaptureProvider.tsx`, `src/hooks/useShareIntent.ts` (revisar) |

**Criterio de done:** `grep -r "from 'firebase/firestore'" src/app/capture/page.tsx` retorna 0 matches.

**Snippet referencia:**

```typescript
// inboxRepo.ts — método nuevo
async function createFromCapture(
  rawContent: string,
  source: 'desktop-capture' | 'web-clip' | 'share-intent' | 'quick-capture',
): Promise<string> {
  const itemId = crypto.randomUUID();
  const row: InboxRow = {
    id: itemId,
    rawContent,
    source,
    status: 'pending',
    aiProcessed: false,
    createdAt: Date.now(),
    // ... resto de defaults del schema InboxRow
  };
  return repo.create(row, { id: itemId });
}
```

---

## F38.4 — ESLint `no-restricted-imports` (guard rail)

Sin esta regla, F38.1-F38.3 corrigen los 3 puntos actuales pero nada impide que aparezcan nuevamente. La regla cierra el bucle.

| Qué                                                                               | Criterio                                                                                                                                                                                                                                                                                                                  | Archivo                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Agregar `no-restricted-imports` rule sobre `firebase/firestore` y `firebase/auth` | Bloquear el import en `src/components/**` y `src/hooks/**`. Excepción explícita `useNote.ts` (excepción documentada `Docs/04 § Excepciones reconocidas`). Excepción explícita `useAuth.ts` para `firebase/auth`. Si nuevas excepciones necesarias, agregarlas con comentario `// CLEAN-ARCH-EXCEPTION` con justificación. | `eslint.config.js`                       |
| Validar que `npm run lint` pasa post-F38.1-F38.3                                  | Lint clean en CI; sin warnings nuevos                                                                                                                                                                                                                                                                                     | (ninguno)                                |
| Documentar la regla                                                               | Mencionar en `Docs/04 § Reglas a setear desde el principio` que la regla #1 ya está implementada (nota in-place); update a `Docs/03 § Convenciones y patrones` si toca                                                                                                                                                    | `Docs/04-clean-architecture-frontend.md` |

**Criterio de done:** un import nuevo de `firebase/firestore` agregado manualmente a un archivo en `src/components/**` o `src/hooks/**` (excepto excepciones) hace fallar `npm run lint`.

**Snippet referencia (ESLint flat config):**

```javascript
// eslint.config.js (recordar: ESLint 9 flat config, no .eslintrc.cjs — gotcha universal)
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // ... configs existentes
  {
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    // Glob patterns explícitos para los ignores. ESLint 9 flat config
    // resuelve los ignores per-config relativos al config file, pero usar
    // globs (`**/useNote.ts`) en lugar de paths literales
    // (`src/hooks/useNote.ts`) es más portable y resistente a
    // re-organizaciones. Validar en implementación con:
    //   npx eslint --debug src/hooks/useNote.ts        → debe quedar excluido
    //   npx eslint --debug src/hooks/useNoteSearch.ts  → debe lintearse
    ignores: [
      '**/useNote.ts', // Excepción documentada — lectura one-shot MVP (Docs/04)
      '**/useAuth.ts', // Excepción documentada — auth multi-platform (Docs/04)
      '**/*.test.{ts,tsx}', // Tests pueden mockear directamente
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase/firestore',
              message:
                'Capa 2 (components/hooks) no debe importar Firestore directo. Usar un repo en src/infra/repos/. Ver Docs/04-clean-architecture-frontend.md.',
            },
            {
              name: 'firebase/auth',
              message:
                'Capa 2 no debe importar firebase/auth. Usar useAuth (hook) o un repo. Ver Docs/04.',
            },
          ],
        },
      ],
    },
  },
);
```

---

## Orden de implementación

1. **F38.1 primero** — la decisión arquitectónica más pesada. Plan mode dedicado: 1 Explore agent (mapear consumers de `syncLinks`/`linksStore`/`incomingLinkIds`), 1 Plan agent (validar opción A/B/C contra gotchas F10/F12 + write amplification), commit.
2. **F38.2** — método del repo + migración hook.
3. **F38.3** — método del repo + migración page Tauri.
4. **F38.4 al final** — agrega la regla cuando ya no hay violaciones que toquen excepciones temporales. Si la pongo primero, F38.1-F38.3 requieren `eslint-disable-line` que se remueven después → ruido innecesario.

Cada sub-feature es un commit atómico Conventional. Suite de tests (`npm test`) debe pasar tras cada commit.

---

## Verificación E2E (al cerrar la branch)

- **Editor wikilinks (F38.1):** crear nota A con `[[B]]`, verificar que `linksStore` tiene el row, que `notesB.incomingLinkIds` incluye `noteA.id`. Editar A removiendo el wikilink, verificar que el link desaparece del store y que `incomingLinkIds` se vacía. Probar en Tauri desktop también (mismo flujo, verificar que el persister F12 propaga sin regresión).
- **Sugerencias de tipo (F38.2):** abrir una nota fleeting con confidence ≥0.7 desde la CF, verificar que el banner aparece. Aceptar la sugerencia, verificar que `noteType` cambia y el banner desaparece. Refrescar, verificar persistencia.
- **Captura desktop (F38.3):** abrir Tauri, `Ctrl+Shift+Space`, escribir texto, Enter, verificar que aparece en `/inbox` con `source: 'desktop-capture'`. Verificar que el indicator de sync (`PendingSyncIndicator`) refleja el queue (gracia colateral de F30: la captura ahora es retry-protected).
- **ESLint guard (F38.4):** agregar manualmente `import { doc } from 'firebase/firestore';` a un archivo de prueba en `src/components/`, verificar que `npm run lint` falla. Remover el import, verificar que el lint pasa.

---

## Checklist

- [ ] Branch `feat/clean-arch-cleanup-f38` creada (ya hecho).
- [ ] Plan mode F38.1: Explore + Plan agents → decidir opción A/B/C.
- [ ] F38.1: `linksRepo.ts` + (orquestador si aplica) + tests + migración `useNoteSave` + delete `lib/editor/syncLinks.ts` + commit.
- [ ] F38.2: `notesRepo.subscribeSuggestions` + migración `useNoteSuggestions` + tests + commit.
- [ ] F38.3: `inboxRepo.createFromCapture` + migración `app/capture/page.tsx` + audit otros entrypoints inbox + commit.
- [ ] F38.4: ESLint rule + verificación lint clean + nota en `Docs/04` + commit.
- [ ] E2E: 4 verificaciones (wikilinks, suggestions, capture desktop, ESLint guard).
- [ ] Deploy pipeline: `npm run build && npm run deploy` (hosting). Tauri y Capacitor opcionales (cambios 100% client-side, no tocan `src-tauri/` ni `android/`).
- [ ] Merge `--no-ff` a main + push.
- [ ] Step 8 SDD: convertir SPEC a registro de implementación; aplicar regla escalación de gotchas (Plan mode F38.1 puede generar gotcha cross-entity nuevo en `Spec/gotchas/relaciones-entidades.md` + índice ESTADO-ACTUAL).

---

## Referencias

- `Docs/04-clean-architecture-frontend.md` — doc canónico de las 4 capas + excepciones reconocidas + reglas recomendadas.
- `Spec/features/SPEC-feature-10-repos-layer.md` — introducción del repo layer; precedente para esta feature.
- `Spec/gotchas/tinybase-firestore.md` — gotchas activos sobre el patrón optimistic, factory, queue.
- `Spec/gotchas/relaciones-entidades.md` — destino probable del gotcha F38.1 si la decisión introduce patrón nuevo cross-entity.
