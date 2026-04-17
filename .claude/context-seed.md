Soy Sebastián, trabajando en SecondMind (d:\Proyectos VS CODE\SecondMind) — sistema de productividad + conocimiento personal. Leé el CLAUDE.md del proyecto primero, tiene stack, convenciones y gotchas base.

## Estado del repo

Todas las fases 0–5.2 + Feature 1 (Responsive) + Feature 2 (Editor Polish) + Feature 3 (Búsqueda Híbrida) completadas y mergeadas a main. SecondMind corre en todas las plataformas:

- **Web (PWA)** — https://secondmind.web.app
- **Desktop Windows (Tauri)** — MSI + NSIS, system tray, Ctrl+Shift+Space global
- **Chrome Extension (MV3)** — web clip
- **Android (Capacitor)** — Google Sign-In nativo, Share Intent, responsive shell con BottomNav + FAB + safe-area

**Feature 3** (merge `159f224`): `/notes` combina keyword (Orama BM25 instant) con semántica (embeddings + cosine client-side, debounced 500ms). **Primera Cloud Function callable del proyecto** (`embedQuery` con `onCall` v2). Cache de embeddings module-level compartido entre `useSimilarNotes` y `useHybridSearch`. Threshold 0.30 (calibrado empíricamente — el 0.45 del SPEC dejaba los matches genuinos justo debajo).

4 CFs desplegadas en `us-central1`: `processInboxItem`, `autoTagNote`, `generateEmbedding`, `embedQuery`.

Working tree limpio (con drift cosmético conocido en `.claude/settings.json`, `Docs/01-*.md`, `Docs/03-*.md` — descartar antes de stagear).

## Metodología — SDD (Spec-Driven Development)

Cada feature sigue este ciclo:

1. Vos escribís un SPEC en `Spec/features/SPEC-feature-N-<nombre>.md` con: objetivo, F1–Fn (sub-features con criterio de done + archivos a tocar), orden de implementación, checklist de completado.
2. Me mandás el SPEC. Yo entro en plan mode y lo pulo:
   - Lanzo hasta 3 Explore agents en paralelo para mapear patrones existentes del código relacionado.
   - Si aplica UI/UX, hago recorrido con Playwright MCP en viewport real (375/768/1280) y capturo métricas concretas. El audit en vivo detecta cosas que un plan estático no ve.
   - Consulto context7 MCP si hay libs nuevas.
   - Escribo el plan refinado en `~/.claude/plans/` con: Contexto, Pre-requisitos descubiertos, Hallazgos del audit, Cambios sobre el SPEC, Patrones a reusar (con paths), Orden, Archivos, Decisiones clave, Verificación E2E, Criterio de done.
   - Te presento resumen en chat y te hago preguntas puntuales si el approach es ambiguo.
   - ExitPlanMode para que apruebes.
3. **Una rama por feature**: `feat/<nombre-corto>`. main está bloqueada por un PreToolUse hook que hace `exit 2`. Si la feature es chica consultame.
4. Commits atómicos conventional en español, uno por sub-feature (F1, F2…) más docs separado. Co-authored-by Claude.
5. **Testing E2E con Playwright MCP + Firebase MCP si aplica web**:
   - Dev server en background con `npm run dev`
   - UID para tests: `gYPP7NIo5JanxIbPqMe6nC3SQfE3` (Firebase: secondmindv1)
   - Cubrir golden path + edge cases + regresión
   - TaskStop el dev server al terminar
6. **Deploy pipeline completo al cerrar feature**:
   - CFs: `npm run deploy:functions` (si hay cambios)
   - Hosting: `npm run build && npm run deploy`
   - Tauri: `npm run tauri:build` → MSI + NSIS en `src-tauri/target/release/bundle/`
   - Android: `npx cap sync android && cd android && ./gradlew.bat assembleDebug`
7. Merge `--no-ff` a main con commit de merge descriptivo. Push a origin sin preguntar.
8. Al cerrar la feature: convertir el SPEC a registro de implementación siguiendo el patrón de `Spec/features/SPEC-feature-{1,2,3}-*.md`. Actualizar `Spec/ESTADO-ACTUAL.md` con patrones/gotchas/decisiones nuevas. Actualizar `CLAUDE.md` si hay comandos o gotchas de alcance general. Actualizar `README.md` si aplica.

