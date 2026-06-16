# SPEC — Feature 60: Historial de changelog consultable en Settings

> Estado: **Aprobada — en implementación** (`feat/historial-changelog`). Single-concern, 100% cliente (sin CFs / rules / deploy server-side). NO se mergea hasta revisión del diff completo.
> Origen: deferida **D7** de SPEC-59 ("diferir historial consultable + badge, YAGNI"), ahora con **evidencia de uso real**: el modal what's-new es one-shot (dispara al actualizar, comparando `lastSeenVersion` vs `getRunningVersion()`) y hoy **no hay forma de re-verlo**.
> Discovery: 4 Explore en paralelo (subsistema F59 + estructura de Settings + i18n del changelog + decisiones diferidas del SPEC-59) — sesión 2026-06-16. Estado del código verificado contra el repo en esa fecha.

## Objetivo

Hoy las novedades de cada versión solo se ven **una vez**, en el modal what's-new que dispara tras actualizar. Quien lo descarta (o salta varias versiones de un update) no puede volver a verlas: el catálogo `CHANGELOG_ENTRIES` existe en el bundle pero no hay UI que lo liste. Al cerrar esta feature, una **sub-página propia** (`/settings/changelog`, enlazada desde `AppInfoSection`) lista **todas las entradas de changelog liberadas**, más nueva primero, bilingüe, en los 3 frentes (web / Tauri / Android). Resuelve dos cosas con una sola vista y **cero estado nuevo**: (a) re-ver novedades on-demand, (b) catch-up de versiones saltadas (quien saltó releases las ve todas listadas).

Single-concern: **mostrar el catálogo de changelog ya existente**. No toca el trigger del modal, ni `lastSeenVersion`, ni introduce comparación semver.

**Release target (D8):** F60 sale en una **0.5.x intermedia** (p. ej. 0.5.3), **nunca bundleada en 0.6.0** — mantiene el dogfood incremental y deja el release de apertura de beta de bajo riesgo. La versión exacta queda **abierta** y se fija al correr `release-ecosystem`. La entrada `v060` se re-crea **recién en 0.6.0** (Paso 2.5), independientemente de cuándo salga F60.

## Invariante del catálogo (prerequisito — cerrada, NO opcional)

`CHANGELOG_ENTRIES` debe contener **solo versiones liberadas**. Hoy contiene `v060` (`{ version: '0.6.0', key: 'v060' }`), un **draft de una versión que aún no se liberó**, sembrado por F59 como placeholder. Un historial "list all" mostraría unas "Novedades de la 0.6.0" de una versión que nadie está corriendo → falso.

Por eso, **como parte de esta feature** se **remueve** la entrada `v060` (registry + keys i18n `changelog.v060.*` en es/en + regen de tipos). La entrada `v060` se **re-agrega en el release 0.6.0** vía el **Paso 2.5** de la skill `release-ecosystem`, con copy real. Esto:

1. Hace correcto el "list all" sin filtros: el catálogo solo tiene liberadas.
2. **Arregla el orden sin `semver.compare()`:** el registry sigue la **convención de append** (cada release suma su entrada al final, vía Paso 2.5), por lo que está ordenado **ascendente por release**. Removida `v060`, queda `[{ v052 }]`; `[...CHANGELOG_ENTRIES].reverse()` = **newest-first** válido, sin parseo semver.
3. **Convierte el gate (2) de 0.6.0** en `ESTADO-ACTUAL.md`: de «re-autorear `changelog.v060.*`» a «autorear `changelog.v060.*` fresco» (ya no existe placeholder que reescribir; lo crea el Paso 2.5). Se actualiza esa nota al cerrar (F4).

> El historial **no necesita `getRunningVersion()`** para ser correcto: el catálogo **bundleado** en un build dado solo contiene entradas `≤` la versión de ese build (porque cada entrada se appendea recién en su propio release). Renderiza el registry tal cual.

## Alcance

### IN

- **Vista de historial**: lista **todas** las entradas liberadas del catálogo, **reverse-chron** (newest-first), **bilingüe** (es/en), en **cards apiladas** (una por versión: título + bullets).
- **Ruta propia** `/settings/changelog`, **lazy code-split** (calca el patrón de `admin` / `auth/action` en `router.tsx`), hija de `Layout` (autenticada).
- **Link** "Ver novedades anteriores" en `AppInfoSection` → la ruta.
- **Remoción de `v060`** del catálogo: registry + i18n (es/en) + tipos + tests.

