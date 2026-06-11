# SPEC — Feature 58: i18n (es + en)

> **Estado:** GO de Sebastián (2026-06-10). En implementación — F1 en curso.
> **Alcance:** UI completa de `src/` + outputs de AI + errores de CF localizables es/en, con locale por usuario.
> **Dependencias:** discovery i18n (informe de sesión 2026-06-10, verificado por re-conteo independiente). Ninguna feature bloqueante. Release 0.5.0 publicado antes de arrancar.
> **Estimado:** 2–3 semanas solo dev — estimación de este SPEC, no compromiso; incluye migración de tests; F4.1 dimensionado por D11.
> **Stack relevante:** react-i18next **17.0.8** + i18next **26.3.1** (runtime), i18next-cli **1.62.0** (dev-only, Node ≥22 — OK con Node 24 del repo), Intl nativo (ya en uso).

## Objetivo

Al cerrar esta feature el usuario puede usar SecondMind completa en español o inglés: la UI, los textos generados por la IA (títulos, summaries, tags sugeridos) y los mensajes de error siguen el idioma elegido en Settings (detectado de `navigator.language` la primera vez). El copy español actual no cambia visualmente.

## Decisiones

Fijadas por Sebastián en el discovery (D1–D6) y aprobadas en el GO (D7–D11). No reabrir.

| #   | Decisión                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | react-i18next + i18next-cli oficial. Extracción con `instrument` (AST + confidence scoring) + revisión manual; tipos con `extract --with-types` (en 1.62.0 el mecanismo es el bloque `types` del config — mismo pipeline, verificado en docs); `instrumentScorer` excluye datos persistidos: `src/types/area.ts`, `src/types/habit.ts`, `src/components/editor/templates/**`                  |
| D2  | Catálogos **estáticos** importados al bundle — NO lazy dynamic imports (cambiar el default del `i18n.ts` que genera el CLI). Razón: PWA offline + 3 frentes nativos; un chunk de locale no precacheado rompe offline. 2 locales × ~470 strings ≈ peso trivial                                                                                                                                 |
| D3  | Scope v1: UI `src/` completa + AI (`processInboxItem`, `autoTagNote`: SYSTEM_PROMPT + descriptions de `schemas.ts` + lookup de locale en handler) + HttpsError de CFs a códigos estables con catálogo client-side + `locale` en UserPreferences (detección `navigator.language`, override en Settings) + 15 plurales + ~10 sitios Intl + tiempo relativo unificado + fix `lang` html/manifest |
| D4  | Fuera de v1 → v2 con trigger (demanda de users beta no-hispanohablantes): extensión Chrome (`_locales/`), Tauri tray/titles, `strings.xml` Android, emails de auth (estructural: un template por proyecto Firebase)                                                                                                                                                                           |
| D5  | Persistidos: AREAS/HABITS en Firestore = IDs opacos, NO se migran — label se resuelve en render. Templates/tags/títulos default: se localizan **al momento de creación**; contenido histórico inmutable (corpus mezclado aceptado, patrón Obsidian). El enum del schema AI no cambia                                                                                                          |
| D6  | Mismo arco: typo "Sin titulo" — **ambas ocurrencias**: `src/hooks/useGraph.ts:45` y `src/hooks/useSimilarNotes.ts:62` (`inboxRepo` ya usa la forma correcta) + `.localeCompare()` con locale explícito en sorts                                                                                                                                                                               |
| D7  | Single namespace `translation`, keys jerárquicas por dominio (`notes.empty.all`, `errors.betaFull`). ~470 strings no ameritan multi-namespace; simplifica tipos e `instrument`; `sort: true` + dominios secuenciales evitan conflictos                                                                                                                                                        |
| D8  | `fallbackLng: 'es'`, `primaryLanguage: 'es'`. El copy fuente es el español actual; nunca keys crudas en pantalla                                                                                                                                                                                                                                                                              |
| D9  | Exclusiones ampliadas de extracción (hardening sobre D1): `src/functions/**` (package.json propio, sin react-i18next), `**/*.{test,spec}.*`, `src/components/ui/**` (regla: no editar shadcn), `src/locales/**`, `src/types/**`                                                                                                                                                               |
| D10 | Rama/merge: rama corta por fase (`feat/i18n-f1`, `feat/i18n-f2-<dominio>`, …), cada una con merge `--no-ff` a main, invariante "cada merge deja la app deployable en es" (D8 lo garantiza). Desvío consciente del paso 7 SDD (varios merges para una feature)                                                                                                                                 |
| D11 | **Traducción en = Opción A (GO):** AI-assisted batch por dominio en F4.1, con revisión de Sebastián por dominio. **F4.1 arranca definiendo una guía de estilo del copy en** (registro, capitalización — equivalente del imperativo neutro es) ANTES del batch; el batch se produce contra esa guía. `i18next-cli status` como gate de completitud                                             |

