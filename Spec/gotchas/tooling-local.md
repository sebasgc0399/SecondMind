# Tooling local

> Canon de gotchas del dominio. Índice ligero en `../ESTADO-ACTUAL.md` § "Gotchas por dominio (índice)".
> Cada gotcha vive como `## <título>`. El slug del título es el anchor estable referenciado desde el índice.

## Helpers compartidos existentes

`formatDate`, `startOfDay`, `isSameDay`, `getWeekStart`, `addDays` en [`src/lib/dateUtils.ts`](../../src/lib/dateUtils.ts); `parseIds`, `stringifyIds` en [`src/lib/tinybase.ts`](../../src/lib/tinybase.ts).

## `vi.mock(...)` se hoistea al top del archivo de test por Vitest

Vars del scope no son accesibles desde el factory en tiempo de evaluación. Si el mock necesita un objeto compartido (ej. un store TinyBase de testing), crearlo DENTRO del factory con `await import()` y leerlo desde el módulo mockeado en el resto del archivo. Y porque ESLint `import/order` interpreta `vi.mock(...)` como statement separador entre import groups, **todos los imports al top del archivo + `vi.mock` después** (Vitest los hoistea igual). Imports antes y después de un `vi.mock` reportan "empty line between import groups". Patrón vivo en [src/infra/repos/notesRepo.test.ts](../../src/infra/repos/notesRepo.test.ts).

## TypeScript LSP plugin requiere patch en Windows

`child_process.spawn()` no resuelve wrappers `.cmd` de npm global. Fix: `marketplace.json` con `command: "node"` + ruta absoluta a `cli.mjs`. Procedimiento en `../../Docs/SETUP-WINDOWS.md`.

## Firebase MCP: `node` directo al CLI local, no `npx`

`npx firebase@latest` falla con "Invalid Version". Configurado en `.mcp.json`.

## Brave Search: `BRAVE_API_KEY` como variable de sistema Windows

No en `.env.local`.

## ui-ux-pro-max symlinks rotos en Windows

Sin Developer Mode. Scripts reales en `src/ui-ux-pro-max/scripts/search.py`. Fix: Developer Mode + `git config --global core.symlinks true` + reinstalar plugin.

## `highlight.js` peerDep mismatch silencioso post-`npm install` con `lowlight@^3`

Al instalar `@tiptap/extension-code-block-lowlight` + `lowlight@^3` (que piden peer `highlight.js@^11`), npm respeta la versión `^10` ya en el lockfile (suele venir como dep transitiva de `firebase-tools` → `marked-terminal`) en lugar de bumpear. `npm ls highlight.js` muestra `invalid` warning pero el install es exit 0. Síntoma runtime: `lowlight.highlightAuto()` lanza `TypeError: Cannot read properties of undefined (reading 'variants')` en `expandOrCloneMode` porque la API de modes cambió v10→v11. Fix: `npm i highlight.js@^11` explícito en root deps. **Operativo:** post-install de cualquier dep nueva con peerDep declarado, correr `npm ls <peer>` y comparar versión resuelta contra el rango pedido — el `invalid` warning es load-bearing, no decorativo. Detectado en F45.

## Vite cachea `node_modules/.vite/deps/` aunque cambies versiones de deps transitivas

Tras bumpear `highlight.js` v10→v11 en F45, el dev server siguió sirviendo el bundle viejo (`lowlight.js?v=80a6f965` mismo hash query) — el `TypeError` runtime persistió. Vite no detecta el cambio de sub-dep porque el dep path no cambió, solo el contenido transitivo. Patrón operativo: tras cualquier cambio relevante de dep transitiva (peerDep upgrade, sub-dep override, `npm dedupe`), `rm -rf node_modules/.vite && kill dev server && npm run dev`. Equivalente del problema `resolve.dedupe` reincidente tras `npm install` (CLAUDE.md), pero con la cache de Vite en vez del lockfile.

## Vite no rebasa `url()` relativos en CSS importado vía `@import 'pkg'` desde otro CSS

