# Setup de desarrollo — Windows

Notas de setup específicas de Windows para entornos de desarrollo clonando este repo. Cosas que no pertenecen al briefing de sesión (CLAUDE.md) porque son one-time, no conocimiento operativo recurrente.

---

## TypeScript LSP plugin (`typescript-lsp@claude-plugins-official`)

El plugin oficial de Anthropic no funciona out-of-the-box en Windows por un bug de `child_process.spawn()` que no resuelve wrappers `.cmd` de npm global. Requiere patch manual al marketplace de plugins.

### Pasos

1. Instalar el language server global:

   ```bash
   npm install -g typescript-language-server
   ```

2. Agregar `C:\Users\<user>\AppData\Roaming\npm` al **PATH del sistema** (no del usuario).

3. Parchear `~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json`. Buscar la entrada `typescript-lsp` y cambiar:

   ```json
   "command": "node",
   "args": ["<ruta absoluta a typescript-language-server/lib/cli.mjs>", "--stdio"]
   ```

4. Habilitar en `~/.claude/settings.json`:

   ```json
   "typescript-lsp@claude-plugins-official": true
   ```

### Síntomas si el patch se perdió

`ENOENT: uv_spawn 'typescript-language-server'` en los logs del LSP. Claude Code puede actualizar el marketplace y sobrescribir el patch — reaplicar.

---

## `ui-ux-pro-max` skill — symlinks rotos

El skill instala symlinks en `~/.claude/plugins/cache/ui-ux-pro-max-skill/.../skills/ui-ux-pro-max/{scripts,data}` que apuntan a `src/ui-ux-pro-max/`. Sin Developer Mode de Windows (o con `git config core.symlinks false`), git clona los symlinks como archivos de texto con el path literal → el skill falla al ejecutar.

### Fix permanente

1. Activar **Developer Mode** en Windows (Settings → Update & Security → For developers).
2. `git config --global core.symlinks true`.
3. Reinstalar el plugin.

Los scripts reales viven en `src/ui-ux-pro-max/scripts/search.py` — útil saberlo si querés inspeccionar sin resolver los symlinks.

> **Prerequisito: Python 3 en PATH.** Las skills de búsqueda BM25 corren scripts Python: `ui-ux-pro-max` (`search.py`) y `gotchas-search` (`~/.claude/skills/gotchas-search/search.py`, F37). Sin `python` en PATH, ambas fallan.

---

## Firebase MCP con `node` directo (no `npx`)

`npx firebase@latest` falla con `Invalid Version`. Configurado en `.mcp.json` del repo con `node` apuntando al CLI local:

```json
"firebase": {
  "command": "node",
  "args": ["<ruta absoluta a firebase-tools/lib/bin/firebase.js>", "experimental:mcp"]
}
```

---

## Brave Search — variable de sistema

La `BRAVE_API_KEY` debe vivir en **variables de sistema Windows**, no en `.env.local`. El MCP de Brave Search lee del environment del proceso padre, no del dotenv de Vite.

---

## Capacitor Android — `cap run` falla

`npx cap run android` falla silenciosamente en Windows porque llama a `gradlew` sin `.bat`. Workaround:

```powershell
npm run cap:sync   # build web + sync android
cd android
.\gradlew.bat assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.secondmind.app/.MainActivity
```

> **`gradlew` vs `.\gradlew.bat` (divergencia intencional por shell):** a mano en PowerShell usá `.\gradlew.bat`. El script `npm run cap:build` invoca `gradlew` a secas (npm lo resuelve vía cmd). No unificar — cada forma es correcta para su shell.

Requiere `JAVA_HOME` y `ANDROID_HOME` como variables de sistema. Usar el JBR incluido con Android Studio:

```
JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
```

---

## `cargo` para Tauri

El primer `cargo build` tarda 5-10 minutos (~400 crates). Incrementales luego son 10-30s. Requiere Rust + MSVC Build Tools:

1. [rustup](https://rustup.rs/) con toolchain `stable-x86_64-pc-windows-msvc`.
2. **Visual Studio Build Tools** 2019+ con workload "Desktop development with C++".
3. WebView2 Runtime (pre-instalado en Windows 11, descargable para 10).

### Clave de firma del updater (ed25519)

El plugin `@tauri-apps/plugin-updater` está activo (`tauri.conf.json` tiene `pubkey` + `createUpdaterArtifacts: true`), así que el build de release **firma** los artefactos. La clave privada se genera una vez:

```powershell
npm run tauri signer generate -- -w $env:USERPROFILE\.tauri\secondmind.key
```

> **Gotcha de shell:** si pasás `"$USERPROFILE/..."` en cmd.exe la variable NO expande y se crea un dir literal `$USERPROFILE/`. Usá `%USERPROFILE%` (cmd) o `$env:USERPROFILE` (PowerShell). La private key + su password van al CI como secrets (`TAURI_SIGNING_PRIVATE_KEY` / `..._PASSWORD`), nunca al repo.

---

## Testing de Firestore rules — emulador

`npm run test:rules` corre los tests de security rules contra el **emulador de Firestore** (no toca prod):

```powershell
npm run test:rules
# = firebase emulators:exec --project=demo-secondmind --only firestore "vitest run --config vitest.rules.config.ts"
```

- Requiere un **JDK (Java) en PATH** — el emulador corre sobre la JVM. Sirve el mismo JBR de Android Studio (`JAVA_HOME`).
- Usa proyecto `demo-*` (sin credenciales reales), puerto Firestore 8080.
- Excluido del `npm test` default (que no necesita emulador) — vive en `vitest.rules.config.ts` aparte (F50).

---

## Secrets de Cloud Functions (Secret Manager)

Para desplegar/emular las Cloud Functions, un dev necesita los secrets en Secret Manager (`defineSecret`):

- **`BYOK_MASTER_KEY`** — master key de 32 bytes para cifrar/descifrar las API keys BYOK de los usuarios (AES-256-GCM). Generar 32 bytes aleatorios una vez y setear con `firebase functions:secrets:set BYOK_MASTER_KEY`.
- **`OPENAI_API_KEY`** — para `generateEmbedding`/`embedQuery` (embeddings siguen con la key del proyecto).
- **`ANTHROPIC_API_KEY`** — **ya NO se usa** (post-F48 la key de Anthropic es del usuario, BYOK). No setearla.