### OUT (explícito — diferido o descartado)

- **Badge "no-leído"** — requiere estado persistido nuevo (`has-unread`, distinto de `lastSeenVersion`) + lógica de lectura propia. Diferido (YAGNI; se reconsidera con evidencia).
- **Destacar / highlight** de entradas posteriores a `lastSeenVersion` dentro de la lista. Diferido (depende del estado del badge).
- **Re-trigger / re-abrir el modal** what's-new — la vista es pasiva; no se toca el flujo del modal.
- **Accordion / paginación / virtual scroll** — el catálogo es chico; cards apiladas planas. Premature.
- **`semver.compare()` / filtrar por `getRunningVersion()`** — innecesario (ver invariante).
- **Campo `date` por entrada** — opcional, diferible (no bloquea). Si se agrega luego, es aditivo al registry.

## Decisiones clave

| #      | Decisión                                                                                                                                                                                                                                                        | Estado                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **D1** | **Invariante del catálogo:** `CHANGELOG_ENTRIES` = solo versiones liberadas → **remover `v060`** en esta feature; se re-agrega en el release 0.6.0 (Paso 2.5).                                                                                                  | Cerrada (Sebastián).        |
| **D2** | **Alcance = solo la lista.** Badge "no-leído" y highlight diferidos (scope real, no parte gratis: estado `has-unread` nuevo + lógica de lectura).                                                                                                               | Cerrada (Sebastián). YAGNI. |
| **D3** | **Ubicación = sub-página propia** `/settings/changelog` (lazy), con link discreto desde `AppInfoSection`. Mantiene Settings limpio y escala con el catálogo creciente.                                                                                          | Cerrada (Sebastián).        |
| **D4** | **Orden = `reverse()` del registry** (append-convention → ascendente por release ⇒ reverse = newest-first), **sin `semver.compare()`**. El historial renderiza el catálogo bundleado, no usa `getRunningVersion()`.                                             | Cerrada (Sebastián).        |
| **D5** | **Display = cards apiladas** (sin accordion/paginación). Reusa el patrón i18n del modal: `t(\`changelog.${key}.items\`, { returnObjects: true }) as string[]` (gotcha tupla F59).                                                                               | Cerrada (Sebastián).        |
| **D6** | **Regen de tipos i18n SIN `extract`** — `npx i18next-cli` modo _types_ (o edición manual equivalente del `.d.ts`); nunca `extract` (escanea código y, con `removeUnusedKeys`, puede purgar). `resources.d.ts` es generado, no se edita su contenido a criterio. | Cerrada (Sebastián).        |
| **D7** | **Campo `date` por entrada = opcional, diferible.** No entra en done-criteria.                                                                                                                                                                                  | Cerrada (Sebastián).        |
| **D8** | **Release target = 0.5.x intermedia, NUNCA 0.6.0.** Versión exacta abierta (se fija al correr `release-ecosystem`). Mantiene el dogfood incremental + 0.6.0 de bajo riesgo. `v060` se re-crea en 0.6.0 (Paso 2.5) pase lo que pase.                             | Cerrada (Sebastián).        |

## Sub-features

### F1 — Remover `v060` del catálogo (prerequisito de la invariante)

- **Qué:** borrar `{ version: '0.6.0', key: 'v060' }` de `CHANGELOG_ENTRIES`; borrar el bloque `changelog.v060` de `es/translation.json` y `en/translation.json`; regenerar `resources.d.ts` **sin `extract`** (D6); actualizar `changelog.test.ts` (el registry ya no contiene `v060`; `findChangelogEntry('0.6.0') → undefined`); reescribir el caso roto de `useWhatsNew.test.ts` (ver abajo).
- **Break de test preempt-eado:** `useWhatsNew.test.ts` **CASO 3** ("inaugural establecido") hace `getRunningVersion → '0.6.0'` y assertea `entryKey === 'v060'` **contra el registry REAL** (no mockea `@/lib/changelog`). Removida `v060`, `findChangelogEntry('0.6.0') → undefined` → el modal no abre → el caso 3 falla. **F1 reescribe el caso 3 a `'0.5.2'` / `'v052'`.** Los casos 1/2/4 usan `'0.6.0'` solo como valor string (sin lookup de catálogo) → sanos, pero se verifican igual.
- **Criterio de done:** `CHANGELOG_ENTRIES === [{ version: '0.5.2', key: 'v052' }]`; `ChangelogKey === 'v052'`; `git grep -n "v060" src/` → cero; caso 3 de `useWhatsNew.test.ts` reescrito a `'0.5.2'`/`'v052'` y casos 1/2/4 verificados sanos; `npx tsc -b` y `npm test` verdes; el modal what's-new sigue disparando para `0.5.2` (`findChangelogEntry('0.5.2')` intacto).
- **Archivos:** `src/lib/changelog.ts`, `src/locales/{es,en}/translation.json`, `src/types/resources.d.ts`, `src/lib/changelog.test.ts`, `src/hooks/useWhatsNew.test.ts`.