Cuando un `src/index.css` hace `@import 'algun-paquete';` y ese paquete declara assets con paths relativos (`src: url(./files/foo.woff2)`), Vite 8 NO resuelve esos `url()` en build time — emite warning `"./files/foo.woff2 didn't resolve at build time, it will remain unchanged"`, deja el path como `/files/foo.woff2` en el CSS final, y NO copia los assets a `dist/assets/`. En runtime el browser pide `/files/foo.woff2`, Firebase Hosting SPA rewrite devuelve `index.html`, browser falla decode. Fallback CSS (`font-sans`, `sans-serif`) puede enmascarar el bug visualmente. **Fix:** importar packages con assets desde JS/TS, no desde CSS — `import 'pkg/index.css'` en `main.tsx` deja que el plugin CSS de Vite procese y rebasee los `url()` correctamente, copiando los assets con hash al dist. Patrón vivo: `import '@fontsource-variable/geist/index.css'` en [src/main.tsx](../../src/main.tsx). Aplicable a cualquier package futuro de fonts, sprites o imágenes consumido como CSS bundle.

## `react-resizable-panels` v4 rompe compat con v2 (Group/Separator + useDefaultLayout)

v2 exponía `PanelGroup`/`Panel`/`PanelResizeHandle` con `defaultSize` per-panel + `autoSaveId` para persistencia. v4.x los reemplazó por `Group`/`Panel`/`Separator` + hook `useDefaultLayout({ id, panelIds, storage })` con `LayoutStorage` adapter custom (sync `getItem`/`setItem`) + `defaultLayout: { [panelId]: flexGrow }` (objeto, no per-Panel) + `onLayoutChanged` per-Group. La opción `panelIds` resuelve nativamente conditional Panel rendering — sin necesidad del key-based remount del `PanelGroup` completo que pedía v2.

**Validación pre-código operativa:** cuando context7 devuelve una API que no coincide con la docs que recordás de la lib, correr `npm view <pkg> version` + `npm view <pkg>@<latest> peerDependencies dependencies` ANTES de empezar a codear o asumir el API. Para `react-resizable-panels`, latest era v4.11.2 al momento de F46 — la docs antigua (v2 mainstream) sigue siendo el primer hit en buscadores y guía cualquier code-generation default (Cursor/Copilot/etc.). Aplicable a cualquier lib UI donde un major bump rompió API y la primera referencia accesible sigue siendo la versión vieja. Detectado en F46.

## Tests en `src/functions/` deben excluirse del tsconfig de functions (post-F48)

El `src/functions/tsconfig.json` compila `include: ["src"]` al outDir `lib/`. Si hay un `*.test.ts` bajo `src/functions/src/`, `tsc` lo compila a `lib/.../X.test.js` (CommonJS). vitest (root) globbea `**/*.test.*` e intenta correr ese `.js`, fallando con `"Vitest cannot be imported in a CommonJS module using require()"`. Fix: agregar `"**/*.test.ts"` al `exclude` del tsconfig de functions (los tests no se deployan de todos modos). Surge la PRIMERA vez que se agrega un test bajo functions (F48, `crypto.test.ts` fue el primero). El `.ts` fuente sigue corriendo bajo vitest normal. Mantené el módulo bajo test SIN imports de `firebase-functions` para que corra en env node sin arrastrar el runtime de CFs.

## Tests verdes local pero rojos en CI por env faltante (side-effects de init en el top-level)

**Síntoma:** la suite vitest pasa en la máquina del dev pero el primer run de CI falla en el step de test con un error de inicialización (ej. `FirebaseError: auth/invalid-api-key` en `src/lib/firebase.ts:17`), aunque lint y tsc pasen.

**Causa:** vitest carga los archivos `.env` vía Vite, incluido `.env.local` (gitignored). El dev tiene su `.env.local` con la config real → los tests ven `import.meta.env.VITE_*` poblado y todo pasa. CI no tiene `.env.local` → esas vars quedan `undefined`. Cualquier módulo con **side-effects de inicialización en el top-level** que se importe (aunque sea transitivamente) desde un test rompe al evaluarse: `firebase.ts` hace `initializeApp(...)` + `getAuth(app)` al importarse, y `getAuth` tira `auth/invalid-api-key` si la apiKey es vacía/ausente. Los repos lo mockean (`vi.mock('@/lib/firebase')`), pero basta UN test que arrastre la cadena real sin mock para tumbar la suite entera en CI.