## Features

### F1 — Infraestructura + vertical slice Settings

- **F1.1 Setup:** instalar i18next 26.3.1 + react-i18next 17.0.8 + i18next-cli 1.62.0 (dev). Crear `i18next.config.ts`: `locales: ['es','en']`, `extract.input src/**/*.{ts,tsx}` + ignore D9, output `src/locales/{{language}}/{{namespace}}.json`, `instrumentScorer` (D1), bloque `types`. ⚠️ Gotcha reincidente: npm install mueve el lockfile → verificar `resolve.dedupe` al reiniciar dev server.
- **F1.2** `src/lib/i18n.ts`: imports **estáticos** de los 2 JSON (cambiar el lazy default del template del CLI), `initReactI18next`, `fallbackLng: 'es'`. Importado en `src/main.tsx` antes del render.
- **F1.3 Locale en preferences:** `locale: 'es' | 'en'` en `UserPreferences` (`src/types/preferences.ts`) + `DEFAULT_PREFERENCES` + **bump `PREFERENCES_SCHEMA_VERSION` 1 → 2** (`src/lib/preferences.ts`, gotcha CLAUDE.md) + `parsePrefs()`. Detección inicial: `navigator.language` empieza con `es` → `'es'`, si no `'en'`. Subscribe → `i18n.changeLanguage` + `document.documentElement.lang` dinámico. `index.html` → `lang="es"` de base; `vite.config.ts` manifest: agregar `lang: 'es'` (coherencia — W3C no soporta multi-lang en manifest).
- **F1.4 Selector** de idioma en Settings (Español / English) vía `setPreferences`. Archivo: `src/components/settings/LanguageSelector.tsx` (mismo patrón que `ThemeSelector.tsx`).
- **F1.5 Vertical slice = dominio settings/** (~10 strings): `instrument --dry-run` → revisión → aplicar → traducir a en a mano. Valida el patrón punta a punta (keys, tipos, fallback, switch runtime). Por qué Settings y no auth: chico, contiene el selector (feedback inmediato), sin exposición pública. Acá se confirma qué archivo(s) genera exactamente el bloque `types` (se commitean — CI no requiere el CLI).
- **F1.6 Tipos:** typo en key = error de `tsc` — verificado **rompiéndolo deliberadamente** (gotcha "probar el verificador").
- **F1.7 Tests:** setup de Vitest con i18n inicializado (catálogo es estático); estrategia de asserts **contra el catálogo, no contra literales**. Tests afectados conocidos: `authErrors.test.ts` (~13 asserts), `loginError.test.ts`, `inboxRepo.test.ts`, `usePendingSyncCount.test.ts`, `PendingSyncIndicator.test.tsx`, `useNoteSuggestions.test.tsx`. Regla de gate: cada commit de dominio de F2 actualiza SUS tests en el mismo commit.
- **F1.8 Baseline de capturas (gate de F2):** al cierre de F1, capturas Playwright 375/768/1280 de las pantallas clave de cada dominio de F2, guardadas en **`Spec/qa/i18n-baseline/`** (versionada en git, nombre `<dominio>-<pantalla>-<viewport>.png`). **F2.1 no arranca sin baseline.**

**Done F1:** selector cambia idioma en runtime sin reload · preferencia persiste (Firestore + cross-restart) · Settings 100% por catálogo en ambos idiomas · `tsc` falla con key inválida (verificado) · setup de tests i18n operativo · baseline F1.8 committeada · lint+build+tests (262) verdes · resto de la app intacta en es.

### F2 — Extracción instrumentada por dominios

Un commit atómico + smoke por dominio — nunca un diff de 167 archivos. Orden de riesgo creciente:

| #    | Dominio                         | Contenido                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2.1 | layout + navegación             | `navItems`, Sidebar, TopBar, BottomNav, MobileHeader, NavigationDrawer, FAB, CommandPalette (~45)                                                                                                                                                                                                                                                                                                 |
| F2.2 | dashboard + habits              | Greeting (keys por franja horaria), cards, HabitGrid — primeros plurales                                                                                                                                                                                                                                                                                                                          |
| F2.3 | tasks + projects + objectives   | cards, modals, ObjectiveCard (relativos + plural día/días)                                                                                                                                                                                                                                                                                                                                        |
| F2.4 | capture + inbox                 | QuickCapture, InboxProcessorForm, AiSuggestionCard, inbox pages (5 plurales del batch)                                                                                                                                                                                                                                                                                                            |
| F2.5 | notes + editor (~85+, el mayor) | pages, NoteCard, banners, slashMenuItems, BubbleToolbar, LinkInput, WikilinkMenu, placeholders TipTap                                                                                                                                                                                                                                                                                             |
| F2.6 | auth + onboarding + admin       | público — máximo cuidado de copy                                                                                                                                                                                                                                                                                                                                                                  |
| F2.7 | constantes + persistidos D5     | `discardableEntries`, `useOnboarding` steps, labels de enums (PRIORITY/TYPE/STATUS_LABELS dispersos) → `src/lib/entityLabels.ts` central (incluye AREAS/HABITS en render, D5); defaults "Sin título" al crear (`inboxRepo`) → `t()` al momento de creación (D5); templates literature/permanent → función que materializa el JSONContent con `t()` al insertar (**manual, nunca instrument**); D6 |

Transversales en el dominio que toque: 15 plurales → `count` + `_one`/`_other` · ~10 sitios Intl → helper con locale dinámico · tiempo relativo custom (ReviewBanner, ObjectiveCard) unificado en `formatRelative` (`src/lib/formatDate.ts`).

**Protocolo por corrida de `instrument`** (el CLI escribe por fuera de los hooks del entorno): (1) `git branch --show-current` ≠ main ANTES de correr (PreToolUse no cubre Bash); (2) dev server apagado (evita tormenta HMR); (3) tras aplicar: `npx prettier --write` + `npx eslint --fix` sobre los archivos tocados (excepción acotada al "no correr manualmente" de CLAUDE.md — PostToolUse no ve escrituras del CLI).

**Gate por dominio:** dry-run revisado → aplicar → smoke manual de las pantallas del dominio (protocolo step 5) comparando contra baseline F1.8 → tests del dominio actualizados en el mismo commit → suite+lint+build verdes → commit.

**Done F2:** script `scripts/check-hardcoded-es.mjs` committeado (regex acentos + palabras frecuentes, excludes = D5/D9 + comentarios, allowlist versionada) con **salida vacía** · 15 plurales usan `count` · cero `'es'` hardcodeado en `Intl.*` · smoke por dominio sin diferencias vs baseline (capturas adjuntas al cierre de cada dominio) · suite verde.

### F3 — AI + códigos de error CF _(server-side: commit → review → merge → deploy)_

- **F3.1** `processInboxItem` + `autoTagNote`: leer locale de `users/{uid}/settings/preferences` en el handler (default `'es'`); SYSTEM_PROMPT por locale; descriptions de `src/functions/src/lib/schemas.ts` por locale; **enum `suggestedArea` intacto** (D5).
- **F3.2** Los **~31** `HttpsError` (re-verificar con grep al implementar; **incluye las 4 libs compartidas** `assertAllowlisted`/`rateLimit`/`requireAdmin`/`requireVerified`) → códigos estables; catálogo client-side `errors.*` completo (~9 codes CF + auth codes). **La migración de `authErrors.ts`/`apiKeyErrors.ts` a keys vive acá** (no en F2 — misma unidad que los códigos). Cierra la mezcla es/en server-side y el gap de mapeo (hoy 3 de ~9).

**Done F3:** inbox item procesado con locale `en` → título/summary/tags en inglés (QA prod bajo protocolo step 5: anunciar antes, hard-delete después); con `es` → output igual que hoy · cero strings user-visible hardcodeados en CFs · todos los codes con mensaje localizado en cliente · deploy DESPUÉS de review+merge (orden CLAUDE.md).

### F4 — Traducción en + QA cross-platform + cierre

- **F4.1 Traducción en (D11):** (a) definir **guía de estilo del copy en** (registro, capitalización — equivalente del imperativo neutro es; se registra en este SPEC al producirse); (b) batch AI por dominio contra esa guía; (c) revisión de Sebastián por dominio (mismo corte que F2); (d) `i18next-cli status` limpio como gate.
- **F4.2 QA 3 frentes** (web Playwright 375/768/1280, Tauri, Android) × 2 idiomas: switch runtime, **offline con locale en** (valida D2), fechas/plurales/relativos. Escrituras bajo protocolo step 5; emulador preferido donde no haga falta la app completa.
- **F4.3 Cierre:** archivar SPEC · escalar gotchas · **actualizar ESTADO-ACTUAL § Versionado y roadmap (beta v0.6.0 desplazada — decisión tomada; i18n entra en la serie 0.5.x)** · release coordinado según pendientes acumulados de la serie al cierre.

**Done F4:** catálogo en 100% (`i18next-cli status` limpio) · QA GO 3 frentes × 2 idiomas incl. offline en · ESTADO-ACTUAL actualizado.

## Orden de implementación

**F1 → F2 (F2.1 gateada por baseline F1.8) → F3 → F4**, estricto. F3 después de F2 (F3.2 toca el catálogo que F2 estabiliza). La decisión de traducción ya está tomada (D11 = Opción A), por lo que F2 no espera nada más que el baseline.

## Estructura de archivos (nuevos)

```
i18next.config.ts
scripts/check-hardcoded-es.mjs            (F2 — gate de done)
src/lib/i18n.ts
src/lib/entityLabels.ts                   (F2.7)
src/locales/es/translation.json
src/locales/en/translation.json
src/types/i18next.d.ts                    (generado — archivo(s) exacto(s) se confirman en F1.5)
src/components/settings/LanguageSelector.tsx
Spec/qa/i18n-baseline/                    (F1.8 — capturas baseline)
```

## Riesgos

1. **Regresión masiva de UI** (~167 archivos): dominios chicos + dry-run + smoke vs baseline + suite + script de done.
2. **Main congelado para features durante F2** — explicitado. D10 (merges por dominio) acorta la ventana; aún así, ninguna feature paralela mientras dura.
3. `instrument` recall ~80–90% + false positives → dry-run + revisión manual + scorer + script final.
4. **El CLI escribe por fuera de los hooks del entorno** (sin Prettier/ESLint automático, sin bloqueo de main, HMR) → protocolo por corrida (F2).
5. **Tests que assertean español literal** rompen al migrar sus módulos → F1.7 + regla "mismo commit".
6. AI: prompts/descriptions en en pueden cambiar la calidad del output → QA con capturas reales en ambos locales antes del deploy.
7. `PREFERENCES_SCHEMA_VERSION` sin bump → prefs huérfanas (gotcha) — en F1.3.
8. npm install nuevo → gotcha `resolve.dedupe` reincidente.
9. Catálogo en incompleto en prod → `fallbackLng 'es'` (D8): nunca keys crudas.
10. **Riesgo aceptado (GO):** los defaults en español dentro de `src/components/ui/` (ej. `confirm-dialog.tsx`) quedan como **residual consciente** — los call-sites pasan labels traducidos y el smoke por dominio caza cualquier default que se filtre.

## Impacto en roadmap (decisión tomada — el cierre la ejecuta)

La beta v0.6.0 (hoy "finales junio / inicios julio 2026") **se desplaza**: i18n entra en la serie 0.5.x antes de abrir la beta. F4.3 actualiza ESTADO-ACTUAL § Versionado y roadmap con la nueva secuencia y fecha.

## Checklist global

- [ ] App completa en es y en, switch runtime + persistencia del locale
- [ ] es visualmente idéntico al pre-SPEC (capturas vs baseline F1.8)
- [ ] AI genera en el locale del usuario (ambas CFs)
- [ ] Todos los `HttpsError` → códigos estables con mensaje localizado
- [ ] Plurales (15) e Intl (~10) locale-aware; tiempo relativo unificado
- [ ] `tsc` falla ante key inexistente (verificado rompiéndolo)
- [ ] `scripts/check-hardcoded-es.mjs` con salida vacía
- [ ] QA GO 3 frentes × 2 idiomas, incl. offline en en
- [ ] ESTADO-ACTUAL § Versionado y roadmap actualizado (beta desplazada)

## Siguiente fase

v2 i18n (trigger: demanda de usuarios beta no-hispanohablantes): extensión Chrome (`_locales/`), Tauri tray/titles, `strings.xml`, emails con provider custom (Resend/SendGrid + CF + `generateLink`).
