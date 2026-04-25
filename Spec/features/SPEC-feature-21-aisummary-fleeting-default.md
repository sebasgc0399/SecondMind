# SPEC Feature 21 — Eliminar defaultNoteType + Surfacear aiSummary

> Estado: en implementación · Branch: `feat/notes-aisummary-fleeting-default`
> Dependencias: F18 (NoteOramaDoc base), F20 (introdujo `defaultNoteType` que ahora se revierte), CFs `autoTagNote` ya genera `aiSummary` desde fases previas.

---

## Objetivo

Cerrar dos cabos sueltos del flujo de notas tras dogfooding de F20:

1. **Revertir la preferencia manual `defaultNoteType`** introducida en F20 (F3/F4 de ese SPEC). Toda nota nueva nace como `'fleeting'` siguiendo el método Zettelkasten clásico — la captura cruda se promueve después manualmente o por AI (F22+). Una "preferencia" que el usuario querría cambiar varias veces al día no es preferencia, es selector mal ubicado.
2. **Surfacear el `aiSummary` huérfano** que genera la CF `autoTagNote`. Hoy se persiste en Firestore pero no se muestra en ningún lado. Renderizarlo como segunda línea en `NoteCard` con tratamiento visual de AI (itálica + ícono Sparkles) para que aporte valor en escaneo de lista.

## Contexto y decisiones cerradas en discovery

Discusión completa en la conversación previa. Decisiones canónicas:

1. **Toda nota nace `'fleeting'`** — no hay default configurable, no hay selector inline.
2. **Mantener los 3 tipos (`fleeting | literature | permanent`)** — agregar MOC/Index queda fuera de alcance hasta que dogfooding lo pida.
3. **`aiSummary` se renderiza en `NoteCard` (lista) como segunda línea bajo `contentPlain`**, itálica + Sparkles. Tratamiento visual debe diferenciarlo del contenido del usuario (P6: AI copiloto, no piloto).
4. **`aiSummary` NO se renderiza en la detail page de la nota** — el detail ya tiene el contenido completo, summary sería redundante.
5. **`aiSummary` NO se renderiza en trash mode** — nota en papelera está fuera de flujo activo. `TrashNote` no incluye el campo y se mantiene así.
6. **Re-procesamiento de `aiSummary` cuando la nota se edita queda fuera de alcance.** `autoTagNote` solo corre si `aiProcessed=false`. El summary puede quedar stale tras ediciones — se documenta como gotcha en `ESTADO-ACTUAL.md` y se aborda cuando duela en uso real (F22+).
7. **No migrar notas existentes** que tengan `noteType=permanent` o `literature` por defaults previos. El campo es del usuario una vez creado; solo cambia el comportamiento de creación nueva.

## Sub-features

| #   | Qué                                                | Criterio de done                                                                                                                                                   | Archivos a tocar                                                                            |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| F1  | Quitar `defaultNoteType` del modelo de Preferences | `UserPreferences` ya no tiene el campo. `parsePrefs` ya no lo lee/valida. `DEFAULT_PREFERENCES` reducido. `VALID_NOTE_TYPES` eliminado. TypeScript compila limpio. | `src/types/preferences.ts`, `src/lib/preferences.ts`                                        |
| F2  | Eliminar UI del selector de Settings               | Sección `id="notes"` removida de Settings. Componente `DefaultNoteTypeSelector.tsx` borrado. Imports limpios. Settings sigue scrolleando a `#trash` correctamente. | `src/app/settings/page.tsx`, `src/components/settings/DefaultNoteTypeSelector.tsx` (DELETE) |
| F3  | Hardcodear `noteType='fleeting'` en creación       | `NoteCreateOverrides.noteType` removido. `createNote` siempre crea con `'fleeting'`. `handleCreate` en `/notes` ya no pasa `preferences.defaultNoteType`.          | `src/infra/repos/notesRepo.ts`, `src/app/notes/page.tsx`                                    |
| F4  | Agregar `aiSummary` al schema Orama                | `NOTES_SCHEMA` incluye `aiSummary: 'string'`. `NoteOramaDoc.aiSummary: string`. `rowToOramaDoc` setea con default `''`. Index reconstruye sin errores.             | `src/lib/orama.ts`                                                                          |
| F5  | Renderizar `aiSummary` en `NoteCard`               | Cuando `note.aiSummary` no vacío y `mode !== 'trash'`, se muestra como segunda línea bajo `contentPlain` con itálica + ícono Sparkles. Layout sin shift.           | `src/components/editor/NoteCard.tsx`                                                        |

## Orden de implementación (commits atómicos)

1. **F1** `refactor(preferences): eliminar defaultNoteType del modelo` — types + lib, base de la reversión.
2. **F2** `refactor(settings): eliminar selector de tipo de nota por defecto` — UI + componente, depende de F1.
3. **F3** `feat(notes): hardcodear noteType fleeting en creacion` — comportamiento, depende de F1+F2 cerradas.
4. **F4** `feat(orama): incluir aiSummary en schema y rowToOramaDoc` — independiente de F1-F3, prep para F5.
5. **F5** `feat(notes): mostrar aiSummary en NoteCard como segunda linea` — UI, depende de F4.

F1→F2→F3 son una cadena lógica (eliminar preferencia). F4→F5 son otra (surfacear summary). Se pueden intercalar pero el orden 1-5 es el recomendado para revisar diffs limpios.

## Snippets ilustrativos

### F1 — `src/types/preferences.ts` resultado

```ts
export interface UserPreferences {
  trashAutoPurgeDays: 0 | 7 | 15 | 30;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  trashAutoPurgeDays: 30,
};
```

### F1 — `src/lib/preferences.ts` `parsePrefs` resultado

