# SPEC — SecondMind · Feature 8: Tauri Auto-Updater

> Alcance: Auto-actualización in-app para la versión desktop (Windows/NSIS). CI con GitHub Actions dispara build al crear tag. Binarios y `latest.json` hosteados en GitHub Releases.
> Dependencias: Fase 5.1 (Tauri Desktop) + Feature 7 completadas
> Estimado: 1-2 sesiones de trabajo
> Stack relevante: Tauri v2 (`tauri-plugin-updater`, `tauri-plugin-process`), GitHub Actions, `tauri-apps/tauri-action`

---

## Objetivo

El usuario de la app desktop recibe una notificación al iniciar SecondMind cuando hay una versión nueva disponible. Puede aceptar la actualización, que se descarga e instala automáticamente, y la app se reinicia con la versión nueva. El developer (yo) solo necesita crear un tag (`git tag v0.2.0 && git push --tags`) para que el CI compile, firme, y publique la release completa.

---

## Features

### F1: Generar signing keypair + configurar GitHub secrets

**Qué:** Generar el par de llaves de firma de Tauri y almacenar la clave privada como secret en el repo de GitHub. La clave pública va en `tauri.conf.json`.

**Criterio de done:**

- [ ] Keypair generado con `tauri signer generate`
- [ ] `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` configurados como secrets en el repo de GitHub
- [ ] Clave pública agregada a `tauri.conf.json` bajo `plugins.updater.pubkey`
- [ ] Clave privada almacenada en ubicación segura local (backup fuera de GitHub)

**Archivos a modificar:**

- `src-tauri/tauri.conf.json` — agregar sección `plugins.updater`

**Notas de implementación:**

- `tauri signer generate -w ~/.tauri/secondmind.key` genera `secondmind.key` (privada) y `secondmind.key.pub` (pública).
- La clave privada NUNCA se commitea. Va como GitHub secret + backup local (ej. password manager).
- Si se pierde la clave privada, los usuarios con la app instalada NO pueden recibir updates firmados con una clave nueva — habría que reinstalar.

---

### F2: Instalar y configurar plugins updater + process

**Qué:** Agregar `tauri-plugin-updater` y `tauri-plugin-process` al proyecto. Configurar el endpoint de updates apuntando a GitHub Releases. Registrar plugins en `lib.rs` y agregar capabilities.

**Criterio de done:**

- [ ] `tauri-plugin-updater` y `tauri-plugin-process` en `Cargo.toml` (target desktop only)
- [ ] `@tauri-apps/plugin-updater` y `@tauri-apps/plugin-process` en `package.json`
- [ ] Plugins registrados en `src-tauri/src/lib.rs` dentro de `setup()`
- [ ] Capabilities agregadas a `src-tauri/capabilities/default.json`
- [ ] `tauri.conf.json` tiene config completa del updater (endpoint, pubkey, installMode)
- [ ] `cargo check` pasa sin warnings

**Archivos a modificar:**

- `src-tauri/Cargo.toml` — agregar deps con target desktop
- `package.json` — agregar deps npm
- `src-tauri/src/lib.rs` — registrar plugins
- `src-tauri/capabilities/default.json` — agregar permissions updater + process
- `src-tauri/tauri.conf.json` — config updater (endpoint, pubkey, installMode, createUpdaterArtifacts)

**Config esperada en `tauri.conf.json`:**

```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://github.com/USUARIO/secondmind/releases/latest/download/latest.json"],
      "pubkey": "CONTENIDO_DE_secondmind.key.pub",
      "windows": {
        "installMode": "passive"
      }
    }
  },
  "bundle": {
    "createUpdaterArtifacts": "v2Compatible"
  }
}
```

**Notas de implementación:**

- `installMode: "passive"` instala sin interacción del usuario (muestra barra de progreso pero no pide clicks). Alternativas: `"basicUi"` (wizard), `"quiet"` (invisible).
- `createUpdaterArtifacts: "v2Compatible"` genera los `.sig` junto a los instaladores.
- Deps Rust con target condicional: `[target.'cfg(any(target_os = "macos", windows, target_os = "linux"))'.dependencies]` — no se cargan en Android/iOS.
- Permissions necesarias: `updater:default`, `process:allow-restart`, `process:allow-exit`.