**Solución:** commitear `.env.test` con valores DUMMY no-vacíos para las `VITE_*` que se leen en top-level. Hace la suite hermética en cualquier clone (sin depender del `.env.local` gitignored). Seguro porque (a) la config web de Firebase es **pública por diseño** —ya viaja en el bundle de prod— y (b) los unit tests no hacen llamadas de red reales (mockean o no autentican), así que dummies alcanzan para que `initializeApp`/`getAuth` no tiren. `.env.test` tiene mayor precedencia que `.env.local` en mode `test`, así que aplica igual local y en CI. **Reproducir CI local = ocultar `.env.local` y correr la suite con solo `.env.test`.** Vivo en [.env.test](../../.env.test). Detectado al introducir el workflow CI (gate lint+tsc+test, [.github/workflows/ci.yml](../../.github/workflows/ci.yml)).

**Lección generalizable:** ojo con módulos que ejecutan side-effects de init (conexiones, `getAuth`, clientes de SDK, `new X()` con validación) en el TOP-LEVEL — se disparan al **importarse**, no al usarse, así que cualquier test que toque su grafo de imports los ejecuta aunque no los ejercite. Dos defensas, no excluyentes: (1) env hermético commiteado (`.env.test`) para lo que necesite config; (2) preferir lazy-init (factory/función llamada on-demand) sobre side-effect de módulo cuando ese módulo vaya a ser importado por tests. Aplica a cualquier futuro client lib (analytics, Sentry, otro SDK) que inicialice al importarse.

## Harness E2E de callables contra el emulador (post-SPEC-55)

Para probar el gate de auth REAL de un callable (token → `request.auth`) — lo que el unit no puede — hay que invocarlo con el **client SDK** (`httpsCallable` + `connectFunctionsEmulator` + `connectAuthEmulator`, tokens reales del Auth emulator), no `firebase-functions-test` (que mockea el `CallableRequest`). Patrón vivo en [`e2e/`](../../e2e/) (`npm run test:functions` = `emulators:exec --only functions,auth,firestore`). Tres claves no obvias:

1. **`fileParallelism: false` (vitest) es obligatorio.** Los archivos comparten UN solo emulador (Firestore + Auth). En paralelo, el `clearFirestore`/`resetAuth` de un archivo en `beforeEach` pisa el estado de otro mid-flight, y los cold-starts concurrentes del Functions emulator devuelven **404 `functions/not-found`**. Ese `not-found` del client SDK es **error de ROUTING** (la función no se encontró), NO la lógica `not-found` de la CF — pista de debugging clave. Síntoma: 1 archivo solo pasa verde, varios juntos fallan en masa.
2. **Seed/clear con `@firebase/rules-unit-testing` standalone** (no solo para rules): `initializeTestEnvironment` + `clearFirestore` + `withSecurityRulesDisabled` (mismo patrón que `firestore.rules.test.ts`). Comparte el MISMO Firestore que ve el Admin SDK del runtime de functions **si coinciden** `projectId` + puerto 8080 + `singleProjectMode`.
3. **El Auth emulator NO se limpia con `clearFirestore`** → `beforeEach` con REST `DELETE /emulator/v1/projects/{projectId}/accounts` (header `Authorization: Bearer owner`, `fetch` global de Node 22). Emails fijos (admin estable), no únicos.

## `defineSecret().value()` en el emulador lee `.secret.local`, no `process.env` (post-SPEC-55)

El emulador de functions NO inyecta Secret Manager, y `defineSecret` **no** lee `process.env` (eso sería `defineString`). Para inyectar un secret de TEST (ej. `ADMIN_EMAIL`, que `requireAdmin` compara contra `token.email`): generar `src/functions/.secret.local` (`KEY=value`, una línea por secret) antes de `emulators:exec`. Una env var inline (`cross-env ADMIN_EMAIL=...`) NO sirve — setea la var en el proceso del script, no en el runtime forkeado del emulador. El archivo está **gitignoreado** (`*.local` raíz), así que se **genera en runtime** ([`scripts/emu-secret.mjs`](../../scripts/emu-secret.mjs), primer paso de `test:functions`): cero secret commiteado, reproducible local + CI. Valor de test, nunca el real. Verificación: un callable admin-gated devuelve datos (no `permission-denied`) = el secret se inyectó.

## CI: deps de `src/functions` y type-check con references (post-SPEC-55)