```ts
function parsePrefs(data: Record<string, unknown> | undefined): UserPreferences {
  const days = data?.trashAutoPurgeDays;
  return {
    trashAutoPurgeDays:
      days === 0 || days === 7 || days === 15 || days === 30
        ? days
        : DEFAULT_PREFERENCES.trashAutoPurgeDays,
  };
}
```

### F3 — `src/infra/repos/notesRepo.ts` cambio

```ts
export interface NoteCreateOverrides {
  title?: string;
  contentPlain?: string;
  paraType?: string;
  source?: string;
  // noteType eliminado: toda nota nace 'fleeting' (Zettelkasten flow).
  // La promoción a literature/permanent ocurre manualmente o por AI.
}

// En createNote, en defaults:
noteType: 'fleeting',
```

### F3 — `src/app/notes/page.tsx` `handleCreate`

```ts
const handleCreate = useCallback(async () => {
  if (!user) return;
  const newId = await notesRepo.createNote();
  if (!newId) return;
  navigate(`/notes/${newId}`);
}, [navigate, user]);
```

### F4 — `src/lib/orama.ts` adiciones

```ts
export const NOTES_SCHEMA = {
  // ... campos existentes
  aiSummary: 'string',
} as const;

export interface NoteOramaDoc {
  // ... campos existentes
  aiSummary: string;
}

// En rowToOramaDoc:
aiSummary: (row.aiSummary as string) || '',
```

### F5 — `src/components/editor/NoteCard.tsx` adición

Tras el `<p>` de `snippet` (line 167), antes del `<div>` con badges:

```tsx
{
  note.aiSummary && mode !== 'trash' && (
    <p className="mt-1 flex items-start gap-1.5 text-xs italic text-muted-foreground/80">
      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" aria-hidden />
      <span className="line-clamp-2">{note.aiSummary}</span>
    </p>
  );
}
```

## Checklist E2E (paso 5 SDD)

Dev server en background (`npm run dev`). UID test `gYPP7NIo5JanxIbPqMe6nC3SQfE3`.

- [ ] **F1+F2 — Preferencias limpias.** Abrir `/settings`, verificar que NO hay sección "Tipo de nota por defecto". Verificar que sección "Papelera de notas" sigue ahí y `#trash` scrollea correctamente.
- [ ] **F1 — Doc Firestore tolerante.** Verificar con Firebase MCP que `users/{uid}/settings/preferences` con `defaultNoteType` legacy se sigue cargando sin romper (parsePrefs ignora campos extra). El campo viejo queda como dead data en Firestore — aceptable, no requiere migración.
- [ ] **F3 — Nota nueva nace fleeting.** Crear nota desde botón "+ Nueva nota" en `/notes`. Verificar en Firebase MCP que el doc tiene `noteType: 'fleeting'`. Verificar badge "Fugaz" en `NoteCard`.
- [ ] **F3 — Inbox-to-note sigue creando fleeting.** El `createFromInbox` ya hardcodea `'fleeting'` (línea 204) — confirmar que no rompió por la limpieza del overrides.
- [ ] **F4 — Index Orama válido.** Buscar una nota existente desde `/notes` con search activo. No debe haber errores en consola sobre schema mismatch.
- [ ] **F5 — aiSummary visible en lista.** Tomar una nota existente con `aiSummary` no vacío en Firestore (las creadas hace tiempo deberían tenerlo por `autoTagNote`). Verificar segunda línea en `NoteCard` con itálica + Sparkles violeta. Si no hay ninguna, crear una nota con contenido suficiente, esperar ~5s a que `autoTagNote` corra, refrescar lista.
- [ ] **F5 — aiSummary ausente en trash mode.** Mover una nota con `aiSummary` a papelera. En tab "Papelera" la nota NO debe mostrar la línea de summary.
- [ ] **F5 — Sin layout shift.** En lista de notas mezclando notas con y sin `aiSummary`, verificar que la altura del card varía coherentemente (no salto inesperado).
- [ ] **Regresión — Settings full.** Cambiar tema, cambiar trashAutoPurgeDays — todo funciona igual que antes.
- [ ] **Regresión — favoritos / soft delete / restore.** Toggle favorito, soft delete, restore desde papelera, hard delete — sin regresión en `NoteCard`.

## Decisiones explícitas a recordar al cerrar

Para que el archivado del SPEC (paso 8 SDD) preserve trazabilidad:

- **F20 F3/F4 quedan como historia archivada de aprendizaje**, no se borra el SPEC archivado. El registro de F21 debe referenciar explícitamente que esto revierte F20 F3/F4 con justificación de método Zettelkasten + dogfooding.
- **Gotcha a escalar a `ESTADO-ACTUAL.md`** (paso 8): "aiSummary stale tras edición — `autoTagNote` solo corre si `aiProcessed=false`, ediciones posteriores no re-disparan el summary. Se aborda cuando duela en uso real (F22+ probable scope)."
- **Posible gotcha de regresión de defaults Firestore**: si un user tiene `defaultNoteType: 'permanent'` guardado en Firestore tras F20, F1 lo ignora silenciosamente. No se elimina el campo del doc — queda como dead data. Aceptable.

## NO se hace en este SPEC (out of scope explícito)

- Re-procesar `aiSummary` cuando el contenido de la nota cambia (decisión 6 de discovery).
- Migrar notas existentes con `noteType ≠ fleeting` (decisión 7 de discovery).
- AI clasifica `noteType` automáticamente — F22 candidata, requiere extender `processInboxItem` y `autoTagNote`.
- Surfacear `aiSummary` en detail page (decisión 4 de discovery).
- Mostrar `aiSummary` en trash mode (decisión 5 de discovery).
- Áreas dinámicas en `processInboxItem` — F22+ candidata.
- Banner UX de "AI sugiere promover a permanent" — F23 candidata.