---

### F3: UI de actualización in-app

**Qué:** Hook que chequea updates al iniciar la app + item en el menú del tray para check manual. Si hay update, muestra diálogo nativo preguntando al usuario. Al aceptar: descarga, instala, reinicia.

**Criterio de done:**

- [ ] Al iniciar la app, se chequea silenciosamente si hay update (sin bloquear la UI)
- [ ] Si hay update disponible, aparece diálogo nativo con versión nueva + release notes + botón "Actualizar" / "Después"
- [ ] Al aceptar, la app descarga el update, lo instala (NSIS passive) y se reinicia
- [ ] Al rechazar, la app sigue normal — no vuelve a preguntar hasta el próximo inicio
- [ ] Item "Buscar actualizaciones" en el menú del tray permite check manual
- [ ] Si no hay update en check manual, muestra diálogo "Estás en la última versión"
- [ ] Versión actual visible en la página Settings (lectura de `tauri.conf.json` version)
- [ ] Errores de red (sin internet, endpoint caído) se manejan silenciosamente en check automático, con notificación en check manual

**Archivos a crear:**

- `src/hooks/useAutoUpdate.ts` — hook con lógica de check + download + install

**Archivos a modificar:**

- `src-tauri/src/tray.rs` — agregar item "Buscar actualizaciones" al menú
- `src-tauri/src/lib.rs` — agregar Tauri command `check_for_updates` para el tray
- `src/app/settings/page.tsx` — mostrar versión actual
- `src/main.tsx` — invocar `useAutoUpdate()` en `TauriIntegration`

**Snippet de referencia (hook JS):**

```ts
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask, message } from '@tauri-apps/plugin-dialog';

export function useAutoUpdate() {
  useEffect(() => {
    if (!isTauri()) return;
    checkForUpdates(false); // silent on startup
  }, []);
}

async function checkForUpdates(userInitiated: boolean) {
  try {
    const update = await check();
    if (update?.available) {
      const accepted = await ask(`Versión ${update.version} disponible.\n\n${update.body ?? ''}`, {
        title: 'Actualización disponible',
        okLabel: 'Actualizar',
        cancelLabel: 'Después',
      });
      if (accepted) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } else if (userInitiated) {
      await message('Estás en la última versión.', {
        title: 'Sin actualizaciones',
        okLabel: 'OK',
      });
    }
  } catch (err) {
    console.error('Update check failed:', err);
    if (userInitiated) {
      await message('No se pudo verificar actualizaciones. Verificá tu conexión.', {
        title: 'Error',
        okLabel: 'OK',
      });
    }
  }
}
```

**Notas de implementación:**

- `tauri-plugin-dialog` ya puede estar disponible. Si no, agregar dep (`cargo add tauri-plugin-dialog`, `npm add @tauri-apps/plugin-dialog`).
- El check automático al startup debe tener un delay (~5s) para no competir con la hidratación de Firestore/TinyBase.
- F7 lección: hooks en `main.tsx` se montan en TODAS las ventanas. Guard con `getCurrentWebviewWindow().label === 'main'` para que solo la main window chequee updates.
- El item "Buscar actualizaciones" del tray dispara un Tauri command que ejecuta el check desde Rust (mismo patrón que el global shortcut post-F7: lógica OS-level en Rust).
- `installMode: "passive"` en Windows cierra la app automáticamente para instalar — advertir al usuario en el diálogo.

---

### F4: GitHub Actions workflow para release

**Qué:** Workflow de CI que se dispara al crear un tag `v*`, compila la app Tauri en Windows, firma los artefactos, y crea un GitHub Release con los binarios + `latest.json`.

**Criterio de done:**

- [ ] `.github/workflows/release.yml` existe y es válido
- [ ] Push de tag `v0.2.0` dispara el workflow automáticamente
- [ ] El workflow compila exitosamente en runner `windows-latest`
- [ ] GitHub Release creado con: `.exe` NSIS, `.exe.sig`, `latest.json`
- [ ] `latest.json` tiene la estructura correcta (version, platforms, url, signature)
- [ ] Las URLs en `latest.json` apuntan a los assets del mismo Release
- [ ] El workflow está diseñado para que Feature 9 (Capacitor) agregue un job sin modificar el existente