Dos trampas de CI/build que dan **verde local, rojo en CI** (o falso-verde silencioso):

- **`src/functions` es un proyecto npm independiente** (su propio `package-lock`). El `npm ci` del root NO instala sus deps. Los unit tests de functions (`requireAdmin`/`rateLimit`/`submitAccessRequest`, que corren en el `npm test` del root) importan `firebase-functions` → fallan en CI con `ERR_MODULE_NOT_FOUND`, aunque pasen local (donde `src/functions/node_modules` existe). El CI venía **rojo por esto** desde que se agregaron esos tests. Fix: step `working-directory: src/functions` + `npm ci --legacy-peer-deps` en `ci.yml`, antes de `npm test`. Misma familia que [Tests verdes local pero rojos en CI por env faltante](#tests-verdes-local-pero-rojos-en-ci-por-env-faltante-side-effects-de-init-en-el-top-level), distinta causa.
- **`tsc --noEmit` NO sigue project references.** Con el root `tsconfig.json` (`files: []` + `references`), `tsc --noEmit` chequea **0 archivos** → exit 0 trivial (no-op silencioso: el step "Type-check" de CI no protege ni `src/`). Para type-checkear de verdad: `tsc -b` (sigue references) o `tsc -p <tsconfig> --noEmit` directo. Por eso el harness usa un `tsconfig.e2e.json` standalone + `tsc -p tsconfig.e2e.json --noEmit` como gate dedicado en CI. (D9 cambió el step `tsc --noEmit` no-op del CI a `tsc -b`, que ahora sigue las references y type-checkea `src/` de verdad — el gate de tipos de CI dejó de ser un falso-verde.)

## Firebase MCP `firestore_query_collection` no acepta paths de subcolección con "/" (post-SPEC-56)

`firestore_query_collection({ collection_path: 'users/{uid}/notes', ... })` falla con `400 INVALID_ARGUMENT: Collection id "users/{uid}/notes" is invalid because it contains "/"` — el MCP trata el path completo como un único collection id, no como `parentCollection/parentDocument/collectionName`. Para barrer/consultar una subcolección por contenido (ej. notas de QA con prefijo), no usar el query: leer por `firestore_get_document` con el `docId` conocido (rastrear los ids creados durante la corrida) o barrer visualmente en la app. `firestore_get_document` y `firestore_delete_document` SÍ aceptan el path completo (`projects/.../documents/users/{uid}/notes/{id}`). Detectado en el gate F5 de SPEC-56 al intentar el barrido de huérfanas `QA-56-*`.

## Context7 MCP expone `query-docs`, no `get-library-docs` (nombre viejo)

El MCP de Context7 (`@upstash/context7-mcp@latest`, registrado en `.mcp.json`) expone `mcp__context7__query-docs` y `mcp__context7__resolve-library-id`. **`get-library-docs` es el nombre VIEJO y NO existe en `latest`** — referenciarlo (ej. en el `tools:`/`allowed-tools:` de un agente o slash command) deja una tool colgante que no resuelve. Usar siempre `query-docs`. Verificar el nombre real por schema (no de memoria ni de docs viejas): un `select` del tool por nombre confirma si existe. Detectado al montar el stack design-review (el agente de OneRedOak traía `get-library-docs` del Context7 viejo).

## Los subagentes leen archivos del cwd del proceso Claude Code, no del árbol del dev server

Un subagente (ej. el agente `design-review`, y subagentes en general) resuelve sus lecturas de archivo (`Read`/`Grep`/`Glob`) relativas al **cwd del proceso de Claude Code = el directorio principal**, NO al árbol de código que sirve el dev server al que apunta por HTTP. Relevante al correr en un **worktree** o con **otra rama checked-out en el dir principal**: un archivo puede existir en la rama del dev server y aun así "no existir" para el agente porque el dir principal está en otra rama. Síntoma concreto: el smoke de `/design-review` reportó `.claude/design-principles.md` como inexistente — el dir principal estaba en una rama i18n paralela, aunque el archivo sí vive en `chore/design-review-tooling` (la rama del worktree/dev server). El agente navega y audita la app correcta (vía URL) pero lee criterios/config del cwd equivocado. Implica: correr `/design-review` con la rama del tooling checked-out en el dir principal (o tras mergear a main).