## Estrategia de lectura de docs (IMPORTANTE)

- **Fuente primaria**: `Spec/ESTADO-ACTUAL.md`. Snapshot consolidado de toda arquitectura vigente, gotchas activos, patrones, deps clave. Reemplaza la necesidad de leer SPECs individuales.
- **NO leer SPECs** de fases/features anteriores (`Spec/SPEC-fase-*.md`, `Spec/features/SPEC-feature-*.md`) salvo que necesites detalle puntual que ESTADO-ACTUAL no cubre. Ahorra mucho token.
- `Docs/00–04-*.md` son principios teóricos y schemas — leer on-demand si la tarea lo requiere.
- `CLAUDE.md` ya está en el contexto automáticamente.

## Patrones establecidos clave (recordatorio rápido)

- **Auth universal**: `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))` — mismo patrón en Tauri, Chrome Extension, Capacitor. Solo cambia cómo se obtiene el idToken.
- **Quick Capture con meta**: `quickCapture.open(content?, { source?, sourceUrl? })` → `pendingMetaRef` → `save()`. Usar para cualquier entrypoint nuevo al inbox.
- **Escritura desde apps efímeras** (extension, Tauri capture): `setDoc` directo a Firestore con `source: '<origen>'`. Main app reconcilia vía `onSnapshot`.
- **TinyBase es la offline layer** — escrituras locales funcionan sin red; guards solo en features AI (Cloud Functions).
- **Breakpoints mobile-first** (mobile <768, tablet 768–1023, desktop ≥1024) con `useBreakpoint()` de `src/hooks/useMediaQuery.ts`. Render condicional JSX para shell, CSS para layouts internos.
- **Tap targets ≥44×44 en mobile**: label wrapper para Radix checkbox/switch, `min-h-11 min-w-11` para botones, visual interno puede seguir chico.
- **Safe-area vars granulares** (`--sai-top/bottom/left/right`) aplicadas por componente (MobileHeader top, BottomNav/FAB bottom), no globalmente en body.
- **`grid` en Tailwind**: siempre empezar con `grid-cols-1` explícito. Sin él, implicit columns crecen con content largo.
- **`truncate` requiere `min-w-0 flex-1`** en el span flex-child dentro de `<a class="flex">`.
- **Listener pattern para popups del editor TipTap**: `*-suggestion.ts` tiene `let activeListener = null` módulo-level + `setXMenuListener()`. Componente popup registra `{ onStart, onUpdate, onKeyDown, onExit }` en useEffect, render con `createPortal` + virtual anchor. Reusado en WikilinkMenu y SlashMenu.
- **Múltiples Suggestion plugins requieren `pluginKey: new PluginKey('nombre-único')`** explícito. Sin eso, TipTap tira `RangeError: Adding different instances of a keyed plugin`.
- **`allow()` blacklist > whitelist** para triggers de Suggestion. Rechazar si char previo matchea `/[a-zA-Z0-9]/`.
- **Context vía `.configure({ noteId })` en extensions TipTap depende de remount por ruta** — `page.tsx` debe pasar `key={noteId}` al `<NoteEditor>`. `currentUid` leerlo en runtime de `auth.currentUser?.uid`, no capturarlo en config.
- **Templates ProseMirror como `JSONContent[]`**: array de nodos que `editor.chain().focus().insertContent(template).run()` aplica directo. Sin parsing HTML/Markdown intermedio.
- **Cloud Functions callable (`onCall` v2)**: `import { onCall, HttpsError } from 'firebase-functions/v2/https'`. Signature `(request) => { request.auth?.uid; request.data }` — NO es v1 (`context.auth`). Cliente via `getFunctions(app, 'us-central1') + httpsCallable`. Referencia al callable se crea una vez a nivel de módulo.
- **Cache de embeddings module-level** (`src/lib/embeddings.ts`), no per-hook. Compartido entre `useSimilarNotes` y `useHybridSearch`. `getEmbeddingsCache(uid)` deduplica fetches concurrentes. `invalidateEmbeddingsCache()` en `signOut`.
- **Threshold empírico `text-embedding-3-small` + notas cortas en español: 0.30** (hybrid search). `SimilarNotesPanel` usa 0.5 por comparar notas completas.
- **Race handling async sin AbortController**: snapshot del query al inicio, `if (frozen !== current) return` al volver del CF. Firebase callable no expone abort.
- **Pipeline de dos fuentes (keyword + semantic) en orden estricto**: `filter (archived) → exclude (keyword IDs) → sort score desc → slice(0, N)`. Slice siempre al final.
- **`setState` dentro de `setTimeout` callback**, no síncrono en effect body, para pasar `react-hooks/set-state-in-effect`.

