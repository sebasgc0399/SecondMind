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

```bash
npm run cap:sync   # build web + sync android
cd android
./gradlew.bat assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.secondmind.app/.MainActivity
```

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