**Archivo a crear:**

- `.github/workflows/release.yml`

**Estructura del workflow:**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release-tauri:
    runs-on: windows-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install frontend deps
        run: npm ci

      - name: Build & Release Tauri
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'SecondMind ${{ github.ref_name }}'
          releaseBody: 'Release automática de SecondMind desktop.'
          releaseDraft: false
          prerelease: false
          includeUpdaterJson: true

  # Feature 9 agregará aquí:
  # release-capacitor:
  #   runs-on: ubuntu-latest
  #   ...
```

**Notas de implementación:**

- `tauri-apps/tauri-action` hace todo el heavy lifting: instala deps de Rust si faltan, compila, firma, crea Release, genera `latest.json`.
- `includeUpdaterJson: true` genera el `latest.json` como asset del Release — el endpoint de `tauri.conf.json` lo consume directamente.
- `GITHUB_TOKEN` lo provee GitHub Actions automáticamente (no hay que crear este secret).
- `permissions: contents: write` es necesario para que el token pueda crear Releases.
- El job se llama `release-tauri` (no `release`) para que F9 agregue `release-capacitor` al lado.
- **Variables de entorno de Firebase** (VITE*FIREBASE*\*): si están definidas en `.env` local pero no en CI, el build falla. Agregar como GitHub secrets o como env vars en el workflow si son necesarias para el build del frontend.

---

### F5: Estrategia de versionado

**Qué:** Definir convención de versionado y proceso para bump de versión antes de crear un tag.

**Criterio de done:**

- [ ] `tauri.conf.json`, `Cargo.toml` y `package.json` sincronizados en la misma versión
- [ ] Script o documentación del proceso de bump (`npm version patch/minor` o manual)
- [ ] `Cargo.lock` actualizado tras bump de `Cargo.toml`
- [ ] Commit de bump es el último antes del tag: `chore: bump version to 0.2.0`

**Archivos a modificar:**

- `src-tauri/tauri.conf.json` — `version`
- `src-tauri/Cargo.toml` — `package.version`
- `package.json` — `version`

**Notas de implementación:**

- Hoy `tauri.conf.json` y `Cargo.toml` están en `0.1.0`, `package.json` en `0.0.0` (D10 de Fase 5.1). Sincronizar los tres a `0.1.0` como baseline antes del primer release.
- Semver: `patch` para bugfixes (0.1.1), `minor` para features (0.2.0), `major` reservado.
- Proceso de release: `bump versión en 3 archivos → commit → tag → push --tags`. Puede automatizarse con un script si el proceso manual se vuelve tedioso.
- El updater de Tauri compara la versión del `latest.json` contra la versión de `tauri.conf.json` compilada en la app. Si `latest.json` es mayor, ofrece update.

---

## Decisiones clave

| #   | Decisión                                                   | Razón                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | GitHub Releases para binarios, no Firebase Hosting         | Repo es público → assets accesibles sin auth. `tauri-action` genera Release + `latest.json` automáticamente. Firebase agregaría complejidad (deploy credentials en CI, upload manual de binarios de ~40MB). Se mantiene toda la infra de updates en GitHub. |
| D2  | Tag-based trigger, no push-to-main ni manual               | Un tag = una versión. Evita releases accidentales por merge. Permite agregar job de Capacitor (F9) al mismo trigger sin cambios.                                                                                                                            |
| D3  | Check automático al startup con delay 5s                   | No bloquear la hidratación inicial. Check silencioso — solo muestra UI si hay update.                                                                                                                                                                       |
| D4  | Diálogo nativo (`tauri-plugin-dialog`), no custom React UI | Más simple, funciona antes de que React monte, patrón estándar de Tauri.                                                                                                                                                                                    |
| D5  | `installMode: "passive"`                                   | Muestra progreso sin wizard. Balance entre `quiet` (el usuario no ve nada) y `basicUi` (requiere clicks).                                                                                                                                                   |
| D6  | Guard `label === 'main'` en el hook                        | F7 lección: hooks en `main.tsx` corren en todas las ventanas. Solo main debe chequear updates.                                                                                                                                                              |
| D7  | Workflow diseñado para F9                                  | Job `release-tauri` con nombre específico + comentario placeholder para `release-capacitor`. Un solo workflow, un solo trigger.                                                                                                                             |

---

## Orden de implementación

1. **F1** (signing keys) → bloqueante para todo. Sin llaves no se puede firmar ni configurar el endpoint.
2. **F5** (versionado) → sincronizar versiones antes de configurar el updater.
3. **F2** (plugins + config) → necesita la pubkey de F1 y la versión de F5.
4. **F3** (UI) → necesita los plugins de F2 instalados.
5. **F4** (CI) → necesita los secrets de F1 y la config de F2. Se testea último porque requiere push de tag real.

**Commits atómicos:**

- C1: `chore(tauri): generate updater signing keys + configure pubkey`
- C2: `chore: sync version to 0.1.0 across tauri.conf.json, Cargo.toml, package.json`
- C3: `feat(tauri): add updater + process plugins with capabilities`
- C4: `feat(tauri): auto-update check on startup + tray menu item`
- C5: `ci: add GitHub Actions release workflow for Tauri desktop`

---

## Estructura de archivos

```
.github/
└── workflows/
    └── release.yml                    ← F4: CI workflow tag-based