## Gotchas operativos

- **Vite `resolve.dedupe` para Firebase Y React** es pre-requisito del dev server. Sin `dedupe: ['react', 'react-dom', 'firebase', '@firebase/app', '@firebase/component', '@firebase/auth', '@firebase/firestore']` en `vite.config.ts`, el optimizer agarra copias desde `extension/node_modules/` y duplica registros. Firebase tira `Component auth has not been registered yet`; React tira `Invalid hook call`. **Reincidente tras cualquier `npm install`** que mueva el lockfile raíz.
- **Mismatch `firebase.json.runtime: nodejs20` vs `src/functions/package.json.engines.node: 22`**. `firebase.json` manda en deploy — runtime efectivo es Node 20. Si alguien alinea `firebase.json` a 22 sin coordinar, cambia el runtime de deploy sin otras señales.
- **Puerto Vite dev sube si ocupado** (5173 → 5174 → …). Leer del output del background task antes de navegar.
- **`--legacy-peer-deps` para todo `npm install`** (Vite 8 + vite-plugin-pwa + Tauri plugins + Capacitor plugins + `@tiptap/extension-*` no declaran Vite 8 en peerDeps pero funcionan).
- **Capacitor Android SW cache persiste entre reinstalaciones del APK**. Al testear cambios grandes: desinstalar completo antes de `adb install` o borrar caché desde Ajustes de Android.
- **Cosmetic drift recurrente**: `.claude/settings.json`, `Docs/01-arquitectura-hibrida-progresiva.md`, `Docs/03-convenciones-y-patrones.md` a veces se modifican solos por el formatter. `git checkout -- <path>` antes de stagear.
- **Node ProseMirror `atom: true` + `contenteditable="false"` NO emite textContent en DOM**. En tests E2E usar `editor.getText()` de TipTap, no `document.querySelector('.ProseMirror').textContent`.
- **Playwright MCP a veces deja `user-data-dir` bloqueado en Windows** tras un crash. Si `browser_navigate` tira "Browser is already in use", matar procesos con `wmic process where "name='chrome.exe'" get ProcessId,CommandLine | grep mcp-chrome-` y `taskkill //PID <id> //F`.

## Build y distribución

```bash
# Web
npm run build && npm run deploy

# Cloud Functions
npm run deploy:functions

# Tauri (MSI + NSIS)
npm run tauri:build
# → src-tauri/target/release/bundle/{msi,nsis}/

# Android (workaround Windows obligatorio por gradlew sin .bat)
npm run build && npx cap sync android
cd android && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" \
  ANDROID_HOME="$HOME/AppData/Local/Android/Sdk" ./gradlew.bat assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

## Preferencias de comunicación

- Respuestas en español, concisas, sin emojis en archivos (ni commits ni código).
- No explicar lo obvio ni recapitular lo que ya hice.
- Si algo se desvía del plan, decirlo antes de ejecutar.
- Resumen de cierre breve con commit hashes, archivos tocados, lo verificado E2E, bugs encontrados.
- No preguntar "¿arrancamos?" después del plan aprobado — asumir que sí.
- Si necesito hacer algo manual (instalar SDK, cuenta en servicio, emulador), pedírmelo con pasos concretos.
- `git push` sin preguntar tras commit/merge.
- Deploy de CFs / hosting / rebuild de APK-MSI: confirmar el scope del deploy al cerrar feature, no cada paso.