### F2 — Componente `ChangelogHistory`

- **Qué:** componente que mapea `[...CHANGELOG_ENTRIES].reverse()` y, por entrada, renderiza una card con título (`t(\`changelog.${key}.title\`)`) y bullets (`t(\`changelog.${key}.items\`, { returnObjects: true }) as string[]`) — **mismo patrón i18n que `WhatsNewModal`** (D5). Cards apiladas (`<ul className="flex flex-col gap-3">`), dot bullets como el modal (`h-1.5 w-1.5 rounded-full bg-primary`). **No** usa `getRunningVersion()`(sin async / fail-safe). Componente único (default #2 aprobado); no se extrae`ChangelogEntryCard`.
- **Criterio de done:** renderiza todas las entradas del catálogo newest-first; en es y en muestra el copy correcto; v060 ausente (tras F1); cero semver. Test `ChangelogHistory.test.tsx`: orden reverse + cantidad == entradas del registry + títulos presentes.
- **Archivos:** `src/components/changelog/ChangelogHistory.tsx` (nuevo), `src/components/changelog/ChangelogHistory.test.tsx` (nuevo).

### F3 — Página + ruta lazy + link en `AppInfoSection` (fusionada)

- **Qué:** un solo commit con (a) página `src/app/settings/changelog/page.tsx` (header h1 + descripción + `<ChangelogHistory />` + **back-link textual "← Ajustes"**, default #3 aprobado); (b) ruta `{ path: 'settings/changelog', lazy: async () => ({ Component: (await import('@/app/settings/changelog/page')).default }) }` hija de `Layout` (calca `admin` / `auth/action`); (c) `Link` de `react-router` "Ver novedades anteriores" → `/settings/changelog` en `AppInfoSection` (debajo de la card de versión). Keys i18n nuevas **batcheadas** (es/en): `changelog.history.{title,description,back}` + `settings.appInfo.changelogLink`, con **regen de tipos UNA sola vez** (D6).
- **Criterio de done:** navegando desde `AppInfoSection` → `/settings/changelog` se ve el historial dentro del Layout autenticado; ruta lazy (chunk aparte); back-link vuelve a Settings; funciona en los 3 frentes (client-side puro).
- **Archivos:** `src/app/settings/changelog/page.tsx` (**dir nuevo** — `mkdir -p` antes del primer Write, gotcha hook fail-close F59), `src/app/router.tsx`, `src/components/settings/AppInfoSection.tsx`, `src/locales/{es,en}/translation.json`, `src/types/resources.d.ts`.

### F4 — Cierre (SDD step 8)

- **Qué:**
  - (a) en `ESTADO-ACTUAL.md` — reformular el gate (2) de 0.6.0: de «re-autorear `changelog.v060.*`» a «autorear `changelog.v060.*` fresco (no existe placeholder; lo crea el Paso 2.5 del release 0.6.0)»; mover el candidato "Historial de changelog" de § Candidatos próximos a feature completada (F60).
  - (b) **convención de append explícita** en el **Paso 2.5 de la skill `release-ecosystem`**: "appendear la nueva entrada al **FINAL** de `CHANGELOG_ENTRIES`; el historial depende del orden de release" — y **verificar que el Paso 2.5 CREA `v060`, no lo edita** (el placeholder ya no existe).
  - (c) **comentario de 1 línea** arriba de `CHANGELOG_ENTRIES` en `changelog.ts`: el orden del array = orden de release; el historial lo consume con `reverse()` (D4). Cierra la superficie de fallo silencioso del orden.
  - (d) escalar gotchas nuevos si surgen.
- **Criterio de done:** docs coherentes; gate de `v060` reformulado; convención de append documentada en skill + código; release-skill verificada.
- **Nota:** el **archivado del SPEC** (prescriptivo → registro de implementación, vía `archive-spec`) se difiere a **post-merge** (archivar un SPEC en revisión es prematuro; el SPEC vivo sirve de referencia durante la revisión del diff).
- **Archivos:** `Spec/ESTADO-ACTUAL.md`, `src/lib/changelog.ts` (comentario), skill `release-ecosystem` (Paso 2.5), (gotchas si aplica).

## Orden de implementación

`F1 → F2 → F3 → F4`. La invariante (F1) primero: el historial no debe listar una versión no liberada en ningún punto. F2 antes que F3 (la página consume el componente). F4 al cierre. Un commit atómico por sub-feature.

## Gotchas a respetar (heredados de F59)

- **items i18n = tupla literal** en `resources.d.ts` → consumir con `returnObjects: true` + `as string[]` en el call-site; **nunca** castear en el `.d.ts` (generado).
- **key normalizada** (sin dots): `keySeparator '.'` ⇒ keys como `v052`, no `0.5.2` (D8 de F59).
- **Regen sin `extract`** (D6): el `extract` con `removeUnusedKeys` puede purgar keys fuera del scope.
- **Dir nuevo + hook PreToolUse fail-close** (F3): `mkdir -p src/app/settings/changelog` antes del primer `Write` ahí.
- **Keys i18n nuevas** rompen `.toEqual({...completo...})` si los hubiera en tests (la fuente es `grep .toEqual(`); los que usan defaults se auto-actualizan.

## Verificación / criterio de done global

- **Gate verde:** `npm run lint` + `npx tsc -b` + `npm test` (incluye `ChangelogHistory.test.tsx` nuevo + `changelog.test.ts` y `useWhatsNew.test.ts` actualizados).
- **Funcional:** el historial lista **todas las entradas liberadas**, reverse-chron, **bilingüe**, navegable desde `AppInfoSection` → `/settings/changelog`, en los 3 frentes.
- **Invariante:** `v060` removido (registry + i18n es/en + tipos), `git grep "v060" src/` cero.
- **No-regresión:** modal what's-new intacto (dispara con `v052`); skill `release-ecosystem` (Paso 2.5) verificada (crea `v060`, append-order); gate de `v060` en `ESTADO-ACTUAL.md` reformulado.
- **Cero `semver`:** sin `semver.compare()` ni dependencia de `getRunningVersion()` en el historial.
- **E2E (al implementar):** Settings → link → `/settings/changelog` → entradas reverse-chron en es; toggle locale → copy en en; `v060` ausente; smoke web E2E (cuenta real, cleanup verificado) + smoke nativo manual. El smoke se corre en el **release 0.5.x que incluya F60** (per D8, no en 0.6.0).

## Checklist

- [ ] F1 — `v060` removido (registry + i18n es/en + tipos + tests); caso 3 de `useWhatsNew.test.ts` reescrito; `git grep` cero; modal sano con `v052`.
- [ ] F2 — `ChangelogHistory` lista reverse-chron, bilingüe; test verde.
- [ ] F3 — página + ruta lazy `/settings/changelog` + link en `AppInfoSection`; keys i18n batcheadas; back-link.
- [ ] F4 — `ESTADO-ACTUAL.md` (gate v060 reformulado + candidato → completada); convención de append en skill `release-ecosystem` + comentario en `changelog.ts`; release-skill verificada.
- [ ] Gate verde (lint + tsc + test). E2E (web + nativo) + archivado del SPEC → post-merge, en el release 0.5.x que incluya F60.

## Puntos abiertos / defaults (resueltos)

1. **Release target — RESUELTO (D8):** 0.5.x intermedia, **nunca** 0.6.0; versión exacta abierta, se fija al correr `release-ecosystem`. `v060` se re-crea en 0.6.0 (Paso 2.5) pase lo que pase.
2. **Componente — APROBADO:** un solo `ChangelogHistory` que itera el registry; no se extrae `ChangelogEntryCard`.
3. **Back-link — APROBADO:** link textual "← Ajustes" arriba del header de la página.