src-tauri/
├── tauri.conf.json                    ← F1+F2: updater config (endpoint, pubkey, installMode)
├── Cargo.toml                         ← F2+F5: plugin deps + version sync
├── capabilities/
│   └── default.json                   ← F2: permissions updater + process + dialog
└── src/
    ├── lib.rs                         ← F2+F3: register plugins + update command
    └── tray.rs                        ← F3: item "Buscar actualizaciones"

src/
├── hooks/
│   └── useAutoUpdate.ts               ← F3: check + download + install + relaunch
├── app/
│   └── settings/
│       └── page.tsx                   ← F3: mostrar versión actual
└── main.tsx                           ← F3: invocar useAutoUpdate en TauriIntegration
```

---

## Checklist de completado

Al terminar esta feature, TODAS estas condiciones deben ser verdaderas:

- [ ] Signing keypair generado y clave privada almacenada segura (local + GitHub secret)
- [ ] `cargo check` y `tsc --noEmit` pasan sin errores
- [ ] `npm run tauri:dev` inicia sin errores con los plugins nuevos
- [ ] Versiones sincronizadas en los 3 archivos (tauri.conf.json, Cargo.toml, package.json)
- [ ] Push de tag `v0.1.0` (o `v0.2.0` si ya se bumpeó) dispara el workflow de CI
- [ ] GitHub Release creado automáticamente con `.exe`, `.exe.sig` y `latest.json`
- [ ] App instalada con versión anterior detecta la nueva versión al iniciar
- [ ] Diálogo de actualización aparece con versión + release notes
- [ ] Al aceptar: descarga, instala (NSIS passive), reinicia con versión nueva
- [ ] Al rechazar: app sigue normal, no vuelve a preguntar hasta próximo inicio
- [ ] "Buscar actualizaciones" en tray funciona (con update y sin update)
- [ ] Versión actual visible en Settings
- [ ] Sin regresiones: tray, capture, autostart, window-state, single-instance

---

## Out of scope

- Code signing de Windows (certificado para eliminar SmartScreen warning — cuesta dinero, no es necesario para el updater)
- Build para macOS o Linux (solo Windows por ahora)
- Release notes automáticas desde commits (se escribe manualmente o se deja el default del workflow)
- Capacitor auto-update (Feature 9)
- Rollback a versión anterior
- Canal de updates beta/nightly (se evalúa si hace falta — hoy solo `latest`)
- Notificación push de update (el check es pull, al iniciar la app)

---

## Siguiente feature

**Feature 9: Capacitor Auto-Update (Android).** Agrega job `release-capacitor` al mismo `release.yml`, build APK con Gradle, distribución via Firebase App Distribution o Play Store. Mismo trigger tag-based.
